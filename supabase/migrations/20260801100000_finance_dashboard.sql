-- ============================================================================
-- Финансовый дашборд админки. Принципы:
--   • только реальные строки БД, никаких оценок;
--   • деньги — ТОЛЬКО из subscription_transactions (transaction_type='purchase',
--     пишется платёжными вебхуками с реальной суммой); выдачи админом/B2B в
--     выручку не попадают никогда;
--   • активации — из user_subscriptions с фильтром по source
--     (purchase | purchase_special | admin | b2b | signup | unknown=до учёта);
--   • «MRR» сознательно не считаем: автосписания нет, подписки разовые —
--     честные метрики: выручка за период, продления, новые vs повторные.
-- p_sources = NULL — все источники.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_finance_dashboard(
  p_from    timestamptz DEFAULT '2026-06-01T00:00:00+05',
  p_to      timestamptz DEFAULT now(),
  p_sources text[]      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  WITH subs AS (
    SELECT us.*, COALESCE(us.source, 'unknown') AS src
      FROM public.user_subscriptions us
     WHERE p_sources IS NULL OR COALESCE(us.source, 'unknown') = ANY (p_sources)
  ),
  in_range AS (
    SELECT * FROM subs WHERE created_at >= p_from AND created_at <= p_to
  ),
  firsts AS (
    -- Первая подписка пользователя ЗА ВСЁ ВРЕМЯ (без фильтра источника):
    -- «новый» = вообще впервые получил подписку.
    SELECT user_id, min(created_at) AS first_at FROM public.user_subscriptions GROUP BY user_id
  ),
  expired_cohort AS (
    -- Продления: подписки, чей срок ИСТЁК внутри периода (и уже в прошлом).
    SELECT s.*, EXISTS (
      SELECT 1 FROM public.user_subscriptions n
       WHERE n.user_id = s.user_id
         AND n.created_at > s.expires_at
         AND n.created_at <= s.expires_at + interval '14 days'
    ) AS renewed
    FROM subs s
    WHERE s.expires_at >= p_from AND s.expires_at <= LEAST(p_to, now())
  )
  SELECT jsonb_build_object(
    'active_now', (SELECT count(*) FROM subs WHERE is_active AND expires_at > now()),
    'activations_total', (SELECT count(*) FROM in_range),
    'unique_buyers', (SELECT count(DISTINCT user_id) FROM in_range),
    'new_users', (SELECT count(DISTINCT r.user_id) FROM in_range r
                   JOIN firsts f ON f.user_id = r.user_id
                  WHERE f.first_at >= p_from AND f.first_at <= p_to),
    'monthly_activations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('m', t.m, 'total', t.total, 'new', t.new_cnt) ORDER BY t.m)
      FROM (
        SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS m,
               count(*) AS total,
               -- «новая» активация = это самая первая подписка пользователя за всё время
               count(*) FILTER (WHERE f.first_at = r.created_at) AS new_cnt
        FROM in_range r JOIN firsts f ON f.user_id = r.user_id
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'by_source', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', t.src, 'c', t.n) ORDER BY t.n DESC)
      FROM (SELECT src, count(*) n FROM in_range GROUP BY src) t
    ), '[]'::jsonb),
    'by_tier', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', t.name, 'c', t.n) ORDER BY t.n DESC)
      FROM (
        SELECT st.name, count(*) n FROM in_range r
        JOIN public.subscription_types st ON st.id = r.subscription_type_id
        GROUP BY st.name
      ) t
    ), '[]'::jsonb),
    'renewal', (
      SELECT jsonb_build_object(
        'expired', count(*),
        'renewed', count(*) FILTER (WHERE renewed),
        'rate_pct', CASE WHEN count(*) = 0 THEN NULL
                         ELSE round(100.0 * count(*) FILTER (WHERE renewed) / count(*)) END
      ) FROM expired_cohort
    ),
    'revenue', (
      SELECT jsonb_build_object(
        'accounting_since', (SELECT min(created_at) FROM public.subscription_transactions
                              WHERE transaction_type = 'purchase'),
        'total', COALESCE((SELECT sum(amount) FROM public.subscription_transactions
                            WHERE transaction_type = 'purchase'
                              AND created_at >= p_from AND created_at <= p_to), 0),
        'count', (SELECT count(*) FROM public.subscription_transactions
                   WHERE transaction_type = 'purchase'
                     AND created_at >= p_from AND created_at <= p_to),
        'monthly', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('m', t.m, 'sum', t.sm, 'n', t.n) ORDER BY t.m)
          FROM (
            SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') m, sum(amount) sm, count(*) n
            FROM public.subscription_transactions
            WHERE transaction_type = 'purchase' AND created_at >= p_from AND created_at <= p_to
            GROUP BY 1
          ) t
        ), '[]'::jsonb),
        'by_method', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('method', t.pm, 'sum', t.sm, 'n', t.n) ORDER BY t.sm DESC)
          FROM (
            SELECT COALESCE(payment_method, 'неизвестно') pm, sum(amount) sm, count(*) n
            FROM public.subscription_transactions
            WHERE transaction_type = 'purchase' AND created_at >= p_from AND created_at <= p_to
            GROUP BY 1
          ) t
        ), '[]'::jsonb),
        'special_offer', (
          SELECT jsonb_build_object('sum', COALESCE(sum(amount) FILTER (WHERE is_special_offer), 0),
                                    'n', count(*) FILTER (WHERE is_special_offer))
          FROM public.subscription_transactions
          WHERE transaction_type = 'purchase' AND created_at >= p_from AND created_at <= p_to
        )
      )
    ),
    'from', p_from, 'to', p_to
  ) INTO v_result;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.get_finance_dashboard(timestamptz, timestamptz, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_dashboard(timestamptz, timestamptz, text[]) TO authenticated;
