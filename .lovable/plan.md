

# Кроссплатформенная вибрация через Capacitor Haptics

## Что изменится
Хук `useVibration` будет обновлён: на нативных платформах (iOS/Android) используется плагин `@capacitor/haptics` для настоящего тактильного отклика, а в браузере остаётся стандартный `navigator.vibrate()` как фолбэк.

## Как это работает

```text
useVibration()
  |
  +--> Capacitor Native? (iOS / Android app)
  |      YES --> @capacitor/haptics (Taptic Engine на iPhone, Vibrator на Android)
  |
  +--> Web Browser?
         YES --> navigator.vibrate() (работает на Android Chrome, игнорируется на Safari)
```

## Совместимость

| Платформа | Текущее поведение | После изменений |
|-----------|------------------|-----------------|
| Android (Play Store) | Работает через navigator.vibrate | Работает через Haptics (лучше) |
| iOS (App Store) | НЕ работает | Работает через Taptic Engine |
| Android браузер | Работает | Работает (без изменений) |
| iOS Safari | Не работает | Не работает (ограничение Apple) |

## Технические детали

### Новая зависимость
- `@capacitor/haptics` -- нативный плагин для вибрации

### Файл: `src/hooks/useVibration.ts`

Обновить логику:
1. Импортировать `Haptics` и `ImpactStyle` из `@capacitor/haptics`
2. Определять, запущено ли приложение в нативном контейнере Capacitor (через `Capacitor.isNativePlatform()`)
3. Если нативное -- использовать `Haptics.impact()` с разными стилями:
   - `vibrateShort` -- `ImpactStyle.Light` (лёгкий тап)
   - `vibrateSuccess` -- `ImpactStyle.Medium` (двойной средний тап через `Haptics.notification({ type: 'SUCCESS' })`)
   - `vibrateError` -- `ImpactStyle.Heavy` (сильная вибрация через `Haptics.notification({ type: 'ERROR' })`)
4. Если браузер -- оставить текущий `navigator.vibrate()` без изменений

### Файл: `src/App.tsx`
Никаких изменений -- хук уже подключён и используется.

## Итог
- Одна строка установки (`@capacitor/haptics`)
- Один файл изменений (`useVibration.ts`)
- Вибрация заработает на обеих платформах при запуске через Capacitor
