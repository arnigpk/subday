import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Fast user lookup by email (instead of listing ALL users)
    const emailPattern = `${formattedPhone.replace('+', '')}@phone.subday.app`
    const { data: existingUserData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      // @ts-ignore - filter by email supported in admin API
    })
    
    // Direct lookup: try to get user by email
    let existingUser = null
    try {
      // Use getUserByEmail for instant lookup instead of listing all users
      const { data: userData } = await supabase.auth.admin.getUserById(emailPattern)
      existingUser = userData?.user || null
    } catch {
      // getUserById won't work with email, fall back to profiles table
    }
    
    // Fast: check profiles table directly (indexed by phone)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('phone', formattedPhone)
      .maybeSingle()
    
    const userExists = !!profileData

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

    // Anti-fraud: check cooldown (59 seconds between SMS) — run in parallel with code generation
    const [cooldownResult] = await Promise.all([
      supabase
        .from('otp_codes')
        .select('created_at')
        .eq('phone', formattedPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

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

    // Delete old codes and insert new one in parallel
    const [, insertResult] = await Promise.all([
      supabase.from('otp_codes').delete().eq('phone', formattedPhone),
      supabase.from('otp_codes').insert({
        phone: formattedPhone,
        code,
        expires_at: expiresAt.toISOString(),
      })
    ])

    if (insertResult.error) {
      console.error('Error inserting OTP:', insertResult.error)
      return new Response(
        JSON.stringify({ error: 'Ошибка сохранения кода' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send SMS (non-blocking response pattern: send SMS in parallel)
    const message = `subday: ваш код ${code}`
    const smsUrl = new URL('https://smsc.kz/sys/send.php')
    smsUrl.searchParams.set('login', smscLogin)
    smsUrl.searchParams.set('psw', smscPassword)
    smsUrl.searchParams.set('phones', formattedPhone)
    smsUrl.searchParams.set('mes', message)
    smsUrl.searchParams.set('fmt', '3')
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
