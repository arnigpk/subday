import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ru' | 'kz';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<string, Record<Language, string>> = {
  // Bottom Nav
  'nav.home': { ru: 'Главная', kz: 'Басты' },
  'nav.packages': { ru: 'Подписки', kz: 'Жазылымдар' },
  'nav.shops': { ru: 'Кофейни', kz: 'Кофеханалар' },
  'nav.subflow': { ru: 'subFlow', kz: 'subFlow' },
  'nav.profile': { ru: 'Профиль', kz: 'Профиль' },

  // Home page
  'home.nearbyShops': { ru: 'Кофейни рядом', kz: 'Жақын кофеханалар' },
  'home.all': { ru: 'Все', kz: 'Барлығы' },
  'home.showQR': { ru: 'Показать QR', kz: 'QR көрсету' },
  'home.pleaseSubscribe': { ru: 'Пожалуйста, оформите подписку', kz: 'Жазылым рәсімдеңіз' },

  // Balance Card
  'balance.coffee': { ru: 'Кофе', kz: 'Кофе' },
  'balance.drinks': { ru: 'Ланч', kz: 'Ланч' },
  'balance.remaining': { ru: 'По подписке осталось', kz: 'Жазылым бойынша қалды' },
  'balance.of': { ru: 'из', kz: 'ішінен' },
  'balance.dailyLimitReached': { ru: 'У вас закончился дневной лимит, попробуйте завтра', kz: 'Күндік лимит біткен, ертең байқап көріңіз' },
  'balance.todayRemaining': { ru: 'Сегодня осталось:', kz: 'Бүгін қалды:' },
  'balance.noSubscription': { ru: 'У вас нет подписки 😢', kz: 'Сізде жазылым жоқ 😢' },
  'balance.subscribe': { ru: 'Оформить подписку', kz: 'Жазылым рәсімдеу' },
  'balance.subscription': { ru: 'Подписка:', kz: 'Жазылым:' },
  'balance.expired': { ru: 'Истекла', kz: 'Мерзімі өтті' },
  'balance.day1': { ru: '1 день', kz: '1 күн' },
  'balance.days234': { ru: 'дня', kz: 'күн' },
  'balance.days': { ru: 'дней', kz: 'күн' },
  'balance.month1': { ru: '~1 месяц', kz: '~1 ай' },
  'balance.months': { ru: 'мес.', kz: 'ай' },
  'balance.year': { ru: '~1 год', kz: '~1 жыл' },

  // Packages page
  'packages.title': { ru: 'Подписки', kz: 'Жазылымдар' },
  'packages.subtitle': { ru: 'Выбери свой идеальный план', kz: 'Өзіңізге лайық жоспарды таңдаңыз' },
  'packages.noPackages': { ru: 'Нет доступных подписок', kz: 'Қолжетімді жазылымдар жоқ' },
  'packages.active': { ru: 'Активна', kz: 'Белсенді' },
  'packages.coffeeFor': { ru: 'кофе на', kz: 'кофе' },
  'packages.yourActive': { ru: 'Ваша активная подписка', kz: 'Сіздің белсенді жазылымыңыз' },
  'packages.subscribe': { ru: 'Оформить', kz: 'Рәсімдеу' },
  'packages.benefit': { ru: 'Выгода', kz: 'Үнемдеу' },

  // Package detail
  'packageDetail.title': { ru: 'Детали подписки', kz: 'Жазылым мәліметтері' },
  'packageDetail.back': { ru: 'Назад', kz: 'Артқа' },
  'packageDetail.notFound': { ru: 'Подписка не найдена', kz: 'Жазылым табылмады' },
  'packageDetail.whatsIncluded': { ru: 'Что входит', kz: 'Не кіреді' },
  'packageDetail.howItWorks': { ru: 'Как это работает', kz: 'Қалай жұмыс істейді' },
  'packageDetail.howItWorksText': { ru: 'После оформления получаешь', kz: 'Рәсімдегеннен кейін аласыз' },
  'packageDetail.drinksFor': { ru: 'напитков на', kz: 'сусын' },
  'packageDetail.howItWorksText2': { ru: 'Заходишь в любую партнёрскую кофейню, показываешь QR — и забираешь напиток. Всё просто.', kz: 'Кез келген серіктес кофеханаға кіріп, QR көрсетіп — сусынды аласыз. Бәрі оңай.' },
  'packageDetail.subscribeFor': { ru: 'Оформить за', kz: 'Рәсімдеу' },
  'packageDetail.creating': { ru: 'Создаём платёж...', kz: 'Төлем жасалуда...' },

  // Shops page
  'shops.title': { ru: 'Кофейни', kz: 'Кофеханалар' },
  'shops.all': { ru: 'Все', kz: 'Барлығы' },
  'shops.open': { ru: 'Открыто', kz: 'Ашық' },
  'shops.closed': { ru: 'Закрыто', kz: 'Жабық' },
  'shops.enableLocation': { ru: 'Включите геолокацию для сортировки по расстоянию', kz: 'Қашықтық бойынша сұрыптау үшін геолокацияны қосыңыз' },
  'shops.noShops': { ru: 'Нет кофеен', kz: 'Кофеханалар жоқ' },
  'shops.changeFilter': { ru: 'Попробуйте изменить фильтр', kz: 'Сүзгіні өзгертіп көріңіз' },
  'shops.notFound': { ru: 'Кофейня не найдена', kz: 'Кофехана табылмады' },
  'shops.openUntil': { ru: 'Открыто до', kz: 'дейін ашық' },
  'shops.closedOpensAt': { ru: 'Закрыто · откроется в', kz: 'Жабық · ашылады' },
  'shops.bySubscription': { ru: 'Доступно по подписке', kz: 'Жазылым бойынша қолжетімді' },
  'shops.remaining': { ru: 'осталось', kz: 'қалды' },
  'shops.shopClosed': { ru: 'Кофейня закрыта', kz: 'Кофехана жабық' },
  'shops.noDrinks': { ru: 'Нет доступных напитков', kz: 'Қолжетімді сусындар жоқ' },
  'shops.pickupHere': { ru: 'Забрать здесь', kz: 'Осы жерден алу' },
  'shops.addressNotSet': { ru: 'Адрес не указан', kz: 'Мекенжай көрсетілмеген' },
  'shops.byCar': { ru: 'на авто', kz: 'көлікпен' },
  'shops.getDirections': { ru: 'Добраться', kz: 'Жету' },

  // Redeem page
  'redeem.pickingUp': { ru: 'Забираешь в', kz: 'Алатын жер' },
  'redeem.selectShop': { ru: 'Выбрать кофейню', kz: 'Кофехана таңдау' },
  'redeem.yourQR': { ru: 'Ваш QR', kz: 'Сіздің QR' },
  'redeem.showBarista': { ru: 'Покажи бариста для сканирования', kz: 'Бариста сканерлеу үшін көрсетіңіз' },
  'redeem.remaining': { ru: 'Осталось:', kz: 'Қалды:' },
  'redeem.coffee': { ru: 'кофе', kz: 'кофе' },
  'redeem.drinks': { ru: 'ланчей', kz: 'ланч' },
  'redeem.selectType': { ru: 'Выберите тип', kz: 'Түрін таңдаңыз' },
  'redeem.typeCoffee': { ru: 'Кофе', kz: 'Кофе' },
  'redeem.typeLunch': { ru: 'Ланч', kz: 'Ланч' },
  'redeem.lunchNotAvailable': { ru: 'Ланч недоступен в этой кофейне', kz: 'Бұл кофеханада ланч қолжетімді емес' },
  'redeem.shopClosed': { ru: 'Кофейня сейчас закрыта', kz: 'Кофехана қазір жабық' },
  'redeem.scanning': { ru: 'Сканируют...', kz: 'Сканерленуде...' },
  'redeem.waitSec': { ru: 'Подожди секунду', kz: 'Бір секунд күтіңіз' },
  'redeem.success': { ru: 'Засчитано!', kz: 'Есептелді!' },
  'redeem.enjoy': { ru: 'Наслаждайся 🚀', kz: 'Ләззат алыңыз 🚀' },
  'redeem.goHome': { ru: 'На главную', kz: 'Басты бетке' },
  'redeem.error': { ru: 'Ошибка', kz: 'Қате' },
  'redeem.tryAgain': { ru: 'Попробуй ещё раз', kz: 'Қайта байқаңыз' },
  'redeem.retry': { ru: 'Попробовать снова', kz: 'Қайта байқау' },
  'redeem.noShops': { ru: 'Нет доступных кофеен', kz: 'Қолжетімді кофеханалар жоқ' },
  'redeem.tryLater': { ru: 'Попробуйте позже', kz: 'Кейінірек байқап көріңіз' },
  'redeem.loadError': { ru: 'Ошибка загрузки кофеен', kz: 'Кофеханаларды жүктеу қатесі' },

  // Streaks page
  'streaks.title': { ru: 'Выпито', kz: 'Ішілген' },
  'streaks.drunk': { ru: 'напитков выпито', kz: 'сусын ішілді' },
  'streaks.daysInRow': { ru: 'Дней подряд', kz: 'Күн қатарынан' },
  'streaks.maximum': { ru: 'Максимум', kz: 'Максимум' },
  'streaks.to30': { ru: 'До 30 дней подряд', kz: '30 күн қатарынан дейін' },
  'streaks.rewards': { ru: 'Награды', kz: 'Марапаттар' },
  'streaks.received': { ru: 'Получено', kz: 'Алынды' },

  // Bonuses page
  'bonuses.title': { ru: 'Бонусы', kz: 'Бонустар' },
  'bonuses.points': { ru: 'бонусов', kz: 'бонус' },
  'bonuses.howToEarn': { ru: 'Как заработать', kz: 'Қалай жинауға болады' },
  'bonuses.getDrinks': { ru: 'Забирай напитки', kz: 'Сусындарды алыңыз' },
  'bonuses.getDrinksDesc': { ru: '+10 бонусов за каждый напиток', kz: 'Әр сусын үшін +10 бонус' },
  'bonuses.keepStreak': { ru: 'Держи серию', kz: 'Серияны ұстаңыз' },
  'bonuses.keepStreakDesc': { ru: '+5 бонусов за каждый день подряд', kz: 'Қатарынан әр күн үшін +5 бонус' },
  'bonuses.inviteFriends': { ru: 'Приглашай друзей', kz: 'Достарыңызды шақырыңыз' },
  'bonuses.inviteFriendsDesc': { ru: '+50 бонусов за каждого друга', kz: 'Әр дос үшін +50 бонус' },
  'bonuses.exchange': { ru: 'Обменять бонусы', kz: 'Бонустарды айырбастау' },
  'bonuses.freeCoffee': { ru: 'Бесплатный кофе', kz: 'Тегін кофе' },
  'bonuses.sizeUpgrade': { ru: 'Апгрейд размера', kz: 'Көлемді жаңарту' },
  'bonuses.freeWeek': { ru: 'Бесплатная неделя', kz: 'Тегін апта' },
  'bonuses.claim': { ru: 'Забрать', kz: 'Алу' },
  'bonuses.more': { ru: 'Ещё', kz: 'Тағы' },

  // History page
  'history.title': { ru: 'История', kz: 'Тарих' },
  'history.empty': { ru: 'Пока пусто', kz: 'Әзірше бос' },
  'history.emptyDesc': { ru: 'Забирай напитки — тут появится история', kz: 'Сусындарды алыңыз — тарих осында пайда болады' },
  'history.purchases': { ru: 'История покупок', kz: 'Сатып алу тарихы' },

  // Profile page
  'profile.title': { ru: 'Профиль', kz: 'Профиль' },
  'profile.user': { ru: 'Пользователь', kz: 'Пайдаланушы' },
  'profile.drunk': { ru: 'Выпито', kz: 'Ішілген' },
  'profile.daysInRow': { ru: 'Дней подряд', kz: 'Күн қатар' },
  'profile.bonuses': { ru: 'Бонусов', kz: 'Бонустар' },
  'profile.city': { ru: 'Город', kz: 'Қала' },
  'profile.notifications': { ru: 'Уведомления', kz: 'Хабарламалар' },
  'profile.support': { ru: 'Помощь/техподдержка', kz: 'Көмек/техқолдау' },
  'profile.rules': { ru: 'Правила сервиса', kz: 'Сервис ережелері' },
  'profile.theme': { ru: 'Тема:', kz: 'Тақырып:' },
  'profile.espresso': { ru: 'Эспрессо', kz: 'Эспрессо' },
  'profile.latte': { ru: 'Латте', kz: 'Латте' },
  'profile.logout': { ru: 'Выйти', kz: 'Шығу' },
  'profile.loggingOut': { ru: 'Выходим...', kz: 'Шығуда...' },
  'profile.enterName': { ru: 'Введите имя', kz: 'Атыңызды енгізіңіз' },
  'profile.nameSaved': { ru: 'Имя сохранено!', kz: 'Аты сақталды!' },
  'profile.saveError': { ru: 'Ошибка сохранения', kz: 'Сақтау қатесі' },
  'profile.changeAvatar': { ru: 'Поменять аватарку', kz: 'Аватарды ауыстыру' },
  'profile.photoUpdated': { ru: 'Фото обновлено!', kz: 'Фото жаңартылды!' },
  'profile.uploadError': { ru: 'Ошибка загрузки фото', kz: 'Фото жүктеу қатесі' },
  'profile.selectImage': { ru: 'Пожалуйста, выберите изображение', kz: 'Сурет таңдаңыз' },
  'profile.fileTooLarge': { ru: 'Файл слишком большой (максимум 5МБ)', kz: 'Файл тым үлкен (максимум 5МБ)' },
  'profile.notificationsEnabled': { ru: 'Уведомления включены!', kz: 'Хабарламалар қосылды!' },
  'profile.notificationsDisabled': { ru: 'Уведомления отключены', kz: 'Хабарламалар өшірілді' },
  'profile.notificationsNotSupported': { ru: 'Ваш браузер не поддерживает уведомления', kz: 'Браузеріңіз хабарламаларды қолдамайды' },
  'profile.notificationsDenied': { ru: 'Разрешение на уведомления отклонено. Измените в настройках браузера.', kz: 'Хабарламаларға рұқсат қабылданбады. Браузер параметрлерінде өзгертіңіз.' },
  'profile.notificationsCancelled': { ru: 'Запрос на уведомления отменён', kz: 'Хабарлама сұрауы бас тартылды' },
  'profile.logoutError': { ru: 'Ошибка выхода', kz: 'Шығу қатесі' },
  'profile.goodbye': { ru: 'До скорого!', kz: 'Кездескенше!' },
  'profile.copied': { ru: 'Скопировано!', kz: 'Көшірілді!' },

  // SubFlow page
  'subflow.createPost': { ru: 'Сделать пост', kz: 'Пост жасау' },
  'subflow.subtitle': { ru: 'Делись впечатлениями ☕', kz: 'Әсерлеріңізбен бөлісіңіз ☕' },
  'subflow.locked': { ru: 'Раздел закрыт', kz: 'Бөлім жабық' },
  'subflow.lockedDesc': { ru: 'Купите подписку чтобы увидеть уникальный раздел #subFlow и публиковать посты и комментарии.', kz: '#subFlow бөлімін көру және пост, пікір жазу үшін жазылым сатып алыңыз.' },
  'subflow.newPost': { ru: 'Новый пост ✨', kz: 'Жаңа пост ✨' },
  'subflow.placeholder': { ru: 'Какой кофе сегодня? Расскажи! ☕', kz: 'Бүгін қандай кофе? Айтып беріңіз! ☕' },
  'subflow.compressing': { ru: 'Сжатие фото...', kz: 'Фото сығу...' },
  'subflow.publish': { ru: 'Опубликовать', kz: 'Жариялау' },
  'subflow.publishing': { ru: 'Публикация...', kz: 'Жариялануда...' },
  'subflow.selectShop': { ru: 'Выбрать кофейню', kz: 'Кофехана таңдау' },
  'subflow.commentPlaceholder': { ru: 'Написать комментарий...', kz: 'Пікір жазу...' },
  'subflow.subscribeToComment': { ru: 'Оформите подписку чтобы комментировать', kz: 'Пікір жазу үшін жазылым рәсімдеңіз' },
  'subflow.noComments': { ru: 'Пока нет комментариев', kz: 'Әзірше пікірлер жоқ' },
  'subflow.save': { ru: 'Сохранить', kz: 'Сақтау' },
  'subflow.saving': { ru: 'Сохранение...', kz: 'Сақталуда...' },
  'subflow.cancel': { ru: 'Отмена', kz: 'Болдырмау' },
  'subflow.deleteError': { ru: 'Ошибка удаления', kz: 'Жою қатесі' },
  'subflow.postError': { ru: 'Ошибка публикации', kz: 'Жариялау қатесі' },
  'subflow.posted': { ru: 'Пост опубликован!', kz: 'Пост жарияланды!' },
  'subflow.writeText': { ru: 'Напишите текст поста', kz: 'Пост мәтінін жазыңыз' },
  'subflow.selectImage': { ru: 'Выберите изображение', kz: 'Сурет таңдаңыз' },
  'subflow.fileTooLarge': { ru: 'Максимум 15МБ на фото', kz: 'Фотоға максимум 15МБ' },
  'subflow.compressionError': { ru: 'Ошибка обработки изображения', kz: 'Суретті өңдеу қатесі' },
  'subflow.loginToReact': { ru: 'Войдите, чтобы реагировать', kz: 'Реакция қою үшін кіріңіз' },
  'subflow.loginToComment': { ru: 'Войдите, чтобы комментировать', kz: 'Пікір жазу үшін кіріңіз' },
  'subflow.confirmDelete': { ru: 'Удалить этот пост?', kz: 'Бұл постты жою керек пе?' },
  'subflow.deleted': { ru: 'Пост удалён', kz: 'Пост жойылды' },
  'subflow.updated': { ru: 'Пост обновлён', kz: 'Пост жаңартылды' },
  'subflow.saveError': { ru: 'Ошибка сохранения', kz: 'Сақтау қатесі' },
  'subflow.commentError': { ru: 'Ошибка отправки комментария', kz: 'Пікір жіберу қатесі' },
  'subflow.comments': { ru: 'Комментарии', kz: 'Пікірлер' },
  'subflow.comment': { ru: 'Комментировать', kz: 'Пікір жазу' },
  'subflow.allShops': { ru: 'Все кофейни', kz: 'Барлық кофеханалар' },
  'subflow.user': { ru: 'Пользователь', kz: 'Пайдаланушы' },

  // AI Assistant
  'ai.title': { ru: 'Служба заботы subday', kz: 'subday қамқорлық қызметі' },
  'ai.greeting': { ru: 'Привет! 👋 Задайте вопрос или выберите тему:', kz: 'Сәлем! 👋 Сұрақ қойыңыз немесе тақырып таңдаңыз:' },
  'ai.placeholder': { ru: 'Задайте вопрос...', kz: 'Сұрақ қойыңыз...' },
  'ai.clearChat': { ru: 'Очистить чат', kz: 'Чатты тазалау' },
  'ai.errorTitle': { ru: 'Ошибка', kz: 'Қате' },
  'ai.errorDesc': { ru: 'Не удалось получить ответ', kz: 'Жауап алу мүмкін болмады' },

  // Common
  'common.days': { ru: 'дней', kz: 'күн' },
  'common.day': { ru: 'день', kz: 'күн' },

  // Home - TopShops
  'home.topByVisits': { ru: 'Топ по посещениям', kz: 'Барулар бойынша топ' },

  // Guest Access
  'guest.title': { ru: 'Гостевой доступ', kz: 'Қонақтық кіру' },
  'guest.yourId': { ru: 'Твой ID:', kz: 'Сіздің ID:' },
  'guest.copy': { ru: 'Скопировать', kz: 'Көшіру' },
  'guest.availableThisMonth': { ru: 'В этом месяце доступно: 1 приглашение', kz: 'Бұл айда қолжетімді: 1 шақыру' },
  'guest.usedThisMonth': { ru: 'В этом месяце вы уже выдали гостевой доступ ✅', kz: 'Бұл айда сіз қонақтық кіруді бердіңіз ✅' },
  'guest.inviteFriend': { ru: 'Пригласить друга', kz: 'Досты шақыру' },
  'guest.giftTitle': { ru: 'Подари кофе другу', kz: 'Досыңа кофе сыйла' },
  'guest.giftSubtitle': { ru: 'Спишем 1 кофе с твоей подписки — другу дадим 1 кофе на 10 дней, чтобы он попробовал subday.', kz: 'Жазылымыңыздан 1 кофе есептейміз — досыңызға subday сынап көру үшін 10 күнге 1 кофе береміз.' },
  'guest.byPhone': { ru: 'По номеру', kz: 'Нөмір бойынша' },
  'guest.byId': { ru: 'По ID', kz: 'ID бойынша' },
  'guest.enterPhone': { ru: 'Введите номер телефона', kz: 'Телефон нөмірін енгізіңіз' },
  'guest.enterId': { ru: 'Введите ID друга', kz: 'Досыңыздың ID-ін енгізіңіз' },
  'guest.grantButton': { ru: 'Выдать гостевой доступ', kz: 'Қонақтық кіру беру' },
  'guest.whereToFindId': { ru: 'Где найти ID друга?', kz: 'Достың ID-ін қайдан табуға болады?' },
  'guest.whereToFindIdDesc': { ru: 'Попросите друга открыть приложение и перейти в раздел «Профиль». ID отображается под аватаром.', kz: 'Досыңыздан қосымшаны ашып, «Профиль» бөліміне өтуін сұраңыз. ID аватардың астында көрсетіледі.' },
  'guest.granting': { ru: 'Выдаём...', kz: 'Беруде...' },
  'guest.invalidInput': { ru: 'Некорректный номер телефона / ID.', kz: 'Қате телефон нөмірі / ID.' },
  'guest.successMessage': { ru: 'Готово! Друг получил 1 кофе на 10 дней ☕️\nСписание с вашей подписки выполнено.', kz: 'Дайын! Досыңыз 10 күнге 1 кофе алды ☕️\nЖазылымыңыздан есептелді.' },
  'guest.pendingMessage': { ru: 'Приглашение отправлено ✅\nКак только друг зарегистрируется по этому номеру, он сразу получит 1 кофе на 10 дней.', kz: 'Шақыру жіберілді ✅\nДосыңыз осы нөмірмен тіркелген кезде 10 күнге 1 кофе алады.' },
  'guest.giftReceived': { ru: 'Вам подарили 1 кофе на 10 дней ☕️', kz: 'Сізге 10 күнге 1 кофе сыйлады ☕️' },

  // Delete account
  'profile.deleteAccount': { ru: 'Удалить аккаунт', kz: 'Аккаунтты жою' },
  'profile.deleteAccountTitle': { ru: 'Удаление аккаунта', kz: 'Аккаунтты жою' },
  'profile.deleteAccountWarning': { ru: 'Это действие необратимо. Все ваши данные, подписки, история и бонусы будут удалены навсегда.', kz: 'Бұл әрекетті қайтару мүмкін емес. Барлық деректеріңіз, жазылымдар, тарих және бонустар мәңгілікке жойылады.' },
  'profile.deleteAccountConfirm': { ru: 'Да, удалить аккаунт', kz: 'Иә, аккаунтты жою' },
  'profile.deleteAccountCancel': { ru: 'Отмена', kz: 'Болдырмау' },
  'profile.deleteAccountDeleting': { ru: 'Удаление...', kz: 'Жойылуда...' },
  'profile.deleteAccountSuccess': { ru: 'Аккаунт удалён', kz: 'Аккаунт жойылды' },
  'profile.deleteAccountError': { ru: 'Ошибка удаления аккаунта', kz: 'Аккаунтты жою қатесі' },
  'profile.typeDeleteToConfirm': { ru: 'Введите «УДАЛИТЬ» для подтверждения', kz: '«ЖОЮ» деп жазыңыз' },
  'profile.deleteWord': { ru: 'УДАЛИТЬ', kz: 'ЖОЮ' },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('subday_language');
    return (saved === 'kz' ? 'kz' : 'ru') as Language;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('subday_language', lang);
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || translations[key]?.['ru'] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
