
-- Table for SubFlow ads created by admin
CREATE TABLE public.subflow_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  image_url text,
  link_type text NOT NULL DEFAULT 'shop', -- 'shop', 'instagram', 'whatsapp', 'telegram', 'external'
  link_value text, -- shop_id or URL
  shop_id uuid REFERENCES public.shops(id),
  shop_name text,
  frequency integer NOT NULL DEFAULT 10, -- show every N posts
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.subflow_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage subflow ads" ON public.subflow_ads
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active subflow ads" ON public.subflow_ads
  FOR SELECT USING (is_active = true OR has_role(auth.uid(), 'admin'::app_role));

-- Table for partner ad requests
CREATE TABLE public.ad_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id text,
  shop_name text NOT NULL,
  partner_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ad requests" ON public.ad_requests
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Partners can view own ad requests" ON public.ad_requests
  FOR SELECT USING (auth.uid() = partner_user_id);

CREATE POLICY "Partners can insert ad requests" ON public.ad_requests
  FOR INSERT WITH CHECK (auth.uid() = partner_user_id);
