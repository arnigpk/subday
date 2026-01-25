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
    const { phone, code } = await req.json()

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

    // Проверяем OTP
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

    // Помечаем код как использованный
    await supabase
      .from('otp_codes')
      .update({ verified: true })
      .eq('id', otpData.id)

    // Проверяем, есть ли пользователь с таким номером
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.phone === formattedPhone)

    let session = null
    let user = null

    if (existingUser) {
      // Пользователь существует - создаём сессию
      console.log('Existing user found:', existingUser.id)
      
      // Генерируем magic link токен для входа
      const { data: signInData, error: signInError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: `${formattedPhone.replace('+', '')}@phone.subday.app`,
      })

      if (signInError) {
        console.error('Sign in error:', signInError)
        
        // Пробуем обновить пароль и залогинить
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

        session = loginData.session
        user = loginData.user
      } else {
        // Используем токен для создания сессии
        const verifyUrl = new URL(signInData.properties?.action_link || '')
        const token = verifyUrl.searchParams.get('token')
        
        if (token) {
          const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: token,
            type: 'magiclink'
          })

          if (!verifyError && verifyData) {
            session = verifyData.session
            user = verifyData.user
          }
        }
      }
    } else {
      // Новый пользователь - регистрируем
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

      user = signUpData.user

      // Создаём профиль
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          phone: formattedPhone,
          city: 'Алматы'
        })

      if (profileError) {
        console.error('Profile creation error:', profileError)
      }

      // Логиним нового пользователя
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: `${formattedPhone.replace('+', '')}@phone.subday.app`,
        password: tempPassword
      })

      if (loginError) {
        console.error('Login after signup error:', loginError)
        return new Response(
          JSON.stringify({ error: 'Ошибка входа после регистрации' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      session = loginData.session
      user = loginData.user
    }

    // Удаляем использованный OTP
    await supabase
      .from('otp_codes')
      .delete()
      .eq('phone', formattedPhone)

    return new Response(
      JSON.stringify({ 
        success: true,
        session,
        user: {
          id: user?.id,
          phone: formattedPhone
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in verify-otp:', error)
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
