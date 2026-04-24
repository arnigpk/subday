

## План: Запрос разрешений на геолокацию и push-уведомления при входе

### Цель
При первом запуске приложения (web, iOS, Android, Telegram MiniApp) пользователь должен увидеть нативные системные диалоги запроса:
1. **Геолокация** (для гео-уведомлений «Кофейня рядом» и расчёта расстояний)
2. **Push-уведомления** (для системных алертов, рассылок, гео-пушей)

Сейчас разрешения запрашиваются разрозненно: гео — только когда хук `useGeolocation` смонтирован на странице кофеен, push — только при ручном клике в профиле. Это снижает opt-in rate.

### Что будет сделано

**1. Новый компонент `PermissionsBootstrap`**
- Файл: `src/components/permissions/PermissionsBootstrap.tsx`
- Монтируется в `src/App.tsx` сразу после авторизации пользователя (внутри защищённой части, чтобы не показывать диалоги на экране логина).
- Срабатывает один раз за сессию (флаг в `localStorage`: `permissions_bootstrap_v1`).
- Последовательно (не одновременно — чтобы не пугать пользователя двумя системными попапами сразу) запрашивает:
  - **Шаг 1:** Push-уведомления
  - **Шаг 2:** Геолокация (через 800 мс после ответа на шаг 1)

**2. Логика по платформам**

| Платформа | Push | Геолокация |
|---|---|---|
| **iOS native (Capacitor)** | `PushNotifications.requestPermissions()` + `register()` | `Geolocation.requestPermissions()` от `@capacitor/geolocation` |
| **Android native (Capacitor)** | То же + runtime permission `POST_NOTIFICATIONS` (Android 13+) | `Geolocation.requestPermissions()` |
| **Telegram MiniApp** | `tg.requestWriteAccess()` (бот-уведомления) | `tg.LocationManager.init()` + `getLocation()` (Bot API 8.0+), fallback на `navigator.geolocation` |
| **Web (PWA / браузер)** | `Notification.requestPermission()` | `navigator.geolocation.getCurrentPosition()` |

**3. Мягкий pre-prompt (Liquid Glass dialog)**
Перед нативным диалогом показываем краткое объяснение «зачем» — это повышает opt-in и даёт второй шанс, если юзер нажмёт «Не сейчас» (нативный диалог можно показать только один раз).
- Заголовок: «Включите уведомления и геолокацию»
- 2 пункта с иконками: 🔔 «Узнавайте о новых акциях и о том, что подписка скоро закончится» / 📍 «Подсказываем, когда вы рядом с кофейней-партнёром»
- Кнопки: «Разрешить» (запускает нативные запросы) / «Позже» (откладывает на 7 дней).

**4. Установка зависимости**
- `@capacitor/geolocation` — сейчас не установлен; нужен для нативного запроса разрешения геолокации на iOS/Android.

**5. Конфигурация iOS / Android**
Добавить инструкцию в README, что после `npx cap sync` нужно один раз вручную добавить в нативные проекты:
- **iOS** (`ios/App/App/Info.plist`): `NSLocationWhenInUseUsageDescription`, `NSUserNotificationsUsageDescription` (тексты на RU).
- **Android** (`android/app/src/main/AndroidManifest.xml`): `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `POST_NOTIFICATIONS` (Android 13+).

**6. Сохранение результатов**
- Push: при `granted` сохраняем FCM/APNs токен в таблицу `device_tokens` (логика уже есть в `useNotificationSettings`).
- Геолокация: первая полученная координата кешируется в `localStorage` (логика уже есть в `useGeolocation`), плюс обновляется флаг `geolocation_permission`.

**7. Синхронизация с существующим кодом**
- `useGeolocation` — уже использует кеш разрешения, так что после bootstrap он мгновенно получит координаты без повторного запроса.
- `useNotificationSettings` — переиспользуем функцию `togglePush`, чтобы не дублировать логику регистрации FCM.
- Профиль (`/profile`) — переключатели остаются, пользователь сможет выключить/включить вручную.

### Технические детали

**Файлы:**
- ➕ `src/components/permissions/PermissionsBootstrap.tsx` (новый, основной)
- ➕ `src/components/permissions/PermissionsPrePrompt.tsx` (Liquid Glass dialog)
- ✏️ `src/App.tsx` — монтаж `<PermissionsBootstrap />` внутри authed-области
- ✏️ `package.json` — добавить `@capacitor/geolocation`
- ✏️ `README.md` — инструкции по `Info.plist` / `AndroidManifest.xml`

**Edge cases:**
- Если пользователь в TMA — push заменяется на `tg.requestWriteAccess` (разрешение боту писать).
- Если уже `granted` (из прошлой сессии) — пропускаем шаг молча.
- Если `denied` — записываем в localStorage, не дёргаем повторно. В профиле остаётся ссылка «Открыть настройки», чтобы юзер включил вручную.
- На странице `/auth` (логин/регистрация) bootstrap НЕ срабатывает — только после успешного входа.

### Что НЕ меняется
- Существующая логика `useGeoNotifications`, `useNotificationSettings`, `useGeolocation` остаётся как есть — bootstrap только «дёргает» их раньше.
- RLS, edge-функции, UI профиля — без изменений.

