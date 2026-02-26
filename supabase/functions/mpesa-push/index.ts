import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. SETUP HEADERS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 2. START SERVER
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 3. READ PARAMS
    const url = new URL(req.url)
    const phoneNumber = url.searchParams.get('phone')
    const amount = url.searchParams.get('amount')
    const userId = url.searchParams.get('userId')
    const repaymentId = url.searchParams.get('repaymentId')

    if (!phoneNumber || !amount) {
      throw new Error(`MISSING DATA. Phone: ${phoneNumber}, Amount: ${amount}`)
    }

    // 4. CREDENTIALS
    const consumerKey = "Qzh3Ds92X09JNOWvzZOszMo8IcTqJ37C2cKHn1idOkkrsovQ" 
    const consumerSecret = "1GcRIAOHpUMGwLMPAMqKg73O60QikghAPPds1BBy4YdpAPkkxvCG1efLzwzalimI"
    const shortCode = "174379"
    const passkey = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"
    
    // 5. GENERATE TOKEN
    const auth = btoa(`${consumerKey}:${consumerSecret}`)
    const tokenResp = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: { "Authorization": `Basic ${auth}` }
    })
    
    // DEBUG: Check if Token Failed
    const tokenText = await tokenResp.text()
    let tokenData
    try {
      tokenData = JSON.parse(tokenText)
    } catch(e) {
      throw new Error("SAFARICOM TOKEN ERROR: " + tokenText)
    }
    
    const access_token = tokenData.access_token
    if (!access_token) throw new Error("NO ACCESS TOKEN: " + tokenText)

    // 6. GENERATE PASSWORD & SEND STK PUSH
    const date = new Date()
    const timestamp = date.getFullYear() +
      ("0" + (date.getMonth() + 1)).slice(-2) +
      ("0" + date.getDate()).slice(-2) +
      ("0" + date.getHours()).slice(-2) +
      ("0" + date.getMinutes()).slice(-2) +
      ("0" + date.getSeconds()).slice(-2)    
    const password = btoa(shortCode + passkey + timestamp)

    const stkUrl = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
    const stkBody = {
      "BusinessShortCode": shortCode,
      "Password": password,
      "Timestamp": timestamp,
      "TransactionType": "CustomerPayBillOnline",
      "Amount": Math.floor(Number(amount)), 
      "PartyA": phoneNumber,
      "PartyB": shortCode,
      "PhoneNumber": phoneNumber,
      "CallBackURL": "https://ckcxwsorhuauxijxzihv.supabase.co/functions/v1/mpesa-callback",
      "AccountReference": "JuvinalPay",
      "TransactionDesc": "Deposit"
    }

    const stkResp = await fetch(stkUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(stkBody)
    })

    // --- CRITICAL FIX: READ AS TEXT FIRST ---
    const responseText = await stkResp.text()
    
    let result
    try {
        result = JSON.parse(responseText)
    } catch (e) {
        // If it's not JSON, throw the raw text so we can read it in the error popup
        throw new Error("SAFARICOM RAW ERROR: " + responseText)
    }

    let dbTransaction = null;

    // 7. LINK REQUEST ID TO USER (The Fix)
    if (result.ResponseCode === "0" && result.CheckoutRequestID) {
      const supabaseUrl = Deno.env.get('SB_URL') ?? Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseKey = Deno.env.get('SB_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      const supabase = createClient(supabaseUrl, supabaseKey)

      if (repaymentId) {
        // Link to Repayment
        await supabase.from('repayments')
          .update({ mpesa_code: result.CheckoutRequestID }) // Store RequestID temporarily
          .eq('id', repaymentId)
      } else if (userId) {
        // Link to Deposit (Create Pending Transaction)
        const { data, error } = await supabase.from('transactions').insert({
          user_id: userId,
          type: 'deposit',
          amount: amount,
          status: 'pending',
          mpesa_code: result.CheckoutRequestID // Store RequestID temporarily
        }).select().single()
        
        if (data) dbTransaction = data;
      }
    }

    // Return result AND the database record we just created
    const finalResponse = { ...result, db_transaction: dbTransaction };

    return new Response(JSON.stringify(finalResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})