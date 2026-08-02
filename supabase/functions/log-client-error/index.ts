import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Своё логирование клиентских ошибок (вместо внешнего Sentry). Принимает
// обезличенный отчёт об ошибке рендера/исключении и кладёт его в таблицу
// client_error_logs под service role. Отвечает 200 всегда — логирование не
// должно мешать клиенту, даже если что-то не так на нашей стороне.
const cut = (v: unknown, n: number): string | null =>
  typeof v === 'string' && v.length ? v.slice(0, n) : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let workerEnv: Record<string, string> = {};
    try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'];
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'];
    const supabase = createClient(supabaseUrl!, serviceKey!);

    const body = await req.json().catch(() => ({}));

    // Пользователя определяем сами из токена (если есть) — клиенту не доверяем.
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        userId = data.user?.id ?? null;
      } catch { /* аноним — оставим null */ }
    }

    await supabase.from('client_error_logs').insert({
      section:         cut(body.section, 60),
      message:         cut(body.message, 1000),
      stack:           cut(body.stack, 4000),
      component_stack: cut(body.componentStack, 4000),
      url:             cut(body.url, 500),
      user_agent:      cut(body.userAgent, 400),
      app_version:     cut(body.appVersion, 40),
      platform:        cut(body.platform, 20),
      user_id:         userId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (_e) {
    // Никогда не отдаём ошибку клиенту — логирование не критично.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
