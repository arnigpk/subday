import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
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
    const { phone, isRegistration } = await req.json()

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Номер телефона обязателен' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formattedPhone = formatPhone(phone)
    
    if (!/^\+7[0-9]{10}$/.test(formattedPhone)) {
      return new Response(
        JSON.stringify({ error: 'Неверный формат номера. Используй +7XXXXXXXXXX' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const smscLogin = Deno.env.get('SMSC_LOGIN')!
    const smscPassword = Deno.env.get('SMSC_PASSWORD')!
    const whatsappBotNumber = Deno.env.get('WHATSAPP_BOT_NUMBER')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Check if user exists by email pattern (more reliable than phone field)
    const emailPattern = `${formattedPhone.replace('+', '')}@phone.subday.app`
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === emailPattern)

    if (isRegistration && existingUser) {
      return new Response(
        // ВАЖНО: не используем 4xx для ожидаемых бизнес-ошибок,
        // иначе клиент может показать RUNTIME_ERROR overlay.
        JSON.stringify({ error: 'Этот номер уже зарегистрирован. Войдите в аккаунт' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isRegistration && !existingUser) {
      return new Response(
        // ВАЖНО: не используем 4xx для ожидаемых бизнес-ошибок,
        // иначе клиент может показать RUNTIME_ERROR overlay.
        JSON.stringify({ error: 'Зарегистрируйтесь, пожалуйста, для входа' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    await supabase
      .from('otp_codes')
      .delete()
      .eq('phone', formattedPhone)

    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        phone: formattedPhone,
        code,
        expires_at: expiresAt.toISOString(),
      })

    if (insertError) {
      console.error('Error inserting OTP:', insertError)
      return new Response(
        JSON.stringify({ error: 'Ошибка сохранения кода' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const message = `subday: ваш код ${code}`
    const waUrl = new URL('https://smsc.kz/sys/send.php')
    waUrl.searchParams.set('login', smscLogin)
    waUrl.searchParams.set('psw', smscPassword)
    waUrl.searchParams.set('phones', formattedPhone)
    waUrl.searchParams.set('mes', message)
    waUrl.searchParams.set('fmt', '3')
    waUrl.searchParams.set('charset', 'utf-8')
    waUrl.searchParams.set('bot', `wa:${whatsappBotNumber}`)

    console.log(`Sending WhatsApp to ${formattedPhone}`)

    const waResponse = await fetch(waUrl.toString())
    const waResult = await waResponse.json()

    console.log('SMSC WhatsApp response:', waResult)

    if (waResult.error) {
      console.error('WhatsApp error:', waResult.error_code, waResult.error)
      return new Response(
        JSON.stringify({ error: `Ошибка отправки WhatsApp: ${waResult.error}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Код отправлен',
        phone: formattedPhone 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-otp:', error)
    return new Response(
      JSON.stringify({ error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
