-- Create broadcast_messages table to store broadcast history
CREATE TABLE public.broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  broadcast_type TEXT NOT NULL CHECK (broadcast_type IN ('telegram', 'push')),
  target_type TEXT NOT NULL CHECK (target_type IN ('all', 'specific')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.broadcast_messages ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage broadcast history
CREATE POLICY "Admins can view broadcast history"
ON public.broadcast_messages
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert broadcast messages"
ON public.broadcast_messages
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete broadcast messages"
ON public.broadcast_messages
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create subscription_transactions table to track subscription purchases/activations
CREATE TABLE public.subscription_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_type_id UUID REFERENCES public.subscription_types(id),
  subscription_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'admin_activation')),
  activated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions, admins can view all
CREATE POLICY "Users can view own subscription transactions"
ON public.subscription_transactions
FOR SELECT
USING (
  auth.uid() = user_id OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'moderator'::app_role)
);

-- Admins can manage all transactions
CREATE POLICY "Admins can manage subscription transactions"
ON public.subscription_transactions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add subscription_name column to redemptions table to track which subscription was used
ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS subscription_name TEXT;