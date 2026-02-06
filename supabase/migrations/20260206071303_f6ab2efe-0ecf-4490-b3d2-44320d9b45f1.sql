-- Add payment_order_id reference to subscription_transactions
ALTER TABLE public.subscription_transactions
ADD COLUMN IF NOT EXISTS payment_order_id UUID REFERENCES public.payment_orders(id);

-- Add payment_method column
ALTER TABLE public.subscription_transactions
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Add index
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_payment_order
ON public.subscription_transactions(payment_order_id);