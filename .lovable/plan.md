

# План: Переход на WhatsApp OTP вместо SMS

## Обзор

Для отправки кодов подтверждения через WhatsApp будет использоваться существующий провайдер SMSC.kz с добавлением параметра `bot=wa:<номер>`. Это минимальные изменения в коде при сохранении всей текущей логики.

## Предварительные требования

Перед реализацией необходимо:

1. **Подключить WhatsApp Business номер в SMSC.kz**
   - Зайти в личный кабинет SMSC.kz
   - Подключить услугу WhatsApp-рассылки
   - Получить номер отправителя WhatsApp (формат: `79XXXXXXXXX`)

2. **Зарегистрировать шаблон сообщения**
   - SMSC.kz требует регистрации шаблонов для WhatsApp
   - Зарегистрировать шаблон: `subday: ваш код {{code}}`

## Изменения

### 1. Добавление секрета для WhatsApp номера

Добавить новый секрет:
- `WHATSAPP_BOT_NUMBER` - номер WhatsApp бота (например: `77077000994`)

### 2. Обновление Edge Function `send-otp`

```text
Изменения в supabase/functions/send-otp/index.ts:
```

- Получить `WHATSAPP_BOT_NUMBER` из переменных окружения
- Изменить URL запроса с добавлением параметра `bot=wa:<номер>`
- Убрать отправку SMS, использовать только WhatsApp

Ключевые изменения в коде:
```typescript
// Добавить получение номера WhatsApp
const whatsappBotNumber = Deno.env.get('WHATSAPP_BOT_NUMBER')!

// Изменить URL на WhatsApp
const smsUrl = new URL('https://smsc.kz/sys/send.php')
smsUrl.searchParams.set('login', smscLogin)
smsUrl.searchParams.set('psw', smscPassword)
smsUrl.searchParams.set('phones', formattedPhone)
smsUrl.searchParams.set('mes', message)
smsUrl.searchParams.set('fmt', '3')
smsUrl.searchParams.set('charset', 'utf-8')
smsUrl.searchParams.set('bot', `wa:${whatsappBotNumber}`)  // <-- Добавить параметр bot
```

### 3. Обновление UI компонентов

**LoginScreen.tsx:**
- Изменить текст "Код из SMS" → "Код из WhatsApp"
- Изменить сообщение "Отправили на..." → "Отправили в WhatsApp на..."

**RegisterScreen.tsx:**
- Аналогичные изменения текста

### 4. Обновление сообщений toast

- Изменить "Код отправлен!" → "Код отправлен в WhatsApp!"

## Файлы для изменения

| Файл | Изменения |
|------|-----------|
| `supabase/functions/send-otp/index.ts` | Добавить параметр `bot=wa:...` для WhatsApp |
| `src/components/auth/LoginScreen.tsx` | Обновить UI тексты на WhatsApp |
| `src/components/auth/RegisterScreen.tsx` | Обновить UI тексты на WhatsApp |

## Технические детали

### API SMSC.kz для WhatsApp

Формат запроса:
```
https://smsc.kz/sys/send.php?login=<login>&psw=<password>&phones=<phones>&mes=<message>&bot=wa:<botnumber>
```

Параметры:
- `phones` - номер получателя в международном формате
- `mes` - текст сообщения
- `bot` - WhatsApp бот в формате `wa:79XXXXXXXXX`

### Ограничения

1. Пользователь должен иметь WhatsApp на указанном номере
2. Шаблоны сообщений должны быть зарегистрированы в SMSC.kz
3. Стоимость WhatsApp сообщения может отличаться от SMS

## Альтернативный вариант: Fallback на SMS

При необходимости можно реализовать резервную отправку через SMS, если WhatsApp недоступен:

```typescript
// Попробовать WhatsApp
let result = await sendWhatsApp(...)
if (result.error) {
  // Fallback на SMS
  result = await sendSMS(...)
}
```

Это можно добавить позже при необходимости.

## Важно

После реализации обязательно:
1. Протестировать отправку на реальный WhatsApp номер
2. Убедиться что шаблон одобрен в SMSC.kz
3. Проверить корректность формата номера телефона

