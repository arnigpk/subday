CREATE TABLE IF NOT EXISTS webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'paylink',
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}',
  order_id text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook logs" ON webhook_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service can insert webhook logs" ON webhook_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can delete webhook logs" ON webhook_logs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_webhook_logs_created_at ON webhook_logs (created_at DESC);
CREATE INDEX idx_webhook_logs_order_id ON webhook_logs (order_id);