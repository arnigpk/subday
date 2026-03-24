import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ru' | 'kz' | 'en' | 'uz' | 'kg';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<string, Record<Language, string>> = {
  // Bottom Nav
  'nav.home': { ru: 'Главная', kz: 'Басты', en: 'Home', uz: 'Bosh sahifa', kg: 'Башкы' },
  'nav.packages': { ru: 'Подписки', kz: 'Жазылымдар', en: 'Plans', uz: 'Obunalar', kg: 'Жазылуулар' },
  'nav.shops': { ru: 'Кофейни', kz: 'Кофеханалар', en: 'Cafés', uz: 'Qahvaxonalar', kg: 'Кофейналар' },
  'nav.subflow': { ru: 'subFlow', kz: 'subFlow', en: 'subFlow', uz: 'subFlow', kg: 'subFlow' },
  'nav.profile': { ru: 'Профиль', kz: 'Профиль', en: 'Profile', uz: 'Profil', kg: 'Профиль' },

  // Home page
  'home.nearbyShops': { ru: 'Кофейни рядом', kz: 'Жақын кофеханалар', en: 'Nearby cafés', uz: 'Yaqin qahvaxonalar', kg: 'Жакын кофейналар' },
  'home.all': { ru: 'Все', kz: 'Барлығы', en: 'All', uz: 'Hammasi', kg: 'Бардыгы' },
  'home.showQR': { ru: 'Показать QR', kz: 'QR көрсету', en: 'Show QR', uz: 'QR ko\'rsatish', kg: 'QR көрсөтүү' },
  'home.pleaseSubscribe': { ru: 'Пожалуйста, оформите подписку', kz: 'Жазылым рәсімдеңіз', en: 'Please subscribe', uz: 'Iltimos, obuna bo\'ling', kg: 'Жазылуу каттатыңыз' },
  'home.topByVisits': { ru: 'Топ по посещениям', kz: 'Барулар бойынша топ', en: 'Top by visits', uz: 'Tashriflar bo\'yicha top', kg: 'Барулар боюнча топ' },

  // Balance Card
  'balance.coffee': { ru: 'Кофе', kz: 'Кофе', en: 'Coffee', uz: 'Qahva', kg: 'Кофе' },
  'balance.drinks': { ru: 'Ланч', kz: 'Ланч', en: 'Lunch', uz: 'Tushlik', kg: 'Ланч' },
  'balance.remaining': { ru: 'По подписке осталось', kz: 'Жазылым бойынша қалды', en: 'Remaining on plan', uz: 'Obuna bo\'yicha qoldi', kg: 'Жазылуу боюнча калды' },
  'balance.of': { ru: 'из', kz: 'ішінен', en: 'of', uz: 'dan', kg: 'ичинен' },
  'balance.dailyLimitReached': { ru: 'У вас закончился дневной лимит, попробуйте завтра', kz: 'Күндік лимит біткен, ертең байқап көріңіз', en: 'Daily limit reached, try again tomorrow', uz: 'Kunlik limit tugadi, ertaga urinib ko\'ring', kg: 'Күндүк лимит бүттү, эртең аракет кылыңыз' },
  'balance.todayRemaining': { ru: 'Сегодня осталось:', kz: 'Бүгін қалды:', en: 'Today remaining:', uz: 'Bugun qoldi:', kg: 'Бүгүн калды:' },
  'balance.noSubscription': { ru: 'У вас нет подписки 😢', kz: 'Сізде жазылым жоқ 😢', en: 'You have no plan 😢', uz: 'Sizda obuna yo\'q 😢', kg: 'Сизде жазылуу жок 😢' },
  'balance.subscribe': { ru: 'Оформить подписку', kz: 'Жазылым рәсімдеу', en: 'Subscribe', uz: 'Obuna bo\'lish', kg: 'Жазылуу каттатуу' },
  'balance.subscription': { ru: 'Подписка:', kz: 'Жазылым:', en: 'Plan:', uz: 'Obuna:', kg: 'Жазылуу:' },
  'balance.expired': { ru: 'Истекла', kz: 'Мерзімі өтті', en: 'Expired', uz: 'Muddati tugagan', kg: 'Мөөнөтү өттү' },
  'balance.day1': { ru: '1 день', kz: '1 күн', en: '1 day', uz: '1 kun', kg: '1 күн' },
  'balance.days234': { ru: 'дня', kz: 'күн', en: 'days', uz: 'kun', kg: 'күн' },
  'balance.days': { ru: 'дней', kz: 'күн', en: 'days', uz: 'kun', kg: 'күн' },
  'balance.month1': { ru: '~1 месяц', kz: '~1 ай', en: '~1 month', uz: '~1 oy', kg: '~1 ай' },
  'balance.months': { ru: 'мес.', kz: 'ай', en: 'mo.', uz: 'oy', kg: 'ай' },
  'balance.year': { ru: '~1 год', kz: '~1 жыл', en: '~1 year', uz: '~1 yil', kg: '~1 жыл' },
  'balance.unlimitedDaily': { ru: 'У вас безлимит на день! ♾️', kz: 'Сізде күніне безлимит! ♾️', en: 'Unlimited for the day! ♾️', uz: 'Bugun uchun cheksiz! ♾️', kg: 'Күнүнө чексиз! ♾️' },
  'balance.todayAvailable': { ru: 'Сегодня доступно', kz: 'Бүгін қолжетімді', en: 'Available today', uz: 'Bugun mavjud', kg: 'Бүгүн жеткиликтүү' },
  'balance.guestCoffee': { ru: 'Гостевой кофе:', kz: 'Қонақ кофе:', en: 'Guest coffee:', uz: 'Mehmon qahva:', kg: 'Конок кофе:' },
  'balance.until': { ru: 'до', kz: 'дейін', en: 'until', uz: 'gacha', kg: 'чейин' },
  'balance.remainingKz': { ru: 'По подписке осталось {remaining} из {total}', kz: 'Жазылым бойынша {total}-{suffix} {remaining} қалды', en: '{remaining} of {total} remaining', uz: 'Obuna bo\'yicha {total} dan {remaining} qoldi', kg: 'Жазылуу боюнча {total} ичинен {remaining} калды' },

  // Packages page
  'packages.title': { ru: 'Подписки', kz: 'Жазылымдар', en: 'Plans', uz: 'Obunalar', kg: 'Жазылуулар' },
  'packages.subtitle': { ru: 'Выбери свой идеальный план', kz: 'Өзіңізге лайық жоспарды таңдаңыз', en: 'Choose your perfect plan', uz: 'O\'zingizga mos rejani tanlang', kg: 'Өзүңүзгө ылайыктуу планды тандаңыз' },
  'packages.noPackages': { ru: 'Нет доступных подписок', kz: 'Қолжетімді жазылымдар жоқ', en: 'No plans available', uz: 'Mavjud obunalar yo\'q', kg: 'Жеткиликтүү жазылуулар жок' },
  'packages.active': { ru: 'Активна', kz: 'Белсенді', en: 'Active', uz: 'Faol', kg: 'Активдүү' },
  'packages.coffeeFor': { ru: 'кофе на', kz: 'кофе', en: 'coffees for', uz: 'qahva', kg: 'кофе' },
  'packages.yourActive': { ru: 'Ваша активная подписка', kz: 'Сіздің белсенді жазылымыңыз', en: 'Your active plan', uz: 'Sizning faol obunangiz', kg: 'Сиздин активдүү жазылууңуз' },
  'packages.subscribe': { ru: 'Оформить', kz: 'Рәсімдеу', en: 'Subscribe', uz: 'Obuna bo\'lish', kg: 'Каттатуу' },
  'packages.benefitCoffee': { ru: 'за напиток', kz: 'сусынға', en: 'per drink', uz: 'ichimlik uchun', kg: 'суусундукка' },
  'packages.benefitDrinks': { ru: 'за ланч', kz: 'түскі асқа', en: 'per lunch', uz: 'tushlik uchun', kg: 'түшкү тамакка' },
  'packages.cupsForDays': { ru: '{cups} кофе на {days} {daysWord}', kz: '{days} {daysWord}ге {cups} кофе', en: '{cups} coffees for {days} {daysWord}', uz: '{days} {daysWord}ga {cups} qahva', kg: '{days} {daysWord}гө {cups} кофе' },
  'packages.lunchForDays': { ru: '{cups} ланчей на {days} {daysWord}', kz: '{days} {daysWord}ге {cups} ланч', en: '{cups} lunches for {days} {daysWord}', uz: '{days} {daysWord}ga {cups} tushlik', kg: '{days} {daysWord}гө {cups} ланч' },

  // Package detail
  'packageDetail.title': { ru: 'Детали подписки', kz: 'Жазылым мәліметтері', en: 'Plan details', uz: 'Obuna tafsilotlari', kg: 'Жазылуу чоо-жайы' },
  'packageDetail.back': { ru: 'Назад', kz: 'Артқа', en: 'Back', uz: 'Orqaga', kg: 'Артка' },
  'packageDetail.notFound': { ru: 'Подписка не найдена', kz: 'Жазылым табылмады', en: 'Plan not found', uz: 'Obuna topilmadi', kg: 'Жазылуу табылган жок' },
  'packageDetail.whatsIncluded': { ru: 'Что входит', kz: 'Не кіреді', en: 'What\'s included', uz: 'Nimalar kiradi', kg: 'Эмне кирет' },
  'packageDetail.howItWorks': { ru: 'Как это работает', kz: 'Қалай жұмыс істейді', en: 'How it works', uz: 'Qanday ishlaydi', kg: 'Кантип иштейт' },
  'packageDetail.howItWorksText': { ru: 'После оформления получаешь', kz: 'Рәсімдегеннен кейін аласыз', en: 'After subscribing you get', uz: 'Obuna bo\'lganingizdan so\'ng olasiz', kg: 'Каттаткандан кийин аласыз' },
  'packageDetail.drinksFor': { ru: 'напитков на', kz: 'сусын', en: 'drinks for', uz: 'ichimlik', kg: 'суусундук' },
  'packageDetail.howItWorksText2': { ru: 'Заходишь в любую партнёрскую кофейню, показываешь QR — и забираешь напиток. Всё просто.', kz: 'Кез келген серіктес кофеханаға кіріп, QR көрсетіп — сусынды аласыз. Бәрі оңай.', en: 'Visit any partner café, show your QR — and grab your drink. Simple.', uz: 'Istalgan hamkor qahvaxonaga kiring, QR ko\'rsating — ichimligingizni oling. Hammasi oddiy.', kg: 'Каалаган өнөктөш кофейнага кирип, QR көрсөтүп — суусундукту алыңыз. Баары жөнөкөй.' },
  'packageDetail.subscribeFor': { ru: 'Оформить за', kz: 'Рәсімдеу', en: 'Subscribe for', uz: 'Obuna bo\'lish', kg: 'Каттатуу' },
  'packageDetail.creating': { ru: 'Создаём платёж...', kz: 'Төлем жасалуда...', en: 'Creating payment...', uz: 'To\'lov yaratilmoqda...', kg: 'Төлөм түзүлүүдө...' },
  'packageDetail.howItWorksFull': { ru: 'После оформления получаешь {cups} напитков на {period}. Заходишь в любую партнёрскую кофейню, показываешь QR — и забираешь напиток. Всё просто.', kz: 'Рәсімдегеннен кейін {period}ге {cups} сусын аласыз. Кез келген серіктес кофеханаға кіріп, QR көрсетіп — сусынды аласыз. Бәрі оңай.', en: 'After subscribing you get {cups} drinks for {period}. Visit any partner café, show your QR — and grab your drink. Simple.', uz: 'Obuna bo\'lganingizdan so\'ng {period}ga {cups} ichimlik olasiz. Istalgan hamkor qahvaxonaga kiring, QR ko\'rsating — ichimligingizni oling. Hammasi oddiy.', kg: 'Каттаткандан кийин {period}гө {cups} суусундук аласыз. Каалаган өнөктөш кофейнага кирип, QR көрсөтүп — суусундукту алыңыз. Баары жөнөкөй.' },
  'packageDetail.specialOfferUntil': { ru: '⏰ Спецпредложение действует до {date}', kz: '⏰ Арнайы ұсыныс {date} дейін жарамды', en: '⏰ Special offer valid until {date}', uz: '⏰ Maxsus taklif {date} gacha amal qiladi', kg: '⏰ Атайын сунуш {date} чейин жарактуу' },
  'packageDetail.specialOfferActive': { ru: '⏰ Спецпредложение активно', kz: '⏰ Арнайы ұсыныс белсенді', en: '⏰ Special offer active', uz: '⏰ Maxsus taklif faol', kg: '⏰ Атайын сунуш активдүү' },

  // Shops page
  'shops.title': { ru: 'Кофейни', kz: 'Кофеханалар', en: 'Cafés', uz: 'Qahvaxonalar', kg: 'Кофейналар' },
  'shops.all': { ru: 'Все', kz: 'Барлығы', en: 'All', uz: 'Hammasi', kg: 'Бардыгы' },
  'shops.open': { ru: 'Открыто', kz: 'Ашық', en: 'Open', uz: 'Ochiq', kg: 'Ачык' },
  'shops.closed': { ru: 'Закрыто', kz: 'Жабық', en: 'Closed', uz: 'Yopiq', kg: 'Жабык' },
  'shops.enableLocation': { ru: 'Включите геолокацию для сортировки по расстоянию', kz: 'Қашықтық бойынша сұрыптау үшін геолокацияны қосыңыз', en: 'Enable location for distance sorting', uz: 'Masofaga qarab saralash uchun joylashuvni yoqing', kg: 'Аралыкка жараша иргөө үчүн геолокацияны күйгүзүңүз' },
  'shops.noShops': { ru: 'Нет кофеен', kz: 'Кофеханалар жоқ', en: 'No cafés', uz: 'Qahvaxonalar yo\'q', kg: 'Кофейналар жок' },
  'shops.changeFilter': { ru: 'Попробуйте изменить фильтр', kz: 'Сүзгіні өзгертіп көріңіз', en: 'Try changing the filter', uz: 'Filtrni o\'zgartirib ko\'ring', kg: 'Чыпканы өзгөртүп көрүңүз' },
  'shops.notFound': { ru: 'Кофейня не найдена', kz: 'Кофехана табылмады', en: 'Café not found', uz: 'Qahvaxona topilmadi', kg: 'Кофейна табылган жок' },
  'shops.openUntil': { ru: 'Открыто до', kz: 'дейін ашық', en: 'Open until', uz: 'gacha ochiq', kg: 'чейин ачык' },
  'shops.closedOpensAt': { ru: 'Закрыто · откроется в', kz: 'Жабық · ашылады', en: 'Closed · opens at', uz: 'Yopiq · ochiladi', kg: 'Жабык · ачылат' },
  'shops.bySubscription': { ru: 'Доступно по подписке', kz: 'Жазылым бойынша қолжетімді', en: 'Available with plan', uz: 'Obuna bilan mavjud', kg: 'Жазылуу менен жеткиликтүү' },
  'shops.remaining': { ru: 'осталось', kz: 'қалды', en: 'remaining', uz: 'qoldi', kg: 'калды' },
  'shops.notAvailable': { ru: 'Не доступно', kz: 'Қолжетімсіз', en: 'Not available', uz: 'Mavjud emas', kg: 'Жеткиликсиз' },
  'shops.shopClosed': { ru: 'Кофейня закрыта', kz: 'Кофехана жабық', en: 'Café is closed', uz: 'Qahvaxona yopiq', kg: 'Кофейна жабык' },
  'shops.noDrinks': { ru: 'Нет доступных напитков', kz: 'Қолжетімді сусындар жоқ', en: 'No drinks available', uz: 'Mavjud ichimliklar yo\'q', kg: 'Жеткиликтүү суусундуктар жок' },
  'shops.pickupHere': { ru: 'Забрать здесь', kz: 'Осы жерден алу', en: 'Pick up here', uz: 'Bu yerdan oling', kg: 'Бул жерден алуу' },
  'shops.addressNotSet': { ru: 'Адрес не указан', kz: 'Мекенжай көрсетілмеген', en: 'Address not set', uz: 'Manzil ko\'rsatilmagan', kg: 'Дарек көрсөтүлгөн эмес' },
  'shops.byCar': { ru: 'на авто', kz: 'көлікпен', en: 'by car', uz: 'avtomobilda', kg: 'машина менен' },
  'shops.getDirections': { ru: 'Добраться', kz: 'Жету', en: 'Directions', uz: 'Yo\'nalish', kg: 'Жетүү' },

  // Redeem page
  'redeem.pickingUp': { ru: 'Забираешь в', kz: 'Алатын жер', en: 'Picking up at', uz: 'Olib ketish joyi', kg: 'Алуучу жер' },
  'redeem.selectShop': { ru: 'Выбрать кофейню', kz: 'Кофехана таңдау', en: 'Select café', uz: 'Qahvaxona tanlash', kg: 'Кофейна тандоо' },
  'redeem.yourQR': { ru: 'Ваш QR', kz: 'Сіздің QR', en: 'Your QR', uz: 'Sizning QR', kg: 'Сиздин QR' },
  'redeem.showBarista': { ru: 'Покажи бариста для сканирования', kz: 'Бариста сканерлеу үшін көрсетіңіз', en: 'Show to barista for scanning', uz: 'Skanerlash uchun baristaga ko\'rsating', kg: 'Баристага сканердөө үчүн көрсөтүңүз' },
  'redeem.remaining': { ru: 'Осталось:', kz: 'Қалды:', en: 'Remaining:', uz: 'Qoldi:', kg: 'Калды:' },
  'redeem.coffee': { ru: 'кофе', kz: 'кофе', en: 'coffees', uz: 'qahva', kg: 'кофе' },
  'redeem.drinks': { ru: 'ланчей', kz: 'ланч', en: 'lunches', uz: 'tushlik', kg: 'ланч' },
  'redeem.selectType': { ru: 'Выберите тип', kz: 'Түрін таңдаңыз', en: 'Select type', uz: 'Turni tanlang', kg: 'Түрүн тандаңыз' },
  'redeem.typeCoffee': { ru: 'Кофе', kz: 'Кофе', en: 'Coffee', uz: 'Qahva', kg: 'Кофе' },
  'redeem.typeLunch': { ru: 'Ланч', kz: 'Ланч', en: 'Lunch', uz: 'Tushlik', kg: 'Ланч' },
  'redeem.lunchNotAvailable': { ru: 'Ланч недоступен в этой кофейне', kz: 'Бұл кофеханада ланч қолжетімді емес', en: 'Lunch not available at this café', uz: 'Bu qahvaxonada tushlik mavjud emas', kg: 'Бул кофейнада ланч жеткиликтүү эмес' },
  'redeem.shopClosed': { ru: 'Кофейня сейчас закрыта', kz: 'Кофехана қазір жабық', en: 'Café is currently closed', uz: 'Qahvaxona hozir yopiq', kg: 'Кофейна азыр жабык' },
  'redeem.scanning': { ru: 'Сканируют...', kz: 'Сканерленуде...', en: 'Scanning...', uz: 'Skanerlanmoqda...', kg: 'Сканерленүүдө...' },
  'redeem.waitSec': { ru: 'Подожди секунду', kz: 'Бір секунд күтіңіз', en: 'Wait a moment', uz: 'Bir soniya kuting', kg: 'Бир секунд күтүңүз' },
  'redeem.success': { ru: 'Списано!', kz: 'Есептелді!', en: 'Redeemed!', uz: 'Yechildi!', kg: 'Эсептелди!' },
  'redeem.enjoy': { ru: 'Спасибо что выбрали SubDay', kz: 'SubDay таңдағаныңызға рахмет', en: 'Thanks for choosing SubDay', uz: 'SubDay tanlaganingiz uchun rahmat', kg: 'SubDay тандаганыңыз үчүн рахмат' },
  'redeem.goHome': { ru: 'На главную', kz: 'Басты бетке', en: 'Go home', uz: 'Bosh sahifaga', kg: 'Башкы бетке' },
  'redeem.error': { ru: 'Ошибка', kz: 'Қате', en: 'Error', uz: 'Xato', kg: 'Ката' },
  'redeem.tryAgain': { ru: 'Попробуй ещё раз', kz: 'Қайта байқаңыз', en: 'Try again', uz: 'Qayta urinib ko\'ring', kg: 'Кайра аракет кылыңыз' },
  'redeem.retry': { ru: 'Попробовать снова', kz: 'Қайта байқау', en: 'Try again', uz: 'Qaytadan urinish', kg: 'Кайра аракеттенүү' },
  'redeem.noShops': { ru: 'Нет доступных кофеен', kz: 'Қолжетімді кофеханалар жоқ', en: 'No cafés available', uz: 'Mavjud qahvaxonalar yo\'q', kg: 'Жеткиликтүү кофейналар жок' },
  'redeem.tryLater': { ru: 'Попробуйте позже', kz: 'Кейінірек байқап көріңіз', en: 'Try later', uz: 'Keyinroq urinib ko\'ring', kg: 'Кийинчерээк аракет кылыңыз' },
  'redeem.loadError': { ru: 'Ошибка загрузки кофеен', kz: 'Кофеханаларды жүктеу қатесі', en: 'Error loading cafés', uz: 'Qahvaxonalarni yuklashda xato', kg: 'Кофейналарды жүктөө катасы' },

  // Streaks page
  'streaks.title': { ru: 'Выпито', kz: 'Ішілген', en: 'Consumed', uz: 'Ichilgan', kg: 'Ичилген' },
  'streaks.drunk': { ru: 'напитков выпито', kz: 'сусын ішілді', en: 'drinks consumed', uz: 'ichimlik ichildi', kg: 'суусундук ичилди' },
  'streaks.daysInRow': { ru: 'Дней подряд', kz: 'Күн қатарынан', en: 'Days in a row', uz: 'Kun ketma-ket', kg: 'Күн катары менен' },
  'streaks.maximum': { ru: 'Максимум', kz: 'Максимум', en: 'Maximum', uz: 'Maksimum', kg: 'Максимум' },
  'streaks.to30': { ru: 'До 30 дней подряд', kz: '30 күн қатарынан дейін', en: 'To 30 days in a row', uz: '30 kun ketma-ketgacha', kg: '30 күн катары менен чейин' },
  'streaks.rewards': { ru: 'Награды', kz: 'Марапаттар', en: 'Rewards', uz: 'Mukofotlar', kg: 'Сыйлыктар' },
  'streaks.received': { ru: 'Получено', kz: 'Алынды', en: 'Received', uz: 'Olingan', kg: 'Алынды' },
  'streaks.reward3': { ru: '🎯 Старт', kz: '🎯 Старт', en: '🎯 Start', uz: '🎯 Start', kg: '🎯 Старт' },
  'streaks.reward7': { ru: '🔥 Неделя', kz: '🔥 Апта', en: '🔥 Week', uz: '🔥 Hafta', kg: '🔥 Жума' },
  'streaks.reward14': { ru: '⚡ Две недели', kz: '⚡ Екі апта', en: '⚡ Two weeks', uz: '⚡ Ikki hafta', kg: '⚡ Эки жума' },
  'streaks.reward30': { ru: '💎 Месяц', kz: '💎 Ай', en: '💎 Month', uz: '💎 Oy', kg: '💎 Ай' },

  // Bonuses page
  'bonuses.title': { ru: 'Бонусы', kz: 'Бонустар', en: 'Bonuses', uz: 'Bonuslar', kg: 'Бонустар' },
  'bonuses.points': { ru: 'бонусов', kz: 'бонус', en: 'points', uz: 'bonus', kg: 'бонус' },
  'bonuses.howToEarn': { ru: 'Как заработать', kz: 'Қалай жинауға болады', en: 'How to earn', uz: 'Qanday to\'plash mumkin', kg: 'Кантип топтоого болот' },
  'bonuses.getDrinks': { ru: 'Забирай напитки', kz: 'Сусындарды алыңыз', en: 'Get drinks', uz: 'Ichimliklarni oling', kg: 'Суусундуктарды алыңыз' },
  'bonuses.getDrinksDesc': { ru: '+10 бонусов за каждый напиток', kz: 'Әр сусын үшін +10 бонус', en: '+10 points per drink', uz: 'Har bir ichimlik uchun +10 bonus', kg: 'Ар бир суусундук үчүн +10 бонус' },
  'bonuses.keepStreak': { ru: 'Держи серию', kz: 'Серияны ұстаңыз', en: 'Keep the streak', uz: 'Seriyani saqlang', kg: 'Серияны кармаңыз' },
  'bonuses.keepStreakDesc': { ru: '+5 бонусов за каждый день подряд', kz: 'Қатарынан әр күн үшін +5 бонус', en: '+5 points for each consecutive day', uz: 'Ketma-ket har bir kun uchun +5 bonus', kg: 'Катары менен ар бир күн үчүн +5 бонус' },
  'bonuses.inviteFriends': { ru: 'Приглашай друзей', kz: 'Достарыңызды шақырыңыз', en: 'Invite friends', uz: 'Do\'stlaringizni taklif qiling', kg: 'Досторуңузду чакырыңыз' },
  'bonuses.inviteFriendsDesc': { ru: '+50 бонусов за каждого друга', kz: 'Әр дос үшін +50 бонус', en: '+50 points per friend', uz: 'Har bir do\'st uchun +50 bonus', kg: 'Ар бир дос үчүн +50 бонус' },
  'bonuses.exchange': { ru: 'Обменять бонусы', kz: 'Бонустарды айырбастау', en: 'Redeem bonuses', uz: 'Bonuslarni ayirboshlash', kg: 'Бонустарды алмаштыруу' },
  'bonuses.freeCoffee': { ru: 'Бесплатный кофе', kz: 'Тегін кофе', en: 'Free coffee', uz: 'Bepul qahva', kg: 'Акысыз кофе' },
  'bonuses.sizeUpgrade': { ru: 'Апгрейд размера', kz: 'Көлемді жаңарту', en: 'Size upgrade', uz: 'Hajmni oshirish', kg: 'Көлөмдү жогорулатуу' },
  'bonuses.freeWeek': { ru: 'Бесплатная неделя', kz: 'Тегін апта', en: 'Free week', uz: 'Bepul hafta', kg: 'Акысыз жума' },
  'bonuses.claim': { ru: 'Забрать', kz: 'Алу', en: 'Claim', uz: 'Olish', kg: 'Алуу' },
  'bonuses.more': { ru: 'Ещё', kz: 'Тағы', en: 'More', uz: 'Yana', kg: 'Дагы' },

  // History page
  'history.title': { ru: 'История', kz: 'Тарих', en: 'History', uz: 'Tarix', kg: 'Тарых' },
  'history.empty': { ru: 'Пока пусто', kz: 'Әзірше бос', en: 'Nothing yet', uz: 'Hozircha bo\'sh', kg: 'Азырынча бош' },
  'history.emptyDesc': { ru: 'Забирай напитки — тут появится история', kz: 'Сусындарды алыңыз — тарих осында пайда болады', en: 'Get drinks — history will appear here', uz: 'Ichimliklarni oling — tarix bu yerda paydo bo\'ladi', kg: 'Суусундуктарды алыңыз — тарых бул жерде пайда болот' },
  'history.purchases': { ru: 'История покупок', kz: 'Сатып алу тарихы', en: 'Purchase history', uz: 'Xaridlar tarixi', kg: 'Сатып алуу тарыхы' },
  'history.tabRedemptions': { ru: 'Списания', kz: 'Есептен шығару', en: 'Redemptions', uz: 'Hisobdan chiqarish', kg: 'Эсептен чыгаруу' },
  'history.tabTransactions': { ru: 'Транзакции', kz: 'Транзакциялар', en: 'Transactions', uz: 'Tranzaksiyalar', kg: 'Транзакциялар' },
  'history.transactionsEmpty': { ru: 'Нет транзакций', kz: 'Транзакциялар жоқ', en: 'No transactions', uz: 'Tranzaksiyalar yo\'q', kg: 'Транзакциялар жок' },
  'history.transactionsEmptyDesc': { ru: 'Здесь будут ваши покупки подписок', kz: 'Мұнда жазылым сатып алуларыңыз болады', en: 'Your subscription purchases will appear here', uz: 'Bu yerda obuna xaridlaringiz paydo bo\'ladi', kg: 'Бул жерде жазылуу сатып алууларыңыз болот' },
  'history.specialOffer': { ru: 'Спецпредложение', kz: 'Арнайы ұсыныс', en: 'Special offer', uz: 'Maxsus taklif', kg: 'Атайын сунуш' },

  // Profile page
  'profile.title': { ru: 'Профиль', kz: 'Профиль', en: 'Profile', uz: 'Profil', kg: 'Профиль' },
  'profile.user': { ru: 'Пользователь', kz: 'Пайдаланушы', en: 'User', uz: 'Foydalanuvchi', kg: 'Колдонуучу' },
  'profile.drunk': { ru: 'Выпито', kz: 'Ішілген', en: 'Consumed', uz: 'Ichilgan', kg: 'Ичилген' },
  'profile.daysInRow': { ru: 'Дней подряд', kz: 'Күн қатар', en: 'Days in row', uz: 'Kun ketma-ket', kg: 'Күн катары' },
  'profile.bonuses': { ru: 'Бонусов', kz: 'Бонустар', en: 'Bonuses', uz: 'Bonuslar', kg: 'Бонустар' },
  'profile.city': { ru: 'Город', kz: 'Қала', en: 'City', uz: 'Shahar', kg: 'Шаар' },
  'profile.notifications': { ru: 'Уведомления', kz: 'Хабарламалар', en: 'Notifications', uz: 'Bildirishnomalar', kg: 'Билдирүүлөр' },
  'profile.support': { ru: 'Помощь/техподдержка', kz: 'Көмек/техқолдау', en: 'Help/Support', uz: 'Yordam/texnik qo\'llab-quvvatlash', kg: 'Жардам/техколдоо' },
  'profile.rules': { ru: 'Правила сервиса', kz: 'Сервис ережелері', en: 'Terms of service', uz: 'Xizmat qoidalari', kg: 'Кызмат эрежелери' },
  'profile.theme': { ru: 'Тема:', kz: 'Тақырып:', en: 'Theme:', uz: 'Mavzu:', kg: 'Тема:' },
  'profile.espresso': { ru: 'Эспрессо', kz: 'Эспрессо', en: 'Espresso', uz: 'Espresso', kg: 'Эспрессо' },
  'profile.latte': { ru: 'Латте', kz: 'Латте', en: 'Latte', uz: 'Latte', kg: 'Латте' },
  'profile.logout': { ru: 'Выйти', kz: 'Шығу', en: 'Log out', uz: 'Chiqish', kg: 'Чыгуу' },
  'profile.loggingOut': { ru: 'Выходим...', kz: 'Шығуда...', en: 'Logging out...', uz: 'Chiqilmoqda...', kg: 'Чыгууда...' },
  'profile.enterName': { ru: 'Введите имя', kz: 'Атыңызды енгізіңіз', en: 'Enter name', uz: 'Ismingizni kiriting', kg: 'Атыңызды киргизиңиз' },
  'profile.nameSaved': { ru: 'Имя сохранено!', kz: 'Аты сақталды!', en: 'Name saved!', uz: 'Ism saqlandi!', kg: 'Аты сакталды!' },
  'profile.saveError': { ru: 'Ошибка сохранения', kz: 'Сақтау қатесі', en: 'Save error', uz: 'Saqlash xatosi', kg: 'Сактоо катасы' },
  'profile.changeAvatar': { ru: 'Поменять аватарку', kz: 'Аватарды ауыстыру', en: 'Change avatar', uz: 'Avatarni o\'zgartirish', kg: 'Аватарды алмаштыруу' },
  'profile.photoUpdated': { ru: 'Фото обновлено!', kz: 'Фото жаңартылды!', en: 'Photo updated!', uz: 'Surat yangilandi!', kg: 'Сүрөт жаңыланды!' },
  'profile.uploadError': { ru: 'Ошибка загрузки фото', kz: 'Фото жүктеу қатесі', en: 'Photo upload error', uz: 'Surat yuklashda xato', kg: 'Сүрөт жүктөө катасы' },
  'profile.selectImage': { ru: 'Пожалуйста, выберите изображение', kz: 'Сурет таңдаңыз', en: 'Please select an image', uz: 'Iltimos, rasm tanlang', kg: 'Сүрөт тандаңыз' },
  'profile.fileTooLarge': { ru: 'Файл слишком большой (максимум 5МБ)', kz: 'Файл тым үлкен (максимум 5МБ)', en: 'File too large (max 5MB)', uz: 'Fayl juda katta (maksimum 5MB)', kg: 'Файл өтө чоң (максимум 5МБ)' },
  'profile.notificationsEnabled': { ru: 'Уведомления включены!', kz: 'Хабарламалар қосылды!', en: 'Notifications enabled!', uz: 'Bildirishnomalar yoqildi!', kg: 'Билдирүүлөр күйгүзүлдү!' },
  'profile.notificationsDisabled': { ru: 'Уведомления отключены', kz: 'Хабарламалар өшірілді', en: 'Notifications disabled', uz: 'Bildirishnomalar o\'chirildi', kg: 'Билдирүүлөр өчүрүлдү' },
  'profile.notificationsNotSupported': { ru: 'Ваш браузер не поддерживает уведомления', kz: 'Браузеріңіз хабарламаларды қолдамайды', en: 'Your browser doesn\'t support notifications', uz: 'Brauzeringiz bildirishnomalarni qo\'llab-quvvatlamaydi', kg: 'Браузериңиз билдирүүлөрдү колдобойт' },
  'profile.notificationsDenied': { ru: 'Разрешение на уведомления отклонено. Измените в настройках браузера.', kz: 'Хабарламаларға рұқсат қабылданбады. Браузер параметрлерінде өзгертіңіз.', en: 'Notification permission denied. Change in browser settings.', uz: 'Bildirishnoma ruxsati rad etildi. Brauzer sozlamalarida o\'zgartiring.', kg: 'Билдирүү уруксаты четке кагылды. Браузер жөндөөлөрүнөн өзгөртүңүз.' },
  'profile.notificationsCancelled': { ru: 'Запрос на уведомления отменён', kz: 'Хабарлама сұрауы бас тартылды', en: 'Notification request cancelled', uz: 'Bildirishnoma so\'rovi bekor qilindi', kg: 'Билдирүү суроосу жокко чыгарылды' },
  'profile.logoutError': { ru: 'Ошибка выхода', kz: 'Шығу қатесі', en: 'Logout error', uz: 'Chiqish xatosi', kg: 'Чыгуу катасы' },
  'profile.goodbye': { ru: 'До скорого!', kz: 'Кездескенше!', en: 'See you soon!', uz: 'Tez orada ko\'rishguncha!', kg: 'Жакында көрүшкөнчө!' },
  'profile.copied': { ru: 'Скопировано!', kz: 'Көшірілді!', en: 'Copied!', uz: 'Nusxalandi!', kg: 'Көчүрүлдү!' },

  // SubFlow page
  'subflow.createPost': { ru: 'Сделать пост', kz: 'Пост жасау', en: 'Create post', uz: 'Post yaratish', kg: 'Пост жасоо' },
  'subflow.subtitle': { ru: 'Делись впечатлениями ☕', kz: 'Әсерлеріңізбен бөлісіңіз ☕', en: 'Share your moments ☕', uz: 'Taassurotlaringiz bilan bo\'lishing ☕', kg: 'Таасирлериңиз менен бөлүшүңүз ☕' },
  'subflow.locked': { ru: 'Раздел закрыт', kz: 'Бөлім жабық', en: 'Section locked', uz: 'Bo\'lim yopiq', kg: 'Бөлүм жабык' },
  'subflow.lockedDesc': { ru: 'Купите подписку чтобы увидеть уникальный раздел #subFlow, публиковать посты, ставить реакции и оставлять комментарии. А так же вы сможете подписываться друг на друга 💚', kz: '#subFlow бөлімін көру, пост жариялау, реакция қою және пікір қалдыру үшін жазылым сатып алыңыз. Сонымен қатар бір-біріңізге жазыла аласыз 💚', en: 'Subscribe to access the #subFlow section, publish posts, add reactions and leave comments. You can also follow each other 💚', uz: '#subFlow bo\'limini ko\'rish, post yozish, reaksiya qo\'yish va izoh qoldirish uchun obuna bo\'ling. Shuningdek, bir-biringizga obuna bo\'lishingiz mumkin 💚', kg: '#subFlow бөлүмүн көрүү, пост жарыялоо, реакция коюу жана пикир калтыруу үчүн жазылуу сатып алыңыз. Ошондой эле бири-бириңизге жазыла аласыздар 💚' },
  'subflow.newPost': { ru: 'Поделись моментом...', kz: 'Сәтіңмен бөліс...', en: 'Share your moment...', uz: 'Lahzangizni ulashing...', kg: 'Учуруңуз менен бөлүшүңүз...' },
  'subflow.placeholder': { ru: 'Что в твоей чашке сегодня? Поделись вкусом дня! 🫶', kz: 'Бүгін кесеңде не бар? Күннің дәмімен бөліс! 🫶', en: 'What\'s in your cup today? Share the taste of the day! 🫶', uz: 'Bugun piyolangizda nima bor? Kun ta\'mini ulashing! 🫶', kg: 'Бүгүн чөйчөгүңдө эмне бар? Күндүн даамы менен бөлүш! 🫶' },
  'subflow.hintPhoto': { ru: 'Медиа', kz: 'Медиа', en: 'Media', uz: 'Media', kg: 'Медиа' },
  'subflow.hintLocation': { ru: 'Кофейня', kz: 'Кофехана', en: 'Coffee shop', uz: 'Qahvaxona', kg: 'Кофейня' },
  'subflow.compressing': { ru: 'Сжатие фото...', kz: 'Фото сығу...', en: 'Compressing photo...', uz: 'Surat siqilmoqda...', kg: 'Сүрөт кысылууда...' },
  'subflow.videoTooLong': { ru: 'Максимальная длина видео 30 секунд', kz: 'Видеоның максималды ұзақтығы 30 секунд', en: 'Maximum video length is 30 seconds', uz: 'Video maksimal uzunligi 30 soniya', kg: 'Видеонун максималдуу узундугу 30 секунд' },
  'subflow.videoTooLargeFile': { ru: 'Максимум 50МБ на видео', kz: 'Видеоға максимум 50МБ', en: 'Max 50MB per video', uz: 'Videoga maksimum 50MB', kg: 'Видеого максимум 50МБ' },
  'subflow.publish': { ru: 'Опубликовать', kz: 'Жариялау', en: 'Publish', uz: 'Nashr qilish', kg: 'Жарыялоо' },
  'subflow.publishing': { ru: 'Публикация...', kz: 'Жариялануда...', en: 'Publishing...', uz: 'Nashr qilinmoqda...', kg: 'Жарыялануда...' },
  'subflow.selectShop': { ru: 'Выбрать кофейню', kz: 'Кофехана таңдау', en: 'Select café', uz: 'Qahvaxona tanlash', kg: 'Кофейна тандоо' },
  'subflow.commentPlaceholder': { ru: 'Написать комментарий...', kz: 'Пікір жазу...', en: 'Write a comment...', uz: 'Izoh yozish...', kg: 'Пикир жазуу...' },
  'subflow.subscribeToComment': { ru: 'Оформите подписку чтобы комментировать', kz: 'Пікір жазу үшін жазылым рәсімдеңіз', en: 'Subscribe to comment', uz: 'Izoh yozish uchun obuna bo\'ling', kg: 'Пикир жазуу үчүн жазылуу каттатыңыз' },
  'subflow.noComments': { ru: 'Пока нет комментариев', kz: 'Әзірше пікірлер жоқ', en: 'No comments yet', uz: 'Hozircha izohlar yo\'q', kg: 'Азырынча пикирлер жок' },
  'subflow.save': { ru: 'Сохранить', kz: 'Сақтау', en: 'Save', uz: 'Saqlash', kg: 'Сактоо' },
  'subflow.saving': { ru: 'Сохранение...', kz: 'Сақталуда...', en: 'Saving...', uz: 'Saqlanmoqda...', kg: 'Сакталууда...' },
  'subflow.cancel': { ru: 'Отмена', kz: 'Болдырмау', en: 'Cancel', uz: 'Bekor qilish', kg: 'Жокко чыгаруу' },
  'subflow.deleteError': { ru: 'Ошибка удаления', kz: 'Жою қатесі', en: 'Delete error', uz: 'O\'chirish xatosi', kg: 'Жоюу катасы' },
  'subflow.postError': { ru: 'Ошибка публикации', kz: 'Жариялау қатесі', en: 'Post error', uz: 'Nashr xatosi', kg: 'Жарыялоо катасы' },
  'subflow.posted': { ru: 'Пост опубликован!', kz: 'Пост жарияланды!', en: 'Post published!', uz: 'Post nashr qilindi!', kg: 'Пост жарыяланды!' },
  'subflow.writeText': { ru: 'Напишите текст поста', kz: 'Пост мәтінін жазыңыз', en: 'Write post text', uz: 'Post matnini yozing', kg: 'Пост текстин жазыңыз' },
  'subflow.selectImage': { ru: 'Выберите изображение', kz: 'Сурет таңдаңыз', en: 'Select an image', uz: 'Rasm tanlang', kg: 'Сүрөт тандаңыз' },
  'subflow.fileTooLarge': { ru: 'Максимум 15МБ на фото', kz: 'Фотоға максимум 15МБ', en: 'Max 15MB per photo', uz: 'Suratga maksimum 15MB', kg: 'Сүрөткө максимум 15МБ' },
  'subflow.compressionError': { ru: 'Ошибка обработки изображения', kz: 'Суретті өңдеу қатесі', en: 'Image processing error', uz: 'Rasmni qayta ishlashda xato', kg: 'Сүрөттү иштетүү катасы' },
  'subflow.loginToReact': { ru: 'Войдите, чтобы реагировать', kz: 'Реакция қою үшін кіріңіз', en: 'Log in to react', uz: 'Reaksiya bildirish uchun kiring', kg: 'Реакция коюу үчүн кириңиз' },
  'subflow.loginToComment': { ru: 'Войдите, чтобы комментировать', kz: 'Пікір жазу үшін кіріңіз', en: 'Log in to comment', uz: 'Izoh yozish uchun kiring', kg: 'Пикир жазуу үчүн кириңиз' },
  'subflow.confirmDelete': { ru: 'Удалить этот пост?', kz: 'Бұл постты жою керек пе?', en: 'Delete this post?', uz: 'Bu postni o\'chirish kerakmi?', kg: 'Бул постту жоюу керекпи?' },
  'subflow.deleted': { ru: 'Пост удалён', kz: 'Пост жойылды', en: 'Post deleted', uz: 'Post o\'chirildi', kg: 'Пост жоюлду' },
  'subflow.updated': { ru: 'Пост обновлён', kz: 'Пост жаңартылды', en: 'Post updated', uz: 'Post yangilandi', kg: 'Пост жаңыланды' },
  'subflow.saveError': { ru: 'Ошибка сохранения', kz: 'Сақтау қатесі', en: 'Save error', uz: 'Saqlash xatosi', kg: 'Сактоо катасы' },
  'subflow.commentError': { ru: 'Ошибка отправки комментария', kz: 'Пікір жіберу қатесі', en: 'Comment send error', uz: 'Izoh yuborishda xato', kg: 'Пикир жөнөтүү катасы' },
  'subflow.comments': { ru: 'Комментарии', kz: 'Пікірлер', en: 'Comments', uz: 'Izohlar', kg: 'Пикирлер' },
  'subflow.comment': { ru: 'Комментировать', kz: 'Пікір жазу', en: 'Comment', uz: 'Izoh yozish', kg: 'Пикир жазуу' },
  'subflow.allShops': { ru: 'Все кофейни', kz: 'Барлық кофеханалар', en: 'All cafés', uz: 'Barcha qahvaxonalar', kg: 'Бардык кофейналар' },
  'subflow.user': { ru: 'Пользователь', kz: 'Пайдаланушы', en: 'User', uz: 'Foydalanuvchi', kg: 'Колдонуучу' },
  'subflow.tapToEnlarge': { ru: 'Нажмите на фото чтобы увеличить', kz: 'Фотоны үлкейту үшін басыңыз', en: 'Tap photo to enlarge', uz: 'Kattalashtirish uchun rasmga bosing', kg: 'Сүрөттү чоңойтуу үчүн басыңыз' },

  // Auth screens
  'auth.enterPhone': { ru: 'Введите ваш номер👇', kz: 'Нөміріңізді енгізіңіз👇', en: 'Enter your number👇', uz: 'Raqamingizni kiriting👇', kg: 'Номериңизди киргизиңиз👇' },
  'auth.login': { ru: 'Войти', kz: 'Кіру', en: 'Log in', uz: 'Kirish', kg: 'Кирүү' },
  'auth.noAccount': { ru: 'Нет аккаунта? Регистрация', kz: 'Аккаунт жоқ па? Тіркелу', en: 'No account? Sign up', uz: 'Akkaunt yo\'qmi? Ro\'yxatdan o\'tish', kg: 'Аккаунт жокпу? Каттоо' },
  'auth.or': { ru: 'или', kz: 'немесе', en: 'or', uz: 'yoki', kg: 'же' },
  'auth.termsPrefix': { ru: 'Продолжая пользоваться сервисом, вы соглашаетесь с', kz: 'Сервисті пайдалана отырып, сіз келесімен келісесіз', en: 'By continuing to use the service, you agree to the', uz: 'Xizmatdan foydalanishni davom ettirib, siz quyidagilarga rozilik bildirasiz', kg: 'Кызматты колдонууну улантып, сиз макулдугуңузду билдиресиз' },
  'auth.termsLink': { ru: 'правилами сервиса', kz: 'сервис ережелерімен', en: 'terms of service', uz: 'xizmat qoidalari', kg: 'кызмат эрежелери' },
  'auth.smsCode': { ru: 'Код из SMS', kz: 'SMS коды', en: 'SMS code', uz: 'SMS kod', kg: 'SMS код' },
  'auth.sentTo': { ru: 'Отправили на', kz: 'Жіберілді', en: 'Sent to', uz: 'Yuborildi', kg: 'Жөнөтүлдү' },
  'auth.changeNumber': { ru: 'Изменить номер', kz: 'Нөмірді өзгерту', en: 'Change number', uz: 'Raqamni o\'zgartirish', kg: 'Номерди өзгөртүү' },
  'auth.resend': { ru: 'Отправить снова', kz: 'Қайта жіберу', en: 'Resend', uz: 'Qayta yuborish', kg: 'Кайра жөнөтүү' },
  'auth.resendIn': { ru: 'Повторно через {sec} сек.', kz: '{sec} сек. кейін қайта', en: 'Resend in {sec} sec.', uz: '{sec} sek. keyin qayta', kg: '{sec} сек. кийин кайра' },
  'auth.sending': { ru: 'Отправляем...', kz: 'Жіберілуде...', en: 'Sending...', uz: 'Yuborilmoqda...', kg: 'Жөнөтүлүүдө...' },
  'auth.checking': { ru: 'Проверяем...', kz: 'Тексерілуде...', en: 'Checking...', uz: 'Tekshirilmoqda...', kg: 'Текшерилүүдө...' },
  'auth.beelineWarning': { ru: 'Отправка смс на beeline временно недоступна по техническим причинам, используйте пожалуйста Whatsapp или Telegram для входа.', kz: 'Beeline-ге смс жіберу техникалық себептермен уақытша қолжетімсіз, кіру үшін Whatsapp немесе Telegram пайдаланыңыз.', en: 'SMS to Beeline is temporarily unavailable due to technical reasons, please use WhatsApp or Telegram to log in.', uz: 'Beeline-ga sms yuborish texnik sabablarga ko\'ra vaqtincha mavjud emas, iltimos kirish uchun Whatsapp yoki Telegram-dan foydalaning.', kg: 'Beeline-ге смс жөнөтүү техникалык себептерге байланыштуу убактылуу жеткиликсиз, кирүү үчүн Whatsapp же Telegram колдонуңуз.' },
  'auth.beelineWarningRegister': { ru: 'Отправка смс на beeline временно недоступна по техническим причинам, используйте пожалуйста Whatsapp или Telegram для регистрации.', kz: 'Beeline-ге смс жіберу техникалық себептермен уақытша қолжетімсіз, тіркелу үшін Whatsapp немесе Telegram пайдаланыңыз.', en: 'SMS to Beeline is temporarily unavailable due to technical reasons, please use WhatsApp or Telegram to register.', uz: 'Beeline-ga sms yuborish texnik sabablarga ko\'ra vaqtincha mavjud emas, iltimos ro\'yxatdan o\'tish uchun Whatsapp yoki Telegram-dan foydalaning.', kg: 'Beeline-ге смс жөнөтүү техникалык себептерге байланыштуу убактылуу жеткиликсиз, катталуу үчүн Whatsapp же Telegram колдонуңуз.' },
  'auth.loginViaTelegram': { ru: 'Войти через Telegram', kz: 'Telegram арқылы кіру', en: 'Log in via Telegram', uz: 'Telegram orqali kirish', kg: 'Telegram аркылуу кирүү' },
  'auth.telegramCode': { ru: 'Код из Telegram бота', kz: 'Telegram бот коды', en: 'Code from Telegram bot', uz: 'Telegram bot kodi', kg: 'Telegram бот коду' },
  'auth.confirmCode': { ru: 'Подтверди код из бота', kz: 'Боттан кодты растаңыз', en: 'Confirm code from bot', uz: 'Botdan kodni tasdiqlang', kg: 'Боттон кодду ырастаңыз' },
  'auth.back': { ru: 'Назад', kz: 'Артқа', en: 'Back', uz: 'Orqaga', kg: 'Артка' },
  'auth.newCode': { ru: 'Новый код', kz: 'Жаңа код', en: 'New code', uz: 'Yangi kod', kg: 'Жаңы код' },
  'auth.secLeft': { ru: '{sec} сек.', kz: '{sec} сек.', en: '{sec} sec.', uz: '{sec} sek.', kg: '{sec} сек.' },
  // Register screen
  'auth.registration': { ru: 'Регистрация', kz: 'Тіркелу', en: 'Sign up', uz: 'Ro\'yxatdan o\'tish', kg: 'Каттоо' },
  'auth.createAccount': { ru: 'Создай аккаунт subday', kz: 'subday аккаунт жасаңыз', en: 'Create your subday account', uz: 'subday akkauntingizni yarating', kg: 'subday аккаунт түзүңүз' },
  'auth.nameLabel': { ru: 'Имя и Фамилия', kz: 'Аты-жөні', en: 'Full name', uz: 'Ism va familiya', kg: 'Аты-жөнү' },
  'auth.namePlaceholder': { ru: 'Иван Ануар', kz: 'Иван Ануар', en: 'John Doe', uz: 'Ism Familiya', kg: 'Иван Ануар' },
  'auth.phoneLabel': { ru: 'Номер телефона', kz: 'Телефон нөмірі', en: 'Phone number', uz: 'Telefon raqami', kg: 'Телефон номери' },
  'auth.cityLabel': { ru: 'Город', kz: 'Қала', en: 'City', uz: 'Shahar', kg: 'Шаар' },
  'auth.cityPlaceholder': { ru: 'Выберите город', kz: 'Қала таңдаңыз', en: 'Select city', uz: 'Shaharni tanlang', kg: 'Шаар тандаңыз' },
  'auth.getCode': { ru: 'Получить код', kz: 'Код алу', en: 'Get code', uz: 'Kod olish', kg: 'Код алуу' },
  'auth.haveAccount': { ru: 'Уже есть аккаунт? Войти', kz: 'Аккаунт бар ма? Кіру', en: 'Already have an account? Log in', uz: 'Akkaunt bormi? Kirish', kg: 'Аккаунт барбы? Кирүү' },
  'auth.changeData': { ru: 'Изменить данные', kz: 'Деректерді өзгерту', en: 'Change data', uz: 'Ma\'lumotlarni o\'zgartirish', kg: 'Маалыматтарды өзгөртүү' },

  // Common
  'common.days': { ru: 'дней', kz: 'күн', en: 'days', uz: 'kun', kg: 'күн' },
  'common.day': { ru: 'день', kz: 'күн', en: 'day', uz: 'kun', kg: 'күн' },

  // Guest Access
  'guest.title': { ru: 'Гостевой доступ', kz: 'Қонақтық кіру', en: 'Guest access', uz: 'Mehmon kirish', kg: 'Конок кирүү' },
  'guest.yourId': { ru: 'Твой ID:', kz: 'Сіздің ID:', en: 'Your ID:', uz: 'Sizning ID:', kg: 'Сиздин ID:' },
  'guest.copy': { ru: 'Скопировать', kz: 'Көшіру', en: 'Copy', uz: 'Nusxalash', kg: 'Көчүрүү' },
  'guest.availableThisMonth': { ru: 'В этом месяце доступно: 1 приглашение', kz: 'Бұл айда қолжетімді: 1 шақыру', en: 'Available this month: 1 invite', uz: 'Bu oyda mavjud: 1 taklif', kg: 'Бул айда жеткиликтүү: 1 чакыруу' },
  'guest.usedThisMonth': { ru: 'В этом месяце вы уже выдали гостевой доступ ✅', kz: 'Бұл айда сіз қонақтық кіруді бердіңіз ✅', en: 'You already gave guest access this month ✅', uz: 'Bu oyda siz mehmon kirishni berdingiz ✅', kg: 'Бул айда сиз конок кирүүнү бердиңиз ✅' },
  'guest.inviteFriend': { ru: 'Пригласить друга', kz: 'Досты шақыру', en: 'Invite a friend', uz: 'Do\'stni taklif qilish', kg: 'Досту чакыруу' },
  'guest.giftTitle': { ru: 'Подари кофе другу', kz: 'Досыңа кофе сыйла', en: 'Gift coffee to a friend', uz: 'Do\'stingizga qahva sovg\'a qiling', kg: 'Досуңузга кофе белек кылыңыз' },
  'guest.giftSubtitle': { ru: 'Спишем 1 кофе с твоей подписки — другу дадим 1 кофе на 10 дней, чтобы он попробовал subday.', kz: 'Жазылымыңыздан 1 кофе есептейміз — досыңызға subday сынап көру үшін 10 күнге 1 кофе береміз.', en: 'We\'ll use 1 coffee from your plan — your friend gets 1 coffee for 10 days to try subday.', uz: 'Obunangizdan 1 qahva hisoblaymiz — do\'stingizga subday ni sinab ko\'rish uchun 10 kunga 1 qahva beramiz.', kg: 'Жазылууңуздан 1 кофе эсептейбиз — досуңузга subday сынап көрүү үчүн 10 күнгө 1 кофе беребиз.' },
  'guest.byPhone': { ru: 'По номеру', kz: 'Нөмір бойынша', en: 'By phone', uz: 'Raqam bo\'yicha', kg: 'Номер боюнча' },
  'guest.byId': { ru: 'По ID', kz: 'ID бойынша', en: 'By ID', uz: 'ID bo\'yicha', kg: 'ID боюнча' },
  'guest.enterPhone': { ru: 'Введите номер телефона', kz: 'Телефон нөмірін енгізіңіз', en: 'Enter phone number', uz: 'Telefon raqamini kiriting', kg: 'Телефон номерин киргизиңиз' },
  'guest.enterId': { ru: 'Введите ID друга', kz: 'Досыңыздың ID-ін енгізіңіз', en: 'Enter friend\'s ID', uz: 'Do\'stingizning ID sini kiriting', kg: 'Досуңуздун ID син киргизиңиз' },
  'guest.grantButton': { ru: 'Выдать гостевой доступ', kz: 'Қонақтық кіру беру', en: 'Grant guest access', uz: 'Mehmon kirish berish', kg: 'Конок кирүү берүү' },
  'guest.whereToFindId': { ru: 'Где найти ID друга?', kz: 'Достың ID-ін қайдан табуға болады?', en: 'Where to find friend\'s ID?', uz: 'Do\'stning ID sini qayerdan topish mumkin?', kg: 'Достун ID сын кайдан табууга болот?' },
  'guest.whereToFindIdDesc': { ru: 'Попросите друга открыть приложение и перейти в раздел «Профиль». ID отображается под аватаром.', kz: 'Досыңыздан қосымшаны ашып, «Профиль» бөліміне өтуін сұраңыз. ID аватардың астында көрсетіледі.', en: 'Ask your friend to open the app and go to "Profile". The ID is shown below the avatar.', uz: 'Do\'stingizdan ilovani ochib, "Profil" bo\'limiga o\'tishni so\'rang. ID avatar ostida ko\'rsatiladi.', kg: 'Досуңуздан колдонмону ачып, «Профиль» бөлүмүнө өтүүсүн сураңыз. ID аватардын астында көрсөтүлөт.' },
  'guest.granting': { ru: 'Выдаём...', kz: 'Беруде...', en: 'Granting...', uz: 'Berilmoqda...', kg: 'Берилүүдө...' },
  'guest.invalidInput': { ru: 'Некорректный номер телефона / ID.', kz: 'Қате телефон нөмірі / ID.', en: 'Invalid phone number / ID.', uz: 'Noto\'g\'ri telefon raqami / ID.', kg: 'Туура эмес телефон номери / ID.' },
  'guest.successMessage': { ru: 'Готово! Друг получил 1 кофе на 10 дней ☕️\nСписание с вашей подписки выполнено.', kz: 'Дайын! Досыңыз 10 күнге 1 кофе алды ☕️\nЖазылымыңыздан есептелді.', en: 'Done! Friend got 1 coffee for 10 days ☕️\nDeducted from your plan.', uz: 'Tayyor! Do\'stingiz 10 kunga 1 qahva oldi ☕️\nObunangizdan hisobdan chiqarildi.', kg: 'Даяр! Досуңуз 10 күнгө 1 кофе алды ☕️\nЖазылууңуздан эсептелди.' },
  'guest.pendingMessage': { ru: 'Приглашение отправлено ✅\nКак только друг зарегистрируется по этому номеру, он сразу получит 1 кофе на 10 дней.', kz: 'Шақыру жіберілді ✅\nДосыңыз осы нөмірмен тіркелген кезде 10 күнге 1 кофе алады.', en: 'Invitation sent ✅\nOnce your friend registers with this number, they\'ll get 1 coffee for 10 days.', uz: 'Taklif yuborildi ✅\nDo\'stingiz bu raqam bilan ro\'yxatdan o\'tganda 10 kunga 1 qahva oladi.', kg: 'Чакыруу жөнөтүлдү ✅\nДосуңуз бул номер менен катталганда 10 күнгө 1 кофе алат.' },
  'guest.giftReceived': { ru: 'Вам подарили 1 кофе на 10 дней ☕️', kz: 'Сізге 10 күнге 1 кофе сыйлады ☕️', en: 'You received 1 coffee for 10 days ☕️', uz: 'Sizga 10 kunga 1 qahva sovg\'a qilindi ☕️', kg: 'Сизге 10 күнгө 1 кофе белек кылынды ☕️' },

  // Delete account
  'profile.deleteAccount': { ru: 'Удалить аккаунт', kz: 'Аккаунтты жою', en: 'Delete account', uz: 'Akkauntni o\'chirish', kg: 'Аккаунтту жоюу' },
  'profile.deleteAccountTitle': { ru: 'Удаление аккаунта', kz: 'Аккаунтты жою', en: 'Delete account', uz: 'Akkauntni o\'chirish', kg: 'Аккаунтту жоюу' },
  'profile.deleteAccountWarning': { ru: 'Это действие необратимо. Все ваши данные, подписки, история и бонусы будут удалены навсегда.', kz: 'Бұл әрекетті қайтару мүмкін емес. Барлық деректеріңіз, жазылымдар, тарих және бонустар мәңгілікке жойылады.', en: 'This action is irreversible. All your data, subscriptions, history and bonuses will be permanently deleted.', uz: 'Bu amalni qaytarib bo\'lmaydi. Barcha ma\'lumotlaringiz, obunalar, tarix va bonuslar butunlay o\'chiriladi.', kg: 'Бул аракетти кайтаруу мүмкүн эмес. Бардык маалыматтарыңыз, жазылуулар, тарых жана бонустар түбөлүккө жоюлат.' },
  'profile.deleteAccountConfirm': { ru: 'Да, удалить аккаунт', kz: 'Иә, аккаунтты жою', en: 'Yes, delete account', uz: 'Ha, akkauntni o\'chirish', kg: 'Ооба, аккаунтту жоюу' },
  'profile.deleteAccountCancel': { ru: 'Отмена', kz: 'Болдырмау', en: 'Cancel', uz: 'Bekor qilish', kg: 'Жокко чыгаруу' },
  'profile.deleteAccountDeleting': { ru: 'Удаление...', kz: 'Жойылуда...', en: 'Deleting...', uz: 'O\'chirilmoqda...', kg: 'Жоюлууда...' },
  'profile.deleteAccountSuccess': { ru: 'Аккаунт удалён', kz: 'Аккаунт жойылды', en: 'Account deleted', uz: 'Akkaunt o\'chirildi', kg: 'Аккаунт жоюлду' },
  'profile.deleteAccountError': { ru: 'Ошибка удаления аккаунта', kz: 'Аккаунтты жою қатесі', en: 'Account deletion error', uz: 'Akkauntni o\'chirishda xato', kg: 'Аккаунтту жоюу катасы' },
  'profile.typeDeleteToConfirm': { ru: 'Введите «УДАЛИТЬ» для подтверждения', kz: '«ЖОЮ» деп жазыңыз', en: 'Type "DELETE" to confirm', uz: '"O\'CHIRISH" deb yozing', kg: '«ЖОЮУ» деп жазыңыз' },
  'profile.deleteWord': { ru: 'УДАЛИТЬ', kz: 'ЖОЮ', en: 'DELETE', uz: 'O\'CHIRISH', kg: 'ЖОЮУ' },
};

const VALID_LANGUAGES: Language[] = ['ru', 'kz', 'en', 'uz', 'kg'];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('subday_language');
    if (saved && VALID_LANGUAGES.includes(saved as Language)) return saved as Language;
    return 'ru';
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
