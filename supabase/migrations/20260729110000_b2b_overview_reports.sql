-- ============================================================================
-- B2B: расширяем обзор кабинета деловыми показателями и отчётами.
--   • per-seat redemptions_30d — активность каждого сотрудника за 30 дней;
--   • report.visits_30d — визиты команды за 30 дней;
--   • report.monthly — помесячная активность команды (6 месяцев);
--   • report.adoption_pct — доля сотрудников, реально пользующихся подпиской.
-- «Команда» = пользователи с активным местом в этом аккаунте. Всё считается
-- по реальным redemptions, без выдумок.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.b2b_get_overview()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_account public.b2b_accounts;
  v_result  jsonb;
BEGIN
  SELECT * INTO v_account FROM public.b2b_accounts WHERE admin_user_id = auth.uid() AND is_active LIMIT 1;
  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_account');
  END IF;

  WITH team AS (
    SELECT DISTINCT employee_user_id AS uid
      FROM public.b2b_seats WHERE account_id = v_account.id AND status = 'active'
  )
  SELECT jsonb_build_object(
    'ok', true,
    'account', jsonb_build_object('id', v_account.id, 'name', v_account.name),
    'allocations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', al.id,
        'tier', st.name,
        'subscription_type_id', al.subscription_type_id,
        'seats_total', al.seats_total,
        'seats_used', COALESCE(u.used, 0),
        'seats_free', al.seats_total - COALESCE(u.used, 0),
        'expires_at', al.expires_at
      ) ORDER BY st.name)
      FROM public.b2b_allocations al
      JOIN public.subscription_types st ON st.id = al.subscription_type_id
      LEFT JOIN (SELECT allocation_id, count(*) used FROM public.b2b_seats WHERE status='active' GROUP BY 1) u
        ON u.allocation_id = al.id
      WHERE al.account_id = v_account.id
    ), '[]'::jsonb),
    'seats', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'seat_id', s.id,
        'allocation_id', s.allocation_id,
        'tier', st.name,
        'employee_user_id', s.employee_user_id,
        'name', p.name,
        'assigned_at', s.assigned_at,
        'redemptions', COALESCE(r.cnt, 0),
        'redemptions_30d', COALESCE(r.cnt30, 0),
        'last_visit', r.last_at
      ) ORDER BY COALESCE(r.cnt30, 0) DESC, s.assigned_at DESC)
      FROM public.b2b_seats s
      JOIN public.b2b_allocations al ON al.id = s.allocation_id
      JOIN public.subscription_types st ON st.id = al.subscription_type_id
      LEFT JOIN public.profiles p ON p.user_id = s.employee_user_id
      LEFT JOIN (
        SELECT user_id,
               count(*) cnt,
               count(*) FILTER (WHERE redeemed_at >= now() - interval '30 days') cnt30,
               max(redeemed_at) last_at
          FROM public.redemptions GROUP BY 1
      ) r ON r.user_id = s.employee_user_id
      WHERE s.account_id = v_account.id AND s.status = 'active'
    ), '[]'::jsonb),
    'stats', (
      SELECT jsonb_build_object(
        'active_seats', count(*) FILTER (WHERE s.status='active'),
        'employees_used', count(DISTINCT s.employee_user_id) FILTER (
          WHERE s.status='active' AND EXISTS (SELECT 1 FROM public.redemptions r WHERE r.user_id = s.employee_user_id)),
        'total_redemptions', COALESCE(sum(rr.cnt) FILTER (WHERE s.status='active'), 0)
      )
      FROM public.b2b_seats s
      LEFT JOIN (SELECT user_id, count(*) cnt FROM public.redemptions GROUP BY 1) rr ON rr.user_id = s.employee_user_id
      WHERE s.account_id = v_account.id
    ),
    'report', jsonb_build_object(
      'visits_30d', (
        SELECT count(*) FROM public.redemptions r
         WHERE r.user_id IN (SELECT uid FROM team)
           AND r.redeemed_at >= now() - interval '30 days'
      ),
      'adoption_pct', (
        SELECT CASE WHEN count(*) = 0 THEN 0
                    ELSE round(100.0 * count(*) FILTER (
                      WHERE EXISTS (SELECT 1 FROM public.redemptions r
                                     WHERE r.user_id = t.uid
                                       AND r.redeemed_at >= now() - interval '30 days')) / count(*))
               END
        FROM team t
      ),
      'monthly', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', to_char(m, 'Mon'), 'c', COALESCE(x.c, 0)) ORDER BY m)
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS g(m)
        LEFT JOIN (
          SELECT date_trunc('month', redeemed_at) AS mm, count(*) c
            FROM public.redemptions
           WHERE user_id IN (SELECT uid FROM team)
             AND redeemed_at >= date_trunc('month', now()) - interval '5 months'
           GROUP BY 1
        ) x ON x.mm = g.m
      ), '[]'::jsonb)
    )
  ) INTO v_result;

  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.b2b_get_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.b2b_get_overview() TO authenticated;
