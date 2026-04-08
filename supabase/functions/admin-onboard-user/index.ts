import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.1.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Verify Admin Status of the requester
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) throw new Error('Unauthorized')

    // Check if requester is an admin in profiles table
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.is_admin) throw new Error('Forbidden: Only admins can onboard members.')

    // 2. Extract Member Details
    const { 
        email, 
        phone, 
        password, 
        first_name, 
        middle_name, 
        last_name, 
        id_number,
        country,
        county,
        sub_county,
        ward
    } = await req.json()

    if (!email || !phone || !first_name || !last_name || !password) {
      throw new Error('Email, Phone, Names, and Password are mandatory.')
    }

    // 3. Create User in Auth
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        first_name, 
        middle_name, 
        last_name, 
        phone,
        country,
        county,
        sub_county,
        ward
      }
    })

    if (createError) throw createError

    // 4. Update Profile (The trigger should have created it, but we override/upsert to be sure)
    const fullName = `${first_name} ${middle_name ? middle_name + ' ' : ''}${last_name}`.trim()
    
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .upsert({
        id: newUser.user.id,
        email,
        full_name: fullName,
        phone,
        id_number,
        country,
        county,
        sub_county,
        ward,
        membership_status: 'pending', // Always start as pending per user request
        registration_fee_paid: false
      })

    if (profileError) throw profileError

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
