<div align="center">

# ☕ SubDay

**Платформа кофе-подписок для кофеен Казахстана**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Supabase](https://img.shields.io/badge/Supabase-Self--hosted-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

</div>

---

## О проекте

**SubDay** — мобильное приложение для управления кофе-подписками. Пользователь покупает подписку и получает фиксированное количество кофе в месяц в партнёрских кофейнях. Списание происходит через QR-код — партнёр сканирует QR клиента при выдаче напитка.

### Для кого

| Роль | Что делает |
|---|---|
| **Клиент** | Покупает подписку, получает QR, следит за остатком |
| **Партнёр (кофейня)** | Сканирует QR, просматривает историю, управляет баристами |
| **Администратор** | Управляет кофейнями, подписками, пользователями, статистикой |

---

## Стек

### Frontend
- **React 18** + **TypeScript** — UI
- **Vite 5** — сборка
- **Tailwind CSS** + **shadcn/ui** (Radix UI) — компоненты
- **React Router v6** — роутинг
- **TanStack Query** — кэширование запросов
- **Framer Motion** — анимации

### Backend
- **Supabase** (self-hosted, Docker) — база данных PostgreSQL, Auth, Edge Functions, Realtime
- **Deno** — runtime для Edge Functions
- **Firebase** — push-уведомления (FCM + APNs)

### Мобильное приложение
- **Capacitor 8** — нативная обёртка (iOS / Android)
- **@capacitor/camera** — сканирование QR
- **@capacitor/push-notifications** — push-уведомления
- **@capacitor/geolocation** — геолокация для ближайших кофеен

### Оплата
- **Kaspi Pay** — приём платежей (Казахстан)

---

## Основные функции

- Кофе-подписки с ограничением по количеству напитков
- QR-код с анимацией (частицы) для списания
- Сканер QR в партнёрской панели (нативная камера)
- Гостевой кофе — подарить другу один бесплатный кофе
- Лента #subFlow — посты, сторис, реклама
- Push-уведомления (через Telegram-бот и FCM)
- Предзаказы напитков
- Многоязычность (KZ / RU)
- Поддержка нескольких кофеен у одного партнёра
- Статистика и CSV-отчёты для администратора
- PWA + нативные приложения iOS / Android

---

## Быстрый старт

### Требования
- Node.js 18+
- npm или bun

### Установка

```bash
# 1. Клонировать репозиторий
git clone https://github.com/GeorgeTolen/WebSubDay.git
cd WebSubDay

# 2. Установить зависимости
npm install

# 3. Создать файл переменных окружения
cp .env.example .env
# Заполнить .env своими значениями

# 4. Запустить dev-сервер
npm run dev
```

### Переменные окружения

```env
VITE_SUPABASE_URL=https://api.yourproject.app
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```

---

## Сборка

```bash
# Web (PWA)
npm run build

# После сборки — синхронизировать в мобильные платформы
npx cap sync
```

### iOS
```bash
npx cap open ios
# Затем в Xcode: Product → Archive → Distribute App → App Store Connect
```

### Android
```bash
npx cap open android
# Или релизный AAB:
cd android && ./gradlew bundleRelease
```

> Подробнее о нативной сборке см. [NATIVE_BUILD_CHECKLIST.md](./NATIVE_BUILD_CHECKLIST.md)

---

## Структура проекта

```
vhod/
├── src/
│   ├── components/        # UI-компоненты
│   │   ├── admin/         # Компоненты админ-панели
│   │   ├── partner/       # Компоненты партнёрской панели
│   │   ├── home/          # Главный экран клиента
│   │   └── ui/            # shadcn/ui базовые компоненты
│   ├── pages/
│   │   ├── admin/         # Страницы администратора
│   │   ├── partner/       # Страницы партнёра
│   │   └── ...            # Страницы клиента
│   ├── hooks/             # React-хуки
│   ├── utils/             # Утилиты (CSV-экспорт, форматирование)
│   └── integrations/      # Supabase клиент
├── supabase/
│   ├── functions/         # Edge Functions (Deno)
│   └── migrations/        # SQL-миграции
├── android/               # Нативный Android-проект
├── capacitor.config.ts    # Конфигурация Capacitor
└── .env.example           # Пример переменных окружения
```

---

## Деплой

### Web
```bash
npm run build
# Загрузить dist/ на сервер (nginx, /var/www/web/)
```

### Edge Functions
Edge Functions хранятся на сервере в `/opt/subday-backend/volumes/functions/` и деплоятся перезапуском Docker-контейнера.

---

## Лицензия

Проприетарное программное обеспечение. Все права защищены.

---

<div align="center">
Made with ☕ in Kazakhstan
</div>
