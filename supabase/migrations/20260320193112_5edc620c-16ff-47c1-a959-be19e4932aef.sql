ALTER TABLE subscription_types ADD COLUMN max_volume text DEFAULT NULL;

CREATE TABLE public.qr_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.qr_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage qr_settings" ON public.qr_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view qr_settings" ON public.qr_settings FOR SELECT TO public USING (true);

INSERT INTO public.qr_settings (setting_key, setting_value) VALUES
  ('qr_title', 'Ваш QR'),
  ('qr_barista_text', 'Покажите бариста для сканирования'),
  ('qr_validity_text', 'QR действителен {seconds} сек'),
  ('qr_remaining_text', 'Осталось {count} {type}');