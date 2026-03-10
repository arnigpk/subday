
UPDATE auto_notification_templates 
SET message_template = '🎉 Новая оплата подписки!' || E'\n\n' || '👤 Имя: {{name}}' || E'\n' || '📦 Подписка: {{subscription_name}}' || E'\n' || '💰 Сумма: {{amount}} ₸' || E'\n' || '🆔 Заказ: {{order_id}}'
WHERE trigger_type = 'admin_payment' AND message_template NOT LIKE '%{{name}}%';

UPDATE auto_notification_templates 
SET message_template = '🎉 Новая оплата подписки! (спецпредложение)' || E'\n\n' || '👤 Имя: {{name}}' || E'\n' || '📦 Подписка: {{subscription_name}}' || E'\n' || '💰 Сумма: {{amount}} ₸' || E'\n' || '🆔 Заказ: {{order_id}}'
WHERE trigger_type = 'admin_payment_special' AND message_template NOT LIKE '%{{name}}%';
