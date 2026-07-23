import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function formatPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.slice(1)
  }
  return '+' + digits
}

async function sendAdminNotification(
  supabase: any,
  env: Record<string, string>,
  triggerType: string,
  variables: Record<string, string>
): Promise<void> {
  try {
    const { data: template } = await supabase
      .from('auto_notification_templates')
      .select('message_template, is_active')
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .maybeSingle()

    if (!template) return

    const notificationBotToken = Deno.env.get('NOTIFICATION_BOT_TOKEN') || env['NOTIFICATION_BOT_TOKEN']
    const chatId = Deno.env.get('NOTIFICATION_CHAT_ID') || env['NOTIFICATION_CHAT_ID']
    if (!notificationBotToken || !chatId) return

    let message = template.message_template
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
    }

    fetch(`https://api.telegram.org/bot${notificationBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    }).catch(e => console.error('Notification failed:', e))
  } catch (e) {
    console.error('Admin notification error:', e)
  }
}

// Generate email from phone for auth
function phoneToEmail(phone: string): string {
  return `${phone.replace('+', '')}@phone.subday.app`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone, code, isRegistration, name, city, country, channel } = await req.json()

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: 'Номер и код обязательны' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formattedPhone = formatPhone(phone)
    let workerEnv: Record<string, string> = {}
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}') } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL']
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY']

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Store-review test account: fixed phone + fixed code, bypasses the real OTP
    // check so Google/Apple reviewers can sign in without a real SMS. Creates the
    // account on first use (with a demo coffee subscription) and signs in.
    if (formattedPhone === '+77000000000' && code === '1234') {
      const email = phoneToEmail(formattedPhone)
      const tempPassword = crypto.randomUUID()

      const { data: existing } = await supabase
        .from('profiles').select('user_id').eq('phone', formattedPhone).maybeSingle()

      if (existing?.user_id) {
        await supabase.auth.admin.updateUserById(existing.user_id, { password: tempPassword })
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
          email, phone: formattedPhone, password: tempPassword, email_confirm: true, phone_confirm: true,
        })
        if (signUpError || !signUpData.user) {
          return new Response(JSON.stringify({ error: 'Ошибка тестового входа' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
        await supabase.from('profiles').insert({
          user_id: signUpData.user.id, phone: formattedPhone, name: 'Google Review', city: 'Атырау', country: 'KZ',
        })
        // Best-effort: give the review account an active coffee subscription so the
        // reviewer can see the core QR-redeem flow.
        try {
          const { data: coffeeType } = await supabase
            .from('subscription_types').select('id').eq('type', 'coffee').eq('is_active', true).limit(1).maybeSingle()
          if (coffeeType?.id) {
            await supabase.rpc('activate_subscription', { _user_id: signUpData.user.id, _subscription_type_id: coffeeType.id, _source: 'signup' })
          }
        } catch { /* non-fatal */ }
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password: tempPassword })
      if (loginError || !loginData.session) {
        return new Response(JSON.stringify({ error: 'Ошибка тестового входа' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(
        JSON.stringify({ success: true, session: loginData.session, user: { id: loginData.user?.id, phone: formattedPhone } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Ищем по ТЕЛЕФОНУ (не по коду), чтобы можно было считать попытки на код,
    // который ввели неверно, — при поиске "phone+code" неверный код просто не
    // находил бы строку, и перебор 4-значного кода (10 000 вариантов, окно 5
    // минут) не имел бы ограничения по попыткам.
    const MAX_ATTEMPTS = 5
    const { data: otpRow, error: otpError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', formattedPhone)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpError) {
      console.error('OTP query error:', otpError)
      return new Response(
        JSON.stringify({ error: 'Ошибка проверки кода' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!otpRow) {
      return new Response(
        JSON.stringify({ error: 'Неверный или просроченный код' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (otpRow.attempts >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ error: 'Слишком много попыток. Запросите новый код.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (otpRow.code !== code) {
      const { data: updated } = await supabase
        .from('otp_codes')
        .update({ attempts: otpRow.attempts + 1 })
        .eq('id', otpRow.id)
        .select('attempts')
        .maybeSingle()
      const left = MAX_ATTEMPTS - (updated?.attempts ?? otpRow.attempts + 1)
      return new Response(
        JSON.stringify({
          error: left > 0 ? `Неверный код. Осталось попыток: ${left}` : 'Неверный код. Запросите новый.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const otpData = otpRow

    // Mark OTP as used (don't await - fire and forget)
    supabase.from('otp_codes').update({ verified: true }).eq('id', otpData.id).then(() => {})

    // Determine channel label for notifications
    const channelLabel = channel === 'whatsapp' ? 'whatsapp' : 'sms'
    const timeStr = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })

    if (isRegistration) {
      // Registration flow
      const tempPassword = crypto.randomUUID()
      const email = phoneToEmail(formattedPhone)
      const { data: signUpData, error: signUpError } = await supabase.auth.admin.createUser({
        email,
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

      // Create profile with country and city
      await supabase.from('profiles').insert({
        user_id: signUpData.user.id,
        phone: formattedPhone,
        name: name || null,
        city: city || 'Атырау',
        country: country || 'KZ',
      })

      // Sign in the newly created user to return session
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: tempPassword
      })

      // Fire-and-forget: notification + cleanup
      sendAdminNotification(supabase, workerEnv, `admin_register_${channelLabel}`, {
        name: name || 'не указано',
        phone: formattedPhone,
        time: timeStr,
      })
      supabase.from('otp_codes').delete().eq('phone', formattedPhone).then(() => {})

      if (loginError || !loginData.session) {
        return new Response(
          JSON.stringify({ success: true, message: 'Регистрация успешна' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          session: loginData.session,
          user: { id: loginData.user?.id, phone: formattedPhone }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Login flow
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id, name')
        .eq('phone', formattedPhone)
        .maybeSingle()

      if (!profileData) {
        return new Response(
          JSON.stringify({ error: 'Пользователь не найден' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('Logging in user:', profileData.user_id)
      
      const tempPassword = crypto.randomUUID()
      await supabase.auth.admin.updateUserById(profileData.user_id, {
        password: tempPassword
      })

      const email = phoneToEmail(formattedPhone)
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: tempPassword
      })

      if (loginError) {
        console.error('Login error:', loginError)
        return new Response(
          JSON.stringify({ error: 'Ошибка входа' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const session = loginData.session

      // Fire-and-forget
      sendAdminNotification(supabase, workerEnv, `admin_login_${channelLabel}`, {
        name: profileData.name || 'не указано',
        phone: formattedPhone,
        time: timeStr,
      })
      supabase.from('otp_codes').delete().eq('phone', formattedPhone).then(() => {})

      return new Response(
        JSON.stringify({ 
          success: true,
          session,
          user: { id: loginData.user?.id, phone: formattedPhone }
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