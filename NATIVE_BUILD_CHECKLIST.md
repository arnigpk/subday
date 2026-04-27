# Native Build Checklist (iOS & Android)

Этот файл — пошаговый чеклист для сборки и проверки нативных приложений на основе текущего кода (Capacitor + `@capacitor/camera`, `@capacitor/push-notifications`, `@capacitor/geolocation`).

> Запускать **после каждого `git pull`** из Lovable.

---

## 0. Базовая синхронизация (общая для iOS и Android)

```bash
npm install
npm run build
npx cap sync
```

`cap sync` автоматически:
- копирует `dist/` в `ios/App/App/public` и `android/app/src/main/assets/public`
- обновляет нативные плагины (Camera, Push, Geolocation)
- инжектит требуемые permissions в `AndroidManifest.xml` и `Info.plist`

Проверить, что в `package.json` присутствуют:
- `@capacitor/core`, `@capacitor/cli`
- `@capacitor/ios`, `@capacitor/android`
- `@capacitor/camera`
- `@capacitor/push-notifications`
- `@capacitor/geolocation`

---

## 1. iOS

### 1.1 Info.plist — обязательные ключи

Открыть `ios/App/App/Info.plist` и убедиться, что присутствуют (если нет — добавить вручную, Capacitor их **не** добавляет автоматически):

```xml
<key>NSCameraUsageDescription</key>
<string>Камера используется для сканирования QR-кодов клиентов в кабинете партнёра.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Доступ к фото нужен для загрузки изображений в посты #subFlow и аватар.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>Сохранение изображений из приложения в галерею.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Геолокация используется для подбора ближайших кофеен и push-уведомлений рядом с заведениями.</string>

<key>NSMicrophoneUsageDescription</key>
<string>Микрофон используется при записи видео для постов #subFlow.</string>
```

> ⚠️ Без `NSCameraUsageDescription` приложение **упадёт** при первом обращении к камере (требование App Store).

### 1.2 Push (APNs)

1. В Xcode → таргет `App` → **Signing & Capabilities** → `+ Capability` → **Push Notifications**.
2. Добавить **Background Modes** → отметить *Remote notifications*.
3. В Apple Developer → создать APNs Key (`.p8`) и загрузить в Firebase Console → Project Settings → Cloud Messaging → Apple app configuration.
4. Bundle ID должен совпадать с `appId` из `capacitor.config.ts`: `app.lovable.1f0fb7ffd23642dc84de6a2e07064142`.

### 1.3 Сборка

```bash
npx cap open ios
```
В Xcode: выбрать устройство → ⌘R.

### 1.4 Smoke-test (iOS)

- [ ] Первый запуск: появляются системные диалоги Push → Geo → Camera (с задержкой).
- [ ] Войти как партнёр → раздел «Сканер» → камера запускается без ошибок, видно превью, QR распознаётся.
- [ ] Если отказать в камере → в QRScanner появляется текст «Откройте настройки телефона → разрешения приложения и включите камеру.» и кнопка «Попробовать снова».
- [ ] Settings → vhod → Camera/Notifications/Location — все три тумблера присутствуют.
- [ ] Push: отправить тестовый пуш через `/admin/push-broadcast` → уведомление приходит на устройство (foreground и background).
- [ ] Pre-order: оформить предзаказ → push доставляется (не только in-app).

---

## 2. Android

### 2.1 AndroidManifest — проверка

Открыть `android/app/src/main/AndroidManifest.xml` и убедиться, что присутствуют (Capacitor добавляет их автоматически после `cap sync`, но проверить нужно):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />

<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
```

> Если каких-то permissions нет — `cap sync` их подтянет при наличии соответствующих плагинов. Если всё равно нет — добавить вручную в `<manifest>` блок.

### 2.2 FCM (Firebase Cloud Messaging)

1. Скачать `google-services.json` из Firebase Console (Project Settings → Your apps → Android).
2. Положить в `android/app/google-services.json`.
3. Проверить, что в `android/build.gradle` есть classpath `com.google.gms:google-services`, а в `android/app/build.gradle` — `apply plugin: 'com.google.gms.google-services'`.
4. Application ID (`android/app/build.gradle` → `applicationId`) должен совпадать с `appId` из `capacitor.config.ts`.

### 2.3 Сборка

```bash
npx cap open android
```
В Android Studio: Sync Project → Run ▶ на устройстве/эмуляторе.

Для APK для теста:
```bash
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### 2.4 Smoke-test (Android)

- [ ] Первый запуск: появляются системные диалоги Notifications (Android 13+) → Location → Camera.
- [ ] Войти как партнёр → «Сканер» → камера запускается, видно превью с overlay, QR распознаётся.
- [ ] Отказ в камере: QRScanner показывает понятное сообщение (без слов «браузер»).
- [ ] Settings → Apps → vhod → Permissions: видны Camera, Location, Notifications.
- [ ] Push приходит на устройство (foreground + background + закрытое приложение).
- [ ] Pre-order, subflow follow-post, geo-уведомления — все каналы доставляют push.

---

## 3. Что проверено в коде

- `src/components/partner/QRScanner.tsx`
  - `ensureNativeCameraPermission()` вызывает `Camera.requestPermissions()` на native (iOS/Android) до старта `Html5Qrcode.start()`.
  - При отказе показывается нейтральная инструкция «откройте настройки телефона», без упоминания браузера.
  - Корректная остановка/очистка камеры при размонтировании компонента.

- `src/components/permissions/PermissionsBootstrap.tsx`
  - При первом запуске на native запрашивает Push → Geo → Camera последовательно.
  - Флаг `permissions_camera_requested` хранится в localStorage, чтобы не дублировать запрос.

- `capacitor.config.ts`
  - `appId: app.lovable.1f0fb7ffd23642dc84de6a2e07064142`
  - `PushNotifications.presentationOptions: ['badge', 'sound', 'alert']` — пуши показываются в foreground на iOS.

---

## 4. Если что-то не работает

| Симптом | Причина | Решение |
|---|---|---|
| Приложение крашится при открытии сканера на iOS | Нет `NSCameraUsageDescription` | Добавить ключ в `Info.plist` (см. 1.1) |
| Системный диалог камеры не появляется на Android | Не сделан `cap sync` после установки `@capacitor/camera` | `npx cap sync android` |
| Push не приходит на iOS | Нет APNs Key в Firebase или не включена Capability | См. 1.2 |
| Push не приходит на Android | `google-services.json` отсутствует или неверный | См. 2.2 |
| QR-код не распознаётся | Камера запущена, но фокус плохой | Поднести ближе, проверить освещение |

---

## 5. Релизная сборка

### iOS
```bash
# В Xcode: Product → Archive → Distribute App → App Store Connect
```

### Android
```bash
cd android
./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
```

Перед релизом убедиться, что в `capacitor.config.ts` **закомментирован** или удалён блок `server.url` (live-reload), иначе release-сборка будет тянуть код с lovableproject.com.
