-- Гостевой кофе: новый формат текста с именем отправителя.
-- Раньше: "Поздравляем, ваш друг подарил вам ... попробуйте subday 💚"
-- Теперь: "{{sender_name}} подарил вам {{count}} кофе на 14 дней, приятного кофе 💚"
UPDATE public.auto_notification_templates
SET message_template = '{{sender_name}} подарил вам {{count}} кофе на 14 дней, приятного кофе 💚'
WHERE trigger_type = 'guest_coffee';
