
# Telegram Mini App с автоматическим входом в subday

## Обзор

Создание Telegram Mini App, при открытии которого пользователь автоматически авторизуется на сайте subday без ввода каких-либо данных. Telegram передаёт информацию о пользователе через `initData`, которую мы валидируем на бэкенде и создаём/авторизуем пользователя.

## Как это будет работать

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Пользователь  │────▶│  Telegram Mini   │────▶│    subday.app   │
│   в Telegram    │     │   App открыт     │     │   автологин     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         │    1. Открывает       │                        │
         │       Mini App        │                        │
         │──────────────────────▶│                        │
         │                       │                        │
         │                       │  2. Telegram передаёт  │
         │                       │     initData (user_id, │
         │                       │     имя, username)     │
         │                       │───────────────────────▶│
         │                       │                        │
         │                       │  3. Бэкенд проверяет   │
         │                       │     подпись initData   │
         │                       │◀───────────────────────│
         │                       │                        │
         │                       │  4. Возвращает session │
         │                       │◀───────────────────────│
         │                       │                        │
         │                       │  5. Пользователь       │
         │                       │     авторизован!       │
         │◀──────────────────────│◀───────────────────────│
```

## Что нужно сделать

### 1. Настроить бота для Mini App

В @BotFather для вашего бота @subday_lgbot:
- Отправить `/newapp` и следовать инструкциям
- Указать URL: `https://vhod.lovable.app` (ваш продакшен URL)
- Добавить короткое имя (например: `subday`)

После этого Mini App будет доступен по ссылке: `https://t.me/subday_lgbot/subday`

### 2. Подключить Telegram WebApp SDK

Добавить скрипт Telegram в `index.html` для получения данных пользователя.

### 3. Создать edge function для авто-логина

Новая функция `telegram-miniapp-auth`:
- Получает `initData` от фронтенда
- Криптографически проверяет подпись (HMAC-SHA-256)
- Извлекает данные пользователя (telegram_id, имя, фото)
- Создаёт/находит пользователя в базе
- Возвращает сессию Supabase

### 4. Обновить фронтенд

Изменить `App.tsx`:
- Определять, запущено ли приложение внутри Telegram
- Если да — автоматически отправлять `initData` на бэкенд
- Получать сессию и логинить пользователя
- Никаких экранов авторизации не показывать

### 5. Адаптировать UI для Telegram

- Использовать тему Telegram (светлая/тёмная)
- Настроить кнопку "Назад" через `BackButton`
- Убрать лишние элементы навигации

---

## Технические детали

### Файлы для изменения/создания

| Файл | Действие |
|------|----------|
| `index.html` | Добавить Telegram WebApp SDK |
| `src/App.tsx` | Добавить логику определения Mini App и авто-логина |
| `src/hooks/useTelegramWebApp.ts` | Новый хук для работы с Telegram SDK |
| `supabase/functions/telegram-miniapp-auth/index.ts` | Новая edge function |
| `supabase/config.toml` | Добавить новую функцию |

### Структура initData от Telegram

```text
query_id=AAHdF6IQ...
&user={"id":279058397,"first_name":"Иван","last_name":"Петров","username":"ivan","language_code":"ru"}
&auth_date=1662771648
&hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2
```

### Алгоритм валидации подписи

1. Извлечь `hash` из initData
2. Отсортировать остальные параметры по алфавиту
3. Объединить в строку формата `key=value\nkey2=value2`
4. Создать секретный ключ: `HMAC-SHA256("WebAppData", BOT_TOKEN)`
5. Вычислить хеш: `HMAC-SHA256(secret_key, data_check_string)`
6. Сравнить вычисленный хеш с полученным

### Логика авторизации

```text
initData получен
       │
       ▼
Валидация подписи ─── Неверная ──▶ Ошибка
       │
       │ Верная
       ▼
Проверка auth_date ─── Истёк ──▶ Ошибка
       │
       │ Актуален
       ▼
Поиск пользователя по telegram_id
       │
       ├── Найден ──▶ signIn ──▶ Вернуть session
       │
       └── Не найден ──▶ createUser ──▶ signIn ──▶ Вернуть session
```

### Секреты

Используется существующий секрет `TELEGRAM_BOT_TOKEN` — никаких новых секретов не требуется.

### Типы TypeScript для Telegram WebApp

```typescript
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
      photo_url?: string;
    };
    auth_date: number;
    hash: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
  };
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
}
```

### Пример edge function (ключевые части)

```typescript
// Валидация подписи
async function validateTelegramWebAppData(initData: string, botToken: string): Promise<boolean> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  
  const dataCheckArr = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  const dataCheckString = dataCheckArr.join('\n');
  
  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const secretData = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
  
  // hash = HMAC-SHA256(secret_key, data_check_string)
  const dataKey = await crypto.subtle.importKey(
    'raw',
    secretData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(dataCheckString));
  
  const calculatedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return calculatedHash === hash;
}
```

## Поведение приложения

### При открытии из Telegram Mini App:
1. Показывается прелоадер
2. Автоматически отправляется initData на бэкенд
3. Пользователь сразу попадает на главную страницу
4. Экран авторизации **не показывается**

### При открытии в обычном браузере:
1. Показывается прелоадер
2. Показывается стандартный экран авторизации (SMS/Telegram)
3. Поведение не меняется

## Ограничения и особенности

- Mini App работает только внутри Telegram
- initData действителен ~24 часа (проверяем auth_date)
- Фото профиля доступно только для Premium пользователей или если явно разрешено
- Кнопка "Назад" управляется через Telegram API
