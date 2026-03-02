import { COUNTRIES, CITIES_BY_COUNTRY } from '@/components/auth/CountryCodePicker';

export { COUNTRIES, CITIES_BY_COUNTRY };

export interface CountryInfo {
  code: string;
  name: string;
  flag: string;
  currency: string;
  currencyCode: string;
}

export const COUNTRY_CONFIG: Record<string, CountryInfo> = {
  KZ: { code: 'KZ', name: 'Казахстан', flag: '🇰🇿', currency: '₸', currencyCode: 'KZT' },
  KG: { code: 'KG', name: 'Кыргызстан', flag: '🇰🇬', currency: 'сом', currencyCode: 'KGS' },
  UZ: { code: 'UZ', name: 'Узбекистан', flag: '🇺🇿', currency: 'сўм', currencyCode: 'UZS' },
  RU: { code: 'RU', name: 'Россия', flag: '🇷🇺', currency: '₽', currencyCode: 'RUB' },
};

export const COUNTRY_OPTIONS = Object.values(COUNTRY_CONFIG);

export const getCurrencySymbol = (countryCode: string | null | undefined): string => {
  if (!countryCode) return '₸';
  return COUNTRY_CONFIG[countryCode]?.currency || '₸';
};

export const getCountryLabel = (countryCode: string | null | undefined): string => {
  if (!countryCode) return '🇰🇿 Казахстан';
  const c = COUNTRY_CONFIG[countryCode];
  return c ? `${c.flag} ${c.name}` : countryCode;
};

export const getCountryFlag = (countryCode: string | null | undefined): string => {
  if (!countryCode) return '🇰🇿';
  return COUNTRY_CONFIG[countryCode]?.flag || '🌍';
};

export const getCitiesForCountry = (countryCode: string | null | undefined): string[] => {
  if (!countryCode) return CITIES_BY_COUNTRY.KZ || [];
  return CITIES_BY_COUNTRY[countryCode] || [];
};
