import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

function formatPhone(phone: string, countryCode?: string): string {
  let digits = phone.replace(/\D/g, '')
  // Legacy: if starts with 8 and 11 digits, assume KZ
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.slice(1)
  }
  return '+' + digits
}

const PHONE_PATTERNS: Record<string, RegExp> = {
  KZ: /^\+7[0-9]{10}$/,
  RU: /^\+7[0-9]{10}$/,
  KG: /^\+996[0-9]{9}$/,
  UZ: /^\+998[0-9]{9}$/,
}

function validatePhone(phone: string, countryCode?: string): boolean {
  if (countryCode && PHONE_PATTERNS[countryCode]) {
    return PHONE_PATTERNS[countryCode].test(phone)
  }
  // Fallback: accept any of the patterns
  return Object.values(PHONE_PATTERNS).some(p => p.test(phone))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone, isRegistration, countryCode, channel } = await req.json()

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Номер телефона обязателен' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formattedPhone = formatPhone(phone, countryCode)
    
    if (!validatePhone(formattedPhone, countryCode)) {
      return new Response(
        JSON.stringify({ error: 'Неверный формат номера телефона' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const smscLogin = Deno.env.get('SMSC_LOGIN')
    const smscPassword = Deno.env.get('SMSC_PASSWORD')

    if (!smscLogin || !smscPassword) {
      console.error('SMSC credentials not configured!')
      return new Response(
        JSON.stringify({ error: 'SMS сервис временно недоступен. Используйте Telegram для входа.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check profiles + cooldown in parallel
    const [profileResult, cooldownSmsResult, cooldownWaResult] = await Promise.all([
      supabase.from('profiles').select('user_id').eq('phone', formattedPhone).maybeSingle(),
      supabase.from('otp_codes').select('created_at, code').eq('phone', formattedPhone).like('code', 'S%')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('otp_codes').select('created_at, code').eq('phone', formattedPhone).like('code', 'W%')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    
    const userExists = !!profileResult.data

    if (isRegistration && userExists) {
      return new Response(
        JSON.stringify({ error: 'Этот номер уже зарегистрирован. Войдите в аккаунт' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isRegistration && !userExists) {
      return new Response(
        JSON.stringify({ error: 'Зарегистрируйтесь, пожалуйста, для входа' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check cooldown
    const lastOtp = cooldownResult.data
    if (lastOtp) {
      const lastSentAt = new Date(lastOtp.created_at).getTime()
      const cooldownMs = 59 * 1000
      const elapsed = Date.now() - lastSentAt
      if (elapsed < cooldownMs) {
        const remainingSec = Math.ceil((cooldownMs - elapsed) / 1000)
        return new Response(
          JSON.stringify({ error: `Повторная отправка через ${remainingSec} сек.`, cooldown: remainingSec }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    // Delete old codes and insert new one
    await supabase.from('otp_codes').delete().eq('phone', formattedPhone)
    
    const { error: insertError } = await supabase.from('otp_codes').insert({
      phone: formattedPhone, code, expires_at: expiresAt.toISOString(),
    })

    if (insertError) {
      console.error('Error inserting OTP:', insertError)
      return new Response(
        JSON.stringify({ error: 'Ошибка сохранения кода' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending ${channel || 'sms'} to ${formattedPhone}, code: ${code}`)

    if (channel === 'whatsapp') {
      // Send via Infobip WhatsApp
      const infobipApiKey = Deno.env.get('INFOBIP_API_KEY')
      const infobipBaseUrl = Deno.env.get('INFOBIP_BASE_URL')
      const infobipSender = Deno.env.get('INFOBIP_WHATSAPP_SENDER')

      if (!infobipApiKey || !infobipBaseUrl || !infobipSender) {
        console.error('Infobip credentials not configured!')
        return new Response(
          JSON.stringify({ error: 'WhatsApp временно недоступен. Попробуйте SMS или Telegram.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Strip '+' for Infobip (expects digits with country code)
      const waRecipient = formattedPhone.replace('+', '')

      try {
        const infobipResponse = await fetch(
          `https://${infobipBaseUrl}/whatsapp/1/message/template`,
          {
            method: 'POST',
            headers: {
              'Authorization': `App ${infobipApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: [
                {
                  from: infobipSender,
                  to: waRecipient,
                  content: {
                    templateName: 'authentication',
                    templateData: {
                      body: {
                        placeholders: [code],
                      },
                      buttons: [
                        {
                          type: 'URL',
                          parameter: code,
                        },
                      ],
                    },
                    language: 'en',
                  },
                },
              ],
            }),
            signal: AbortSignal.timeout(15000),
          }
        )

        const infobipResult = await infobipResponse.json()
        console.log('Infobip response:', JSON.stringify(infobipResult))

        if (!infobipResponse.ok || infobipResult.requestError) {
          console.error('Infobip error:', infobipResult.requestError || infobipResponse.status)
          return new Response(
            JSON.stringify({ error: 'Ошибка отправки кода, попробуйте SMS.' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const messageStatus = infobipResult.messages?.[0]?.status
        const statusName = messageStatus?.name
        const statusGroupName = messageStatus?.groupName
        console.log('WhatsApp message sent via Infobip, status:', statusName, 'group:', statusGroupName)

        if (statusGroupName === 'REJECTED') {
          console.error('Infobip rejected:', statusName, messageStatus?.description)
          const userMessage = statusName === 'REJECTED_DESTINATION_NOT_REGISTERED'
            ? 'Этот номер не найден в WhatsApp. Попробуйте SMS.'
            : 'WhatsApp не смог доставить сообщение. Попробуйте SMS.'
          return new Response(
            JSON.stringify({ error: userMessage }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      } catch (waErr) {
        console.error('Infobip fetch error:', waErr)
        return new Response(
          JSON.stringify({ error: 'Ошибка отправки кода, попробуйте SMS.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // Send via SMSC (SMS)
      const message = `subday: ваш код ${code}`
      const smsUrl = new URL('https://smsc.kz/sys/send.php')
      smsUrl.searchParams.set('login', smscLogin)
      smsUrl.searchParams.set('psw', smscPassword)
      smsUrl.searchParams.set('phones', formattedPhone)
      smsUrl.searchParams.set('mes', message)
      smsUrl.searchParams.set('fmt', '3')
      smsUrl.searchParams.set('charset', 'utf-8')

      try {
        const smsResponse = await fetch(smsUrl.toString(), {
          signal: AbortSignal.timeout(10000),
        })
        const smsText = await smsResponse.text()
        console.log('SMSC raw response:', smsText)

        let smsResult: any
        try {
          smsResult = JSON.parse(smsText)
        } catch {
          console.error('SMSC returned non-JSON:', smsText)
          return new Response(
            JSON.stringify({ error: 'SMS сервис вернул некорректный ответ. Попробуйте Telegram.' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (smsResult.error) {
          console.error('SMS error:', smsResult.error_code, smsResult.error)
          return new Response(
            JSON.stringify({ error: `Ошибка отправки SMS. Попробуйте Telegram.` }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log('SMS sent successfully, id:', smsResult.id)
      } catch (smsErr) {
        console.error('SMS fetch error:', smsErr)
        return new Response(
          JSON.stringify({ error: 'SMS сервис недоступен. Попробуйте Telegram.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Код отправлен', phone: formattedPhone }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-otp:', error)
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера. Попробуйте позже.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
