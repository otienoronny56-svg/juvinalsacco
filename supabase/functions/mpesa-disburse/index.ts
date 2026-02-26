// supabase/functions/mpesa-disburse/index.ts
// Handles both Loan Disbursements and Withdrawal Approvals
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. SETUP HEADERS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 2. START SERVER (The Modern Way)
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. GET PARAMETERS (From both query string and body)
    const url = new URL(req.url)
    let loanId = url.searchParams.get('loanId') || null
    let withdrawalId = url.searchParams.get('withdrawalId') || null
    let repaymentId = url.searchParams.get('repaymentId') || null
    let amount = url.searchParams.get('amount') || null
    let phone = url.searchParams.get('phone') || null
    let userId = url.searchParams.get('userId') || null
    let disburseMethod = url.searchParams.get('method') || 'mpesa' // Default to mpesa

    // Try reading from body if query params not found
    if (!loanId && !withdrawalId && !repaymentId) {
        const rawBody = await req.text()
        if (rawBody) {
            try {
                const bodyData = JSON.parse(rawBody)
                loanId = bodyData.loanId || null
                withdrawalId = bodyData.withdrawalId || null
                repaymentId = bodyData.repaymentId || null
                amount = bodyData.amount || amount
                phone = bodyData.phone || phone
                userId = bodyData.userId || userId
                disburseMethod = bodyData.method || disburseMethod
            } catch(e) {
                console.log("No JSON body to parse")
            }
        }
    }

    // Validation: Must have either loanId or withdrawalId
    if (!loanId && !withdrawalId && !repaymentId) {
        throw new Error("Missing transaction ID (loanId, withdrawalId, or repaymentId)")
    }
    
    amount = parseFloat(amount)
    
    // Determine transaction type (loan or withdrawal)
    const txType = withdrawalId ? 'withdrawal' : repaymentId ? 'repayment' : 'loan'
    
    console.log(`Processing ${txType}: ID=${loanId || withdrawalId || repaymentId}, amount=${amount}`)

    // Setup Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get borrower info for loans
    let borrowerId = userId
    if (txType === 'loan' && loanId) {
        const { data: loan, error: loanError } = await supabase.from('loans').select('borrower_id').eq('id', loanId).single()
        if (loanError || !loan) {
            console.error(`❌ Loan lookup failed for ${loanId}:`, loanError)
            throw new Error("Loan record not found")
        }
        borrowerId = loan.borrower_id
    }

    // Fetch phone if missing (Fix for "phone no. not found")
    if (!phone && borrowerId) {
        const { data: profile } = await supabase.from('profiles').select('phone').eq('id', borrowerId).single()
        if (profile && profile.phone) {
            phone = profile.phone
            console.log(`✅ Fetched phone ${phone} for borrower ${borrowerId}`)
        }
    }

    // Handle Disbursement Based on Method
    let simulatedResponse = {
        "ConversationID": "AG_202302_" + Math.floor(Math.random() * 10000),
        "OriginatorConversationID": "12345-" + Math.floor(Math.random() * 10000),
        "ResponseCode": "0",
        "ResponseDescription": "Accept the service request successfully."
    }

    // Only execute disbursement logic (adding money) for LOANS
    if (txType === 'loan') {
        if (disburseMethod === 'savings') {
            // METHOD 1: Add to Savings Account
            // NOTE: We do NOT deduct from Paybill here because money hasn't left the bank yet.
            console.log(`Disbursing KES ${amount} to savings account for borrower ${borrowerId}`)

            const { data: borrower } = await supabase
                .from('profiles')
                .select('savings_balance')
                .eq('id', borrowerId)
                .single()

            if (!borrower) throw new Error("Borrower not found")

            const newBalance = (borrower.savings_balance || 0) + amount

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ savings_balance: newBalance })
                .eq('id', borrowerId)

            if (updateError) throw new Error("Failed to update savings: " + updateError.message)

            console.log(`Savings updated: ${borrower.savings_balance} → ${newBalance}`)
        } else {
            // METHOD 2: M-Pesa B2C Disbursement (Default)
            // 4. SANITIZE PHONE
            if (!phone) throw new Error(`Borrower phone number not found (User ID: ${borrowerId})`)
            
            let formattedPhone = phone.replace(/\D/g, '') 
            if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.substring(1)
            if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1)

            console.log(`Disbursing KES ${amount} to M-Pesa ${formattedPhone}...`)

            // DEDUCT FROM PAYBILL ACCOUNT (Money leaving the bank)
            const { data: acc } = await supabase.from('accounts').select('id, balance').eq('name', 'paybill').single()
            if (acc) {
                const currentPaybill = Number(acc.balance || 0)
                if (currentPaybill < amount) {
                    throw new Error(`Insufficient Paybill Balance (KES ${currentPaybill}) to disburse loan.`)
                }

                const newAccBal = currentPaybill - amount
                await supabase.from('accounts').update({ balance: newAccBal }).eq('id', acc.id)
                
                await supabase.from('ledger_entries').insert({
                    account_id: acc.id,
                    transaction_id: loanId, // Link to loan ID
                    entry_type: 'debit',
                    amount: amount,
                    description: `Loan Disbursement to M-Pesa (${phone})`
                })
            }
        }
    }

    // 6. UPDATE DATABASE (Mark Loan as Active or Withdrawal as Completed)
    if (txType === 'loan') {
        // A. Update Loan Status
        const { error: loanError } = await supabase
            .from('loans')
            .update({ status: 'active', disbursed_at: new Date().toISOString() })
            .eq('id', loanId)

        if (loanError) throw new Error("DB Error updating loan: " + loanError.message)

        // B. Record Transaction (The "Outgoing" Money)
        const { data: loan } = await supabase.from('loans').select('borrower_id').eq('id', loanId).single()
        
        if (loan) {
            // A. Record Transaction
            await supabase.from('transactions').insert({
              user_id: loan.borrower_id,
              type: 'loan_disbursement',
              amount: amount,
              mpesa_code: simulatedResponse.ConversationID
            });

            // B. SEND IN-APP NOTIFICATION
            const notifMsg = disburseMethod === 'savings' 
                ? `Your loan of KES ${amount} has been added to your Savings Account.`
                : `Your loan of KES ${amount} has been disbursed to your M-Pesa.`

            await supabase.from('notifications').insert({
              user_id: loan.borrower_id,
              title: "Loan Approved! 💰",
              message: notifMsg
            });
        }
    } else if (txType === 'withdrawal') {
        // 1. Fetch Withdrawal Transaction to get correct amount and user
        const { data: withdrawalTx, error: txError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', withdrawalId)
            .single()

        if (txError || !withdrawalTx) throw new Error("Withdrawal transaction not found")
        if (withdrawalTx.status !== 'pending') throw new Error(`Transaction is ${withdrawalTx.status}`)

        // 2. Fetch User Profile & Check Balance
        const { data: profile, error: profError } = await supabase
            .from('profiles')
            .select('savings_balance, phone')
            .eq('id', withdrawalTx.user_id)
            .single()

        if (profError || !profile) throw new Error("User profile not found")

        const currentBalance = Number(profile.savings_balance || 0)
        const withdrawAmount = Number(withdrawalTx.amount)

        if (currentBalance < withdrawAmount) {
            throw new Error(`Insufficient funds: Balance ${currentBalance} < Request ${withdrawAmount}`)
        }

        // 3. Deduct Balance
        const newBalance = currentBalance - withdrawAmount
        const { error: balError } = await supabase
            .from('profiles')
            .update({ savings_balance: newBalance })
            .eq('id', withdrawalTx.user_id)

        if (balError) throw new Error("Failed to update savings balance")

        // 4. Update Transaction Status
        const { error: updateTxError } = await supabase
            .from('transactions')
            .update({ 
                status: 'completed',
                mpesa_code: simulatedResponse.ConversationID
            })
            .eq('id', withdrawalId)

        if (updateTxError) throw new Error("Failed to update transaction status")

        // 5. Update Ledger (Debit Paybill)
        const { data: acc } = await supabase.from('accounts').select('id, balance').eq('name', 'paybill').single()
        if (acc) {
            const newAccBal = Number(acc.balance || 0) - withdrawAmount
            await supabase.from('accounts').update({ balance: newAccBal }).eq('id', acc.id)
            
            await supabase.from('ledger_entries').insert({
                account_id: acc.id,
                transaction_id: withdrawalId,
                entry_type: 'debit',
                amount: withdrawAmount,
                description: `Withdrawal to ${phone || profile.phone}`
            })
        }

        // 6. Send Notification
        await supabase.from('notifications').insert({
            user_id: withdrawalTx.user_id,
            title: "Withdrawal Approved! 💳",
            message: `Your withdrawal of KES ${withdrawAmount} has been processed.`
        });
        
        console.log(`✅ Withdrawal processed for ${withdrawalTx.user_id}. New Balance: ${newBalance}`)
    } else if (txType === 'repayment') {
        // 1. Fetch Repayment Record
        const { data: repayTx, error: rError } = await supabase.from('repayments').select('*').eq('id', repaymentId).single()
        if (rError || !repayTx) throw new Error("Repayment record not found")
        if (repayTx.status !== 'pending') throw new Error("Repayment already processed")

        const repayAmount = Number(repayTx.amount)
        const userId = repayTx.user_id

        // 2. Fetch User Profile & Check Savings
        const { data: profile } = await supabase.from('profiles').select('savings_balance').eq('id', userId).single()
        const currentSavings = Number(profile?.savings_balance || 0)

        if (currentSavings < repayAmount) {
            throw new Error(`Insufficient savings: ${currentSavings} < ${repayAmount}`)
        }

        // 3. Deduct Savings
        const newSavings = currentSavings - repayAmount
        const { error: saveError } = await supabase.from('profiles').update({ savings_balance: newSavings }).eq('id', userId)
        if (saveError) throw new Error("Failed to deduct savings")

        // 4. Update Loan (Total Repaid & Status)
        const { data: loan } = await supabase.from('loans').select('*').eq('id', repayTx.loan_id).single()
        if (loan) {
            const newTotalRepaid = Number(loan.total_repaid || 0) + repayAmount
            const totalDue = Number(loan.amount) * 1.10 // Principal + 10% Interest
            const newStatus = newTotalRepaid >= totalDue ? 'closed' : 'active'

            await supabase.from('loans').update({ 
                total_repaid: newTotalRepaid,
                status: newStatus
            }).eq('id', loan.id)
        }

        // 5. Update Repayment Status
        await supabase.from('repayments').update({ 
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            payment_method: 'savings'
        }).eq('id', repaymentId)

        // 6. Record Transaction
        await supabase.from('transactions').insert({
            user_id: userId,
            type: 'repayment',
            amount: repayAmount,
            mpesa_code: 'SAVINGS',
            status: 'completed'
        })

        // 7. Notify
        await supabase.from('notifications').insert({
            user_id: userId,
            title: "Loan Repayment Successful 💰",
            message: `Repayment of KES ${repayAmount} received from savings.`
        })

        console.log(`✅ Repayment processed via savings for ${userId}`)
    }

    // 7. RETURN SUCCESS JSON
    return new Response(JSON.stringify(simulatedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error) {
    // 8. RETURN ERROR JSON (So frontend doesn't crash)
    console.error("Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})