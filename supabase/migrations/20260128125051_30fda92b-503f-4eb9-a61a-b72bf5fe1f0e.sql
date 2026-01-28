-- Add features column to subscription_types for customizable feature texts
ALTER TABLE public.subscription_types 
ADD COLUMN IF NOT EXISTS features text[] DEFAULT ARRAY['Любой кофейный напиток', 'Без ограничений по размеру', '1 напиток за визит', 'Во всех партнёрских кофейнях']::text[];