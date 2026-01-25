import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateOTP(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

function formatPhone(phone: string): string {
  // Убираем все кроме цифр
  let digits = phone.replace(/\D/g, '')
  
  // Если начинается с 8, заменяем на 7
  if (digits.startsWith('8') && digits.length === 11) {
    digits = '7' + digits.slice(1)
  }
  
  // Добавляем + если нет
  return '+' + digits
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone } = await req.json()

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Номер телефона обязателен' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const formattedPhone = formatPhone(phone)
    
    // Валидация номера (казахстанский формат)
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Генерируем OTP
    const code = generateOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 минут

    // Удаляем старые коды для этого номера
    await supabase
      .from('otp_codes')
      .delete()
      .eq('phone', formattedPhone)

    // Сохраняем новый код
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

    // Отправляем SMS через SMSC.kz
    const message = `subday: ваш код ${code}`
    const smsUrl = new URL('https://smsc.kz/sys/send.php')
    smsUrl.searchParams.set('login', smscLogin)
    smsUrl.searchParams.set('psw', smscPassword)
    smsUrl.searchParams.set('phones', formattedPhone)
    smsUrl.searchParams.set('mes', message)
    smsUrl.searchParams.set('fmt', '3') // JSON response
    smsUrl.searchParams.set('charset', 'utf-8')

    console.log(`Sending SMS to ${formattedPhone}`)

    const smsResponse = await fetch(smsUrl.toString())
    const smsResult = await smsResponse.json()

    console.log('SMSC response:', smsResult)

    if (smsResult.error) {
      console.error('SMS error:', smsResult.error_code, smsResult.error)
      return new Response(
        JSON.stringify({ error: `Ошибка отправки SMS: ${smsResult.error}` }),
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
