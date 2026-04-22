UPDATE public.auto_notification_templates
SET 
  message_template = 'Загляни на кофе по подписке: {{shops_inline}}',
  trigger_config = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(trigger_config, '{}'::jsonb),
        '{max_shops_per_check}',
        '3'::jsonb,
        true
      ),
      '{dominant_gap_m}',
      '150'::jsonb,
      true
    ),
    '{title}',
    '"Кофейня рядом ☕"'::jsonb,
    true
  )
WHERE trigger_type = 'geo_proximity';