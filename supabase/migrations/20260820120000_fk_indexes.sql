-- Индексы на внешние ключи, у которых их не было.
-- Без индекса каждая выборка «дочерних строк по родителю» — это полный проход по
-- таблице, а удаление родителя проверяет ссылки тем же полным проходом. Сейчас
-- таблицы маленькие и это незаметно, но лента #subFlow растёт, и первым просядет
-- subflow_comments.post_id — выборка комментариев к посту.
-- Только добавление индексов: данные и схема не меняются.
CREATE INDEX IF NOT EXISTS idx_ad_banners_shop ON public.ad_banners (shop_id);
CREATE INDEX IF NOT EXISTS idx_ad_banners_special_offer ON public.ad_banners (special_offer_id);
CREATE INDEX IF NOT EXISTS idx_app_message_views_message ON public.app_message_views (message_id);
CREATE INDEX IF NOT EXISTS idx_guest_grants_sub_type ON public.guest_grants (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_sub_type ON public.payment_orders (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_created_by ON public.push_notifications (created_by);
CREATE INDEX IF NOT EXISTS idx_special_offers_target_sub_type ON public.special_offers (target_subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_subflow_ads_shop ON public.subflow_ads (shop_id);
CREATE INDEX IF NOT EXISTS idx_subflow_ads_special_offer ON public.subflow_ads (special_offer_id);
CREATE INDEX IF NOT EXISTS idx_subflow_comments_post ON public.subflow_comments (post_id);
CREATE INDEX IF NOT EXISTS idx_subflow_notifications_post ON public.subflow_notifications (post_id);
CREATE INDEX IF NOT EXISTS idx_subscription_transactions_sub_type ON public.subscription_transactions (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_user_offer_redemptions_offer ON public.user_offer_redemptions (offer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_sub_type ON public.user_subscriptions (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_iiko_menu_map_sub_type ON public.iiko_menu_map (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_poster_menu_map_sub_type ON public.poster_menu_map (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_rosta_menu_map_sub_type ON public.rosta_menu_map (subscription_type_id);
CREATE INDEX IF NOT EXISTS idx_b2b_allocations_account ON public.b2b_allocations (account_id);
CREATE INDEX IF NOT EXISTS idx_b2b_allocations_sub_type ON public.b2b_allocations (subscription_type_id);
