-- Create table for Telegram auth codes
CREATE TABLE public.telegram_auth_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  code TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  photo_url TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Enable RLS
ALTER TABLE public.telegram_auth_codes ENABLE ROW LEVEL SECURITY;

-- Block all direct client access (only edge functions with service role can access)
CREATE POLICY "No direct client access to telegram_auth_codes"
ON public.telegram_auth_codes
FOR SELECT
USING (false);

CREATE POLICY "No direct client insert to telegram_auth_codes"
ON public.telegram_auth_codes
FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct client update to telegram_auth_codes"
ON public.telegram_auth_codes
FOR UPDATE
USING (false);

CREATE POLICY "No direct client delete to telegram_auth_codes"
ON public.telegram_auth_codes
FOR DELETE
USING (false);

-- Index for faster lookups
CREATE INDEX idx_telegram_auth_codes_code ON public.telegram_auth_codes(code);
CREATE INDEX idx_telegram_auth_codes_telegram_id ON public.telegram_auth_codes(telegram_id);