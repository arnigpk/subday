// Мок-данные для subday

export interface CoffeePackage {
  id: string;
  name: string;
  count: number;
  period: 'месяц' | 'год';
  price: number;
  originalPrice?: number;
  badge?: string;
  description: string;
  type: 'coffee' | 'drinks';
}

export interface DrinkPackage {
  id: string;
  name: string;
  drinks: string[];
  count: number;
  period: 'месяц' | 'год';
  price: number;
  originalPrice?: number;
  badge?: string;
  description: string;
  type: 'coffee' | 'drinks';
}

export interface CoffeeShop {
  id: string;
  name: string;
  address: string;
  distance: string;
  rating: number;
  isOpen: boolean;
  openHours: string;
  availableDrinks: string[];
  image: string;
  coords: { lat: number; lng: number };
}

export interface HistoryItem {
  id: string;
  date: string;
  time: string;
  coffeeShop: string;
  drink: string;
  type: 'coffee' | 'drinks';
}

export interface UserData {
  name: string;
  phone: string;
  city: string;
  coffeeRemaining: number;
  coffeeTotal: number;
  drinksRemaining: number;
  drinksTotal: number;
  currentStreak: number;
  maxStreak: number;
  totalCups: number;
  bonusPoints: number;
}

export const coffeePackages: CoffeePackage[] = [
  {
    id: 'coffee-30',
    name: '30 кофе',
    count: 30,
    period: 'месяц',
    price: 35990,
    originalPrice: 45000,
    badge: 'Хит',
    description: 'Любой кофейный напиток каждый день',
    type: 'coffee',
  },
  {
    id: 'coffee-45',
    name: '45 кофе',
    count: 45,
    period: 'месяц',
    price: 49990,
    originalPrice: 67500,
    badge: 'Выгодно',
    description: 'Для тех, кто любит по 2 чашки в день',
    type: 'coffee',
  },
  {
    id: 'coffee-360',
    name: '360 кофе',
    count: 360,
    period: 'год',
    price: 299990,
    originalPrice: 540000,
    badge: 'Максимум',
    description: 'Годовой запас кофе с mega-скидкой',
    type: 'coffee',
  },
];

export const drinkPackages: DrinkPackage[] = [
  {
    id: 'matcha-15',
    name: 'Матча',
    drinks: ['Матча латте', 'Айс матча', 'Матча раф'],
    count: 15,
    period: 'месяц',
    price: 24990,
    badge: 'Новинка',
    description: 'Все виды матча напитков',
    type: 'drinks',
  },
  {
    id: 'filter-20',
    name: 'Фильтр',
    drinks: ['V60', 'Кемекс', 'Аэропресс', 'Батч-брю'],
    count: 20,
    period: 'месяц',
    price: 19990,
    description: 'Specialty фильтр-кофе',
    type: 'drinks',
  },
  {
    id: 'lemonade-20',
    name: 'Лимонады',
    drinks: ['Классик', 'Манго', 'Маракуйя', 'Клубника'],
    count: 20,
    period: 'месяц',
    price: 17990,
    badge: 'Лето',
    description: 'Освежающие лимонады',
    type: 'drinks',
  },
  {
    id: 'cacao-15',
    name: 'Какао',
    drinks: ['Классик', 'С маршмеллоу', 'Пряное'],
    count: 15,
    period: 'месяц',
    price: 14990,
    description: 'Уютное какао',
    type: 'drinks',
  },
];

export const coffeeShops: CoffeeShop[] = [
  {
    id: 'shop-1',
    name: 'Surf Coffee',
    address: 'ул. Достык, 89',
    distance: '350м',
    rating: 4.9,
    isOpen: true,
    openHours: '08:00–22:00',
    availableDrinks: ['Эспрессо', 'Капучино', 'Латте', 'Раф', 'V60'],
    image: '/placeholder.svg',
    coords: { lat: 43.238949, lng: 76.945465 },
  },
  {
    id: 'shop-2',
    name: 'Bowler Coffee',
    address: 'ул. Панфилова, 45',
    distance: '500м',
    rating: 4.8,
    isOpen: true,
    openHours: '07:30–21:00',
    availableDrinks: ['Эспрессо', 'Капучино', 'Флэт уайт', 'Матча'],
    image: '/placeholder.svg',
    coords: { lat: 43.256789, lng: 76.928765 },
  },
  {
    id: 'shop-3',
    name: 'Верность кофе',
    address: 'пр. Абая, 150',
    distance: '800м',
    rating: 4.7,
    isOpen: true,
    openHours: '09:00–20:00',
    availableDrinks: ['Капучино', 'Латте', 'Раф', 'Какао'],
    image: '/placeholder.svg',
    coords: { lat: 43.234567, lng: 76.912345 },
  },
  {
    id: 'shop-4',
    name: 'Good Vibes Only',
    address: 'ул. Жибек жолы, 72',
    distance: '1.2км',
    rating: 4.6,
    isOpen: false,
    openHours: '10:00–22:00',
    availableDrinks: ['Эспрессо', 'Латте', 'Лимонады'],
    image: '/placeholder.svg',
    coords: { lat: 43.261234, lng: 76.935678 },
  },
];

export const historyItems: HistoryItem[] = [
  { id: 'h1', date: '25 янв', time: '09:15', coffeeShop: 'Surf Coffee', drink: 'Капучино', type: 'coffee' },
  { id: 'h2', date: '24 янв', time: '14:30', coffeeShop: 'Bowler Coffee', drink: 'Латте', type: 'coffee' },
  { id: 'h3', date: '24 янв', time: '08:45', coffeeShop: 'Surf Coffee', drink: 'Эспрессо', type: 'coffee' },
  { id: 'h4', date: '23 янв', time: '16:00', coffeeShop: 'Верность кофе', drink: 'Матча латте', type: 'drinks' },
  { id: 'h5', date: '22 янв', time: '10:20', coffeeShop: 'Bowler Coffee', drink: 'Флэт уайт', type: 'coffee' },
];

export const userData: UserData = {
  name: 'Алмас',
  phone: '+7 707 123 45 67',
  city: 'Алматы',
  coffeeRemaining: 12,
  coffeeTotal: 30,
  drinksRemaining: 8,
  drinksTotal: 15,
  currentStreak: 7,
  maxStreak: 14,
  totalCups: 156,
  bonusPoints: 2400,
};

export const streakRewards = [
  { days: 3, reward: '🎯 Старт', unlocked: true },
  { days: 7, reward: '🔥 Неделя', unlocked: true },
  { days: 14, reward: '⚡ Две недели', unlocked: false },
  { days: 30, reward: '💎 Месяц', unlocked: false },
];

export const formatPrice = (price: number): string => {
  return price.toLocaleString('ru-RU').replace(/,/g, ' ') + ' тг';
};

export const formatPricePerMonth = (price: number): string => {
  return formatPrice(price) + '/мес';
};

export const formatPricePerYear = (price: number): string => {
  return formatPrice(price) + '/год';
};
