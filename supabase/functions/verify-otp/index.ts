import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.slice(1)
  }
  return '+' + digits
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone, code, isRegistration, name } = await req.json()

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: 'Номер и код обязательны' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formattedPhone = formatPhone(phone)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify OTP
    const { data: otpData, error: otpError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', formattedPhone)
      .eq('code', code)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (otpError) {
      console.error('OTP query error:', otpError)
      return new Response(
        JSON.stringify({ error: 'Ошибка проверки кода' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!otpData) {
      return new Response(
        JSON.stringify({ error: 'Неверный или просроченный код' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Mark OTP as used
    await supabase
      .from('otp_codes')
      .update({ verified: true })
      .eq('id', otpData.id)

    if (isRegistration) {
      // Registration flow - create user and profile, but don't create session
      console.log('Creating new user for phone:', formattedPhone)
      
      const tempPassword = crypto.randomUUID()
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email: `${formattedPhone.replace('+', '')}@phone.subday.app`,
        phone: formattedPhone,
        password: tempPassword,
        email_confirm: true,
        phone_confirm: true,
      })

      if (signUpError) {
        console.error('Sign up error:', signUpError)
        return new Response(
          JSON.stringify({ error: 'Ошибка регистрации' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Create profile with name
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: signUpData.user.id,
          phone: formattedPhone,
          name: name || null,
          city: 'Алматы'
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
      }

      // Delete used OTP
      await supabase
        .from('otp_codes')
        .delete()
        .eq('phone', formattedPhone)

      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Регистрация успешна'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Login flow - find user and create session
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find(u => u.phone === formattedPhone)

      if (!existingUser) {
        return new Response(
          JSON.stringify({ error: 'Пользователь не найден' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('Logging in user:', existingUser.id)
      
      // Update password and login
      const tempPassword = crypto.randomUUID()
      await supabase.auth.admin.updateUserById(existingUser.id, {
        password: tempPassword
      })

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: `${formattedPhone.replace('+', '')}@phone.subday.app`,
        password: tempPassword
      })

      if (loginError) {
        console.error('Login error:', loginError)
        return new Response(
          JSON.stringify({ error: 'Ошибка входа' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Delete used OTP
      await supabase
        .from('otp_codes')
        .delete()
        .eq('phone', formattedPhone)

      return new Response(
        JSON.stringify({ 
          success: true,
          session: loginData.session,
          user: {
            id: loginData.user?.id,
            phone: formattedPhone
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('Error in verify-otp:', error)
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
