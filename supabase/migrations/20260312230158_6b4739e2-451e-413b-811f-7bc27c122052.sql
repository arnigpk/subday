-- Relax target_type constraint to support audience-based values (e.g. no_subscription, subscribers,new_users)
ALTER TABLE public.broadcast_messages
DROP CONSTRAINT IF EXISTS broadcast_messages_target_type_check;

ALTER TABLE public.broadcast_messages
ADD CONSTRAINT broadcast_messages_target_type_check
CHECK (char_length(trim(target_type)) > 0);