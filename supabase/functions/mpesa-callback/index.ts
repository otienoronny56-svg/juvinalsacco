import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

	try {
		const payload = await req.json()
		console.log("CALLBACK RECEIVED:", JSON.stringify(payload))

		// 1. Unpack Data from M-Pesa STK Response
		const { Body } = payload
		const { stkCallback } = Body
		const { ResultCode, CallbackMetadata, CheckoutRequestID } = stkCallback // We use CheckoutRequestID to link!

		if (ResultCode !== 0) {
			console.log("Transaction Failed/Cancelled - ResultCode:", ResultCode)
			return new Response("Ok", { status: 200, headers: corsHeaders }) 
		}

		const items = CallbackMetadata?.Item || []
		const amountItem = items.find((i: any) => i.Name === "Amount")
		const receiptItem = items.find((i: any) => i.Name === "MpesaReceiptNumber")
		const phoneItem = items.find((i: any) => i.Name === "PhoneNumber")

		const amount = amountItem?.Value
		const receipt = receiptItem?.Value
		const mpesaPhone = phoneItem?.Value.toString() // e.g., 254745806488

		// 2. SMART PHONE MATCHING
		const corePhone = mpesaPhone.substring(mpesaPhone.length - 9)

		console.log(`📱 Payment received: ${amount} from ${mpesaPhone} (${corePhone})`)
		console.log(`📋 Receipt: ${receipt}`)

		// 3. Admin Connection
		const supabaseUrl = Deno.env.get('SB_URL') ?? ''
		const supabaseKey = Deno.env.get('SB_KEY') ?? ''
		console.log(`🔧 ENV CHECK - URL length: ${supabaseUrl.length}, KEY length: ${supabaseKey.length}`)
		if (!supabaseUrl || !supabaseKey) {
			console.error('❌ Missing env vars: SB_URL or SB_KEY not set')
			return new Response('Server config error', { status: 500, headers: corsHeaders })
		}
		const supabase = createClient(supabaseUrl, supabaseKey)

		// Helper: insert ledger entry and update account balance
		// MOVED UP to prevent "access before initialization" error
		const creditAccount = async (accountName: string, txId: string, amt: number, desc: string) => {
			try {
				const { data: acc } = await supabase.from('accounts').select('id, balance').eq('name', accountName).limit(1).single();
				if (!acc) {
					console.warn(`⚠️ Account not found: ${accountName}`)
					return { ok: false, error: 'account_not_found' }
				}

				const { data: ledgerRow, error: ledgerErr } = await supabase.from('ledger_entries').insert({
					account_id: acc.id,
					transaction_id: txId,
					entry_type: 'credit',
					amount: amt,
					description: desc
				}).select().limit(1).single()

				if (ledgerErr) {
					console.error('❌ Ledger insert error:', ledgerErr)
					return { ok: false, error: ledgerErr }
				}

				const newBal = Number(acc.balance || 0) + Number(amt)
				const { error: accErr } = await supabase.from('accounts').update({ balance: newBal }).eq('id', acc.id)
				if (accErr) {
					console.error('❌ Account update error:', accErr)
					return { ok: false, error: accErr }
				}

				return { ok: true, ledgerRow, newBal }
			} catch (e) {
				console.error('Exception in creditAccount:', e)
				return { ok: false, error: e }
			}
		}

		// 3.5 EXACT MATCH CHECK (Link by Request ID)
		// Check if we have a pending transaction with this CheckoutRequestID (Deposit)
		const { data: pendingTx } = await supabase
			.from('transactions')
			.select('*')
			.eq('mpesa_code', CheckoutRequestID) // We stored CheckoutRequestID here in mpesa-push
			.eq('status', 'pending')
			.single()

		// Check if we have a pending repayment with this CheckoutRequestID (Repayment)
		const { data: pendingRepay } = await supabase
			.from('repayments')
			.select('*')
			.eq('mpesa_code', CheckoutRequestID)
			.eq('status', 'pending')
			.single()

		let targetUserId = null
		let isExactMatch = false

		if (pendingTx) {
			console.log(`🎯 EXACT MATCH: Found pending deposit for User ${pendingTx.user_id}`)
			targetUserId = pendingTx.user_id
			isExactMatch = true
			
			// Update the transaction with the REAL receipt number
			await supabase.from('transactions')
				.update({ mpesa_code: receipt, status: 'completed' })
				.eq('id', pendingTx.id)
				
			// Credit Paybill
			await creditAccount('paybill', pendingTx.id, Number(amount), 'Deposit (M-Pesa)')
			
			// Update Balance
			const { data: profile } = await supabase.from('profiles').select('savings_balance').eq('id', targetUserId).single()
			const currentBal = Number(profile?.savings_balance || 0)
			const newBal = currentBal + Number(amount)
			
			const { error: balErr } = await supabase.from('profiles').update({ savings_balance: newBal }).eq('id', targetUserId)
			
			if (balErr) console.error(`❌ Failed to update balance for ${targetUserId}:`, balErr)
			else console.log(`✅ Balance updated (Exact Match): ${currentBal} -> ${newBal}`)
			
			return new Response('Deposit Matched & Processed', { status: 200, headers: corsHeaders })
		}

		if (pendingRepay) {
			console.log(`🎯 EXACT MATCH: Found pending repayment for User ${pendingRepay.user_id}`)
			targetUserId = pendingRepay.user_id
			isExactMatch = true
			// We will let the logic below handle the loan update, but we force the user ID
		}

		// 4. IDEMPOTENCY CHECK (If not exact match processed above)
		const { data: existingTx } = await supabase
			.from('transactions')
			.select('id')
			.eq('mpesa_code', receipt)
			.limit(1)

		if (existingTx && existingTx.length > 0) {
			console.log(`✅ Receipt already processed, skipping duplicate: ${receipt}`)
			return new Response('Already processed', { status: 200, headers: corsHeaders })
		}

		// 5. Find User (If not already found by Exact Match)
		let user = null;
		if (targetUserId) {
			const { data: u } = await supabase.from('profiles').select('id, phone, savings_balance').eq('id', targetUserId).single()
			user = u
		} else {
			// Fallback to Phone Matching
			const { data: u } = await supabase
			.from('profiles')
			.select('id, phone, registration_fee_paid, savings_balance')
			.ilike('phone', `%${corePhone}%`)
			.order('created_at', { ascending: false }) // Pick newest if duplicates exist
			.limit(1)
			.single()
			user = u
		}

		if (!user) {
			console.error(`❌ User not found for ${corePhone}`)
			return new Response("User not found", { status: 200, headers: corsHeaders })
		}

		console.log(`✅ Found user: ${user.id}`)

		// 5. Check for pending repayment matching this amount
		const { data: pendingRepayment } = await supabase
			.from('repayments')
			.select('id, loan_id, amount')
			.eq('user_id', user.id)
			.eq('status', 'pending')
			// If we have an exact match repayment, use its ID, otherwise find by amount
			.or(pendingRepay ? `id.eq.${pendingRepay.id}` : `amount.eq.${amount}`)
			.order('created_at', { ascending: false })
			.limit(1)
			.single()

		// 5. Determine Transaction Type

		// CASE B: Loan Repayment
		if (pendingRepayment && Number(amount) === Number(pendingRepayment.amount)) {
			console.log(`💳 REPAYMENT CALLBACK - Repayment ID: ${pendingRepayment.id}`)

			// Update repayment record
			const { error: repayError } = await supabase
				.from('repayments')
				.update({ status: 'confirmed', mpesa_code: receipt, confirmed_at: new Date().toISOString() })
				.eq('id', pendingRepayment.id)

			if (repayError) {
				console.error('❌ Failed to update repayment:', repayError)
				return new Response('Error updating repayment', { status: 200, headers: corsHeaders })
			}

			// Update loan totals
			const { data: loan } = await supabase.from('loans').select('id, amount, total_repaid, status').eq('id', pendingRepayment.loan_id).single()
			if (loan) {
				const newTotal = Number(loan.total_repaid || 0) + Number(amount)
				const totalDue = Number(loan.amount) + (Number(loan.amount) * 0.10)
				const newStatus = newTotal >= totalDue ? 'closed' : 'active'
				const { error: loanError } = await supabase.from('loans').update({ total_repaid: newTotal, status: newStatus }).eq('id', loan.id)
				if (loanError) console.error('❌ Failed to update loan:', loanError)
				else console.log('✅ Loan updated - Total repaid:', newTotal)
			}

			// Create transaction record
			const { data: transRow, error: transError } = await supabase.from('transactions').insert({
				user_id: user.id,
				type: 'repayment',
				amount: amount,
				mpesa_code: receipt,
				status: 'completed'
			}).select().limit(1).single()

			if (transError) {
				console.error('❌ Failed to create repayment transaction:', transError)
			} else {
				console.log('✅ Repayment transaction recorded:', transRow.id)
				const res = await creditAccount('paybill', transRow.id, Number(amount), 'Loan repayment (M-Pesa)')
				if (!res.ok) console.error('❌ Failed to credit paybill for repayment:', res.error)
				else console.log('✅ Paybill credited (repayment). New balance:', res.newBal)
			}

			return new Response('Repayment processed', { status: 200, headers: corsHeaders })
		}

		// CASE C: Savings Deposit (Default)
		console.log('💳 DEPOSIT CALLBACK - Creating transaction')
		const { data: depositRow, error: depositError } = await supabase.from('transactions').insert({
			user_id: user.id,
			type: 'deposit',
			amount: amount,
			mpesa_code: receipt,
			status: 'completed'
		}).select().limit(1).single()

		if (depositError) {
			console.error('❌ Failed to create deposit transaction:', depositError)
			return new Response('Error', { status: 200, headers: corsHeaders })
		}

		console.log('✅ Deposit saved - Receipt:', receipt)

		// Update member savings
		const currentBalance = Number(user.savings_balance || 0)
		const newBalance = currentBalance + Number(amount)
		const { error: balanceError } = await supabase.from('profiles').update({ savings_balance: newBalance }).eq('id', user.id)

		if (balanceError) console.error('❌ Failed to update savings balance:', balanceError)
		else console.log(`✅ Savings balance updated for ${user.id}: ${currentBalance} + ${amount} = ${newBalance}`)

		// Ledger + paybill update for deposit
		const depRes = await creditAccount('paybill', depositRow.id, Number(amount), 'Deposit (M-Pesa)')
		if (!depRes.ok) console.error('❌ Failed to credit paybill for deposit:', depRes.error)
		else console.log('✅ Paybill credited (deposit). New balance:', depRes.newBal)

		return new Response('Success', { status: 200, headers: corsHeaders })

	} catch (error) {
		console.error('🚨 Callback Error:', error)
		return new Response('Error', { status: 400, headers: corsHeaders })
	}
})