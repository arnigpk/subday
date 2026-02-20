

# Подготовка приложения к публикации в Google Play и App Store

## Обзор

Комплексная подготовка включает: конфигурация Capacitor, генерация иконок/splash screen, настройка Universal Links и App Links, визуальная подсказка на странице приглашения, и синхронизация вибрации по всем разделам.

---

## 1. Конфигурация Capacitor

### Файл: `capacitor.config.ts` (новый)

Создать конфигурацию Capacitor с параметрами:
- `appId`: `app.lovable.1f0fb7ffd23642dc84de6a2e07064142`
- `appName`: `vhod`
- `webDir`: `dist`
- Серверный блок для hot-reload в dev-режиме (URL: sandbox preview)
- Плагины: SplashScreen (автоматическое скрытие через 2 секунды), StatusBar (стиль Light)

---

## 2. Иконки и Splash Screen

### Новые файлы в `public/`:
- `icon-192.png` -- иконка 192x192 (для PWA и Android)
- `icon-512.png` -- иконка 512x512 (для PWA и Android)
- `icon-1024.png` -- иконка 1024x1024 (для App Store)
- `splash.png` -- splash screen (2732x2732, центральный логотип)

Поскольку в Lovable нельзя генерировать изображения программно, будет создан скрипт-инструкция и SVG-заглушки, а также обновлён PWA-манифест в `vite.config.ts` для использования правильных иконок.

### Обновление `vite.config.ts`:
- Обновить массив `icons` в PWA-манифесте для поддержки PNG-иконок всех размеров
- Добавить `apple-touch-icon` meta-тег

### Обновление `index.html`:
- Добавить `<link rel="apple-touch-icon">` для iOS
- Добавить meta-тег `apple-mobile-web-app-title`

---

## 3. Universal Links (iOS) и App Links (Android)

### Файл: `public/.well-known/assetlinks.json` (новый)
- Конфигурация Android App Links с SHA256 fingerprint (placeholder для заполнения после сборки)

### Файл: `public/.well-known/apple-app-site-association` (новый)
- Конфигурация Universal Links для iOS с Team ID и Bundle ID (placeholder)
- Маршруты: `/`, `/packages/*`, `/shops/*`, `/redeem`, `/profile`, `/gift-coffee`, `/subflow`

---

## 4. Визуальная подсказка "Где найти ID" на странице приглашения

### Файл: `src/pages/GiftCoffeePage.tsx`

Заменить текстовый блок-подсказку на визуальную мини-схему профиля:
- Нарисовать стилизованный мини-профиль с помощью CSS/HTML (аватар-заглушка, имя, строка "ID: 123456" с выделением)
- Стрелка или подсветка на строке ID, чтобы визуально показать где именно искать
- Сохранить переводы `guest.whereToFindId` и `guest.whereToFindIdDesc`

---

## 5. Синхронизация вибрации по всем разделам

Вибрация уже подключена в: BottomNav, SubFlowPost, RedeemPage, PartnerScanPage, App (при загрузке).

### Добавить вибрацию в:

| Файл | Действие | Тип вибрации |
|------|----------|-------------|
| `src/pages/GiftCoffeePage.tsx` | Успешная выдача гостевого доступа | `vibrateSuccess` |
| `src/pages/GiftCoffeePage.tsx` | Ошибка при выдаче | `vibrateError` |
| `src/pages/ProfilePage.tsx` | Копирование ID | `vibrateShort` |
| `src/pages/ProfilePage.tsx` | Сохранение имени | `vibrateSuccess` |
| `src/pages/ProfilePage.tsx` | Выход из аккаунта | `vibrate` |
| `src/pages/PackageDetailPage.tsx` | Покупка подписки | `vibrateSuccess` |
| `src/components/stories/StoryAvatar.tsx` | Открытие истории | `vibrateShort` |
| `src/pages/HomePage.tsx` | Pull-to-refresh завершён | `vibrateShort` |

---

## Технические детали

### `capacitor.config.ts`
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1f0fb7ffd23642dc84de6a2e07064142',
  appName: 'vhod',
  webDir: 'dist',
  server: {
    url: 'https://1f0fb7ff-d236-42dc-84de-6a2e07064142.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      autoHideTimeout: 2000,
      backgroundColor: '#FAF9F6',
    },
  },
};

export default config;
```

### `public/.well-known/apple-app-site-association`
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["TEAM_ID.app.lovable.1f0fb7ffd23642dc84de6a2e07064142"],
        "paths": ["/*"]
      }
    ]
  }
}
```

### `public/.well-known/assetlinks.json`
```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.lovable.1f0fb7ffd23642dc84de6a2e07064142",
      "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
    }
  }
]
```

### Мини-профиль в GiftCoffeePage (визуальная подсказка)
Стилизованный блок с CSS, имитирующий экран профиля: круглый аватар, имя, выделенная строка "ID: 123456" с пульсирующей рамкой для привлечения внимания.

---

## После реализации -- что нужно сделать вам

1. Заменить placeholder-иконки (icon-192.png, icon-512.png, icon-1024.png, splash.png) на реальные
2. В `apple-app-site-association` заменить `TEAM_ID` на ваш Apple Developer Team ID
3. В `assetlinks.json` заменить `YOUR_SHA256_FINGERPRINT` на SHA256 из вашего Android keystore
4. Перед финальной сборкой для Store -- удалить `server.url` из `capacitor.config.ts`
5. Выполнить:
   ```
   npm install
   npx cap add ios && npx cap add android
   npm run build && npx cap sync
   npx cap open ios  # или npx cap open android
   ```

