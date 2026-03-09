# Memory: features/subflow-social-network
Updated: now

Лента #subFlow оснащена системой уведомлений и подписок. Таблицы: `subflow_follows` (follower_id, following_id) и `subflow_notifications` (user_id, actor_id, type, post_id, reaction, is_read) с realtime. Edge Function `subflow-notify` отправляет Telegram уведомления и создаёт записи при реакциях, комментариях и новых постах от подписок. Кнопка «Подписаться/Подписан» отображается рядом с именем автора поста (если не свой). Колокольчик уведомлений в шапке SubFlowPage с badge непрочитанных и Sheet-панелью списка. Хук `useSubFlowFollow` управляет состоянием подписки.
