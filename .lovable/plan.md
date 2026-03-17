## Стратегия открытия ссылок из двух источников

Задача сводится к тому, чтобы страница `i.subday.app/subflow/post/:id` **умно определяла**, куда перенаправить пользователя. Для этого нужно добавить параметр `?from=miniapp` или `?from=app` при шаринге, и на landing page использовать его для выбора действия.

---

### Сценарий 1: Шаринг из Telegram MiniApp → открыть MiniApp

При шаринге добавляем `?from=miniapp` к URL. На landing page (`SubFlowPostPage.tsx`), если `from=miniapp`:

- Перенаправляем на Telegram MiniApp ссылку: `https://t.me/subdaybot/app?startapp=post_{postId}`
- Это откроет MiniApp напрямую в Telegram

### Сценарий 2: Шаринг из нативного приложения → открыть приложение или стор

При шаринге из нативного приложения (Capacitor) добавляем `?from=app`. На landing page:

- Сначала пытаемся открыть через Universal Links / App Links (они уже настроены в `apple-app-site-association` и `assetlinks.json`) — если приложение установлено, iOS/Android автоматически откроют его
- Если приложение не установлено — определяем платформу и редиректим в App Store или Google Play:
  - iOS → `https://apps.apple.com/app/id{YOUR_APP_ID}`
  - Android → `https://play.google.com/store/apps/details?id=app.lovable.1f0fb7ffd23642dc84de6a2e07064142`

**Важно:** Universal Links работают автоматически, если `apple-app-site-association` настроен правильно с реальным `TEAM_ID`. Нужно будет заменить `TEAM_ID` на настоящий Apple Team ID после публикации в App Store.

---

### Технические изменения

#### 1. `SubFlowShareCard.ts` — добавить `source` параметр

Определять, откуда идёт шаринг (MiniApp или нативное приложение), и добавлять `?from=miniapp` или `?from=app` к URL:

- Проверяем `window.Telegram?.WebApp?.initData` → `from=miniapp`
- Проверяем Capacitor (`Capacitor.isNativePlatform()`) → `from=app`
- Иначе → без параметра (веб)

#### 2. `SubFlowPostPage.tsx` — smart redirect логика

В `useEffect` при загрузке:

1. Читаем `searchParams.get('from')`
2. Если `from=miniapp` → `window.location.href = 'https://t.me/subdaybot/app?startapp=post_' + postId`
3. Если `from=app` → пытаемся открыть через custom scheme или Universal Link, с fallback на App Store / Play Market по `userAgent`
4. Иначе → показываем текущее locked preview с CTA кнопками

#### 3. Файлы

- **Изменить**: `src/components/subflow/SubFlowShareCard.ts` — добавить `?from=` параметр к shareUrl
- **Изменить**: `src/pages/SubFlowPostPage.tsx` — добавить smart redirect логику на основе `from` параметра
- **Без изменений БД**

### Вопрос перед реализацией

Мне нужно уточнить имя вашего Telegram бота для MiniApp ссылки (например `subdaybot`). Также — есть ли уже Apple App ID и ссылки на сторы?  
  
Ссылка на телеграм бот: [subday_lgbot](https://t.me/subday_lgbot)  
  
Ссылок на сторы пока нету.  
  
Так же давай попробуем добавить кликабельную ссылку при публикации в сториз инстаграм и в остальных соцсетях. Что бы ссылка не просто как текст была, а именно что бы на нее можно было кликнуть.

&nbsp;