-- Add strict RLS policies to otp_codes table
-- Edge functions use service role key, so they bypass RLS
-- Client-side access should be completely blocked

-- Policy: No direct SELECT access from clients
CREATE POLICY "No direct client access to otp_codes"
ON public.otp_codes
FOR SELECT
USING (false);

-- Policy: No direct INSERT access from clients
CREATE POLICY "No direct client insert to otp_codes"
ON public.otp_codes
FOR INSERT
WITH CHECK (false);

-- Policy: No direct UPDATE access from clients
CREATE POLICY "No direct client update to otp_codes"
ON public.otp_codes
FOR UPDATE
USING (false);

-- Policy: No direct DELETE access from clients
CREATE POLICY "No direct client delete to otp_codes"
ON public.otp_codes
FOR DELETE
USING (false);