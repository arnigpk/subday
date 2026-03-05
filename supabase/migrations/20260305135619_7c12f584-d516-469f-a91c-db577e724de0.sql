
-- Auto notification templates table for admin management
CREATE TABLE public.auto_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_type text NOT NULL, -- 'activated', 'low_balance', 'expiring_soon', 'custom'
  channel text NOT NULL DEFAULT 'telegram', -- 'telegram', 'push', 'both'
  message_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"threshold": 5} for low_balance
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification templates"
ON public.auto_notification_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active templates"
ON public.auto_notification_templates
FOR SELECT
TO authenticated
USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

-- Insert default templates
INSERT INTO public.auto_notification_templates (name, trigger_type, channel, message_template, trigger_config) VALUES
('Подписка активирована', 'activated', 'telegram', '🎉 Подписка {{subscription_name}} активирована 🚀 Наслаждайтесь😌', '{}'),
('Низкий баланс (5)', 'low_balance', 'telegram', '⚠️ У вас осталось {{count}} {{unit}} по подписке {{subscription_name}}', '{"threshold": 5}'),
('Низкий баланс (2)', 'low_balance', 'telegram', '⚠️ У вас осталось {{count}} {{unit}} по подписке {{subscription_name}}', '{"threshold": 2}'),
('Скоро истекает (5 дней)', 'expiring_soon', 'telegram', '⚠️ У вас осталось {{count}} {{unit}} до окончания подписки {{subscription_name}}', '{"threshold": 5}'),
('Скоро истекает (2 дня)', 'expiring_soon', 'telegram', '⚠️ У вас осталось {{count}} {{unit}} до окончания подписки {{subscription_name}}', '{"threshold": 2}');
