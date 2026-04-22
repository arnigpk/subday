UPDATE public.auto_notification_templates
SET 
  message_template = E'Рядом {{count}} кофейни ☕\n{{shops_list}}\n\nЗабери свой кофе по подписке прямо сейчас!',
  trigger_config = jsonb_set(
    COALESCE(trigger_config, '{}'::jsonb),
    '{max_shops_per_check}',
    '3'::jsonb,
    true
  )
WHERE trigger_type = 'geo_proximity';