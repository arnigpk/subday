# Этап 1: Сборка (компилируем TypeScript)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Команда сборки (обычно это генерирует папку dist или build)
RUN npm run build

# Этап 2: Запуск (чистый образ для продакшена)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
# Устанавливаем только нужные для работы пакеты, без библиотек для разработки
RUN npm install --omit=dev
# Копируем готовый код из первого этапа
COPY --from=builder /app/dist ./dist 

# Открываем порт (чаще всего 3000, но проверь в своем коде)
EXPOSE 3000

# Запускаем скомпилированный файл (название папки dist или build зависит от настроек проекта)
CMD ["node", "dist/main.js"]
