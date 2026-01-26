-- Enable realtime for redemptions table to allow users to see when their QR is scanned
ALTER PUBLICATION supabase_realtime ADD TABLE public.redemptions;