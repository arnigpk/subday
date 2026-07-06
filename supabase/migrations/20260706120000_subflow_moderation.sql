-- UGC-модерация для #subFlow (требование App Store, Guideline 1.2):
-- блокировка пользователей + жалобы на контент.

-- 1. Блокировки: скрывают контент заблокированного из ленты пользователя.
CREATE TABLE IF NOT EXISTS public.subflow_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
ALTER TABLE public.subflow_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own blocks select" ON public.subflow_blocks;
CREATE POLICY "own blocks select" ON public.subflow_blocks
  FOR SELECT TO authenticated USING (blocker_id = auth.uid());
DROP POLICY IF EXISTS "own blocks insert" ON public.subflow_blocks;
CREATE POLICY "own blocks insert" ON public.subflow_blocks
  FOR INSERT TO authenticated WITH CHECK (blocker_id = auth.uid());
DROP POLICY IF EXISTS "own blocks delete" ON public.subflow_blocks;
CREATE POLICY "own blocks delete" ON public.subflow_blocks
  FOR DELETE TO authenticated USING (blocker_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_subflow_blocks_blocker ON public.subflow_blocks (blocker_id);

-- 2. Жалобы: очередь модерации, разбирается в течение 24 ч.
CREATE TABLE IF NOT EXISTS public.subflow_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  target_type text NOT NULL,           -- 'post' | 'comment' | 'user'
  target_id uuid,                      -- id поста/коммента
  target_user_id uuid,                 -- автор контента
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | reviewed | removed
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subflow_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reporter insert" ON public.subflow_reports;
CREATE POLICY "reporter insert" ON public.subflow_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS "admins read reports" ON public.subflow_reports;
CREATE POLICY "admins read reports" ON public.subflow_reports
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));
DROP POLICY IF EXISTS "admins manage reports" ON public.subflow_reports;
CREATE POLICY "admins manage reports" ON public.subflow_reports
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

CREATE INDEX IF NOT EXISTS idx_subflow_reports_status ON public.subflow_reports (status, created_at DESC);
