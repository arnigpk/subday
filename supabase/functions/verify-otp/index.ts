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

async function sendLoginNotification(
  phone: string,
  name: string | null,
  isNewUser: boolean
): Promise<void> {
  const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN')
  const chatId = Deno.env.get('NOTIFICATION_CHAT_ID')
  
  if (!notificationBotToken || !chatId) {
    console.log('Notification bot not configured')
    return
  }

  const action = isNewUser ? '🆕 Новая регистрация' : '🔑 Вход'
  const nameText = name || 'не указано'
  const message = `${action} через SMS\n\n👤 Имя: ${nameText}\n📞 Телефон: ${phone}\n🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`

  try {
    await fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    })
    console.log('Login notification sent')
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
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

      // Send notification for new user
      await sendLoginNotification(formattedPhone, name, true)
      
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
      // Login flow - find user by email pattern
      const emailPattern = `${formattedPhone.replace('+', '')}@phone.subday.app`
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers?.users?.find(u => u.email === emailPattern)

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

      // Get user profile for notification
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', existingUser.id)
        .single()

      // Send login notification
      await sendLoginNotification(formattedPhone, profile?.name || null, false)

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
