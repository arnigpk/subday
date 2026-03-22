import { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';;

export interface Country {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
  phoneLength: number; // digits after dial code
  phoneMask: string; // placeholder
}

export const COUNTRIES: Country[] = [
  { code: 'KZ', dialCode: '7', name: 'Казахстан', flag: '🇰🇿', phoneLength: 10, phoneMask: '7XX XXX XX XX' },
  { code: 'KG', dialCode: '996', name: 'Кыргызстан', flag: '🇰🇬', phoneLength: 9, phoneMask: 'XXX XXX XXX' },
  { code: 'UZ', dialCode: '998', name: 'Узбекистан', flag: '🇺🇿', phoneLength: 9, phoneMask: 'XX XXX XX XX' },
  { code: 'RU', dialCode: '7', name: 'Россия', flag: '🇷🇺', phoneLength: 10, phoneMask: '9XX XXX XX XX' },
];

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  KZ: ['Алматы', 'Астана', 'Шымкент', 'Атырау', 'Актау', 'Караганда', 'Актобе', 'Тараз', 'Павлодар', 'Усть-Каменогорск', 'Семей', 'Костанай', 'Петропавловск', 'Кызылорда', 'Уральск', 'Талдыкорган', 'Экибастуз', 'Темиртау', 'Туркестан', 'Кокшетау'],
  KG: ['Бишкек', 'Ош', 'Джалал-Абад', 'Каракол', 'Токмок', 'Узген', 'Балыкчы', 'Нарын', 'Талас', 'Кара-Балта'],
  UZ: ['Ташкент', 'Самарканд', 'Бухара', 'Наманган', 'Андижан', 'Фергана', 'Нукус', 'Карши', 'Хива', 'Термез', 'Навои', 'Коканд', 'Маргилан', 'Ургенч'],
  RU: ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Краснодар', 'Ростов-на-Дону', 'Уфа', 'Красноярск'],
};

interface CountryCodePickerProps {
  selectedCountry: Country;
  onSelect: (country: Country) => void;
}

export function detectCountryByTimezone(): Country {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.includes('Almaty') || tz.includes('Aqtau') || tz.includes('Aqtobe') || tz.includes('Atyrau') || tz.includes('Oral') || tz.includes('Qostanay') || tz.includes('Qyzylorda')) {
      return COUNTRIES.find(c => c.code === 'KZ')!;
    }
    if (tz.includes('Bishkek')) return COUNTRIES.find(c => c.code === 'KG')!;
    if (tz.includes('Tashkent') || tz.includes('Samarkand')) return COUNTRIES.find(c => c.code === 'UZ')!;
    if (tz.includes('Moscow') || tz.includes('Yekaterinburg') || tz.includes('Krasnoyarsk') || tz.includes('Novosibirsk')) return COUNTRIES.find(c => c.code === 'RU')!;
  } catch {}
  return COUNTRIES[0]; // default KZ
}

// Cached IP detection result
let ipCountryCache: Country | null = null;
let ipDetectionPromise: Promise<Country> | null = null;

export async function detectCountryByIP(): Promise<Country> {
  if (ipCountryCache) return ipCountryCache;
  if (ipDetectionPromise) return ipDetectionPromise;
  
  ipDetectionPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      const countryCode = data.country_code; // e.g. "KZ", "KG", "UZ", "RU"
      const found = COUNTRIES.find(c => c.code === countryCode);
      ipCountryCache = found || detectCountryByTimezone();
      return ipCountryCache;
    } catch {
      ipCountryCache = detectCountryByTimezone();
      return ipCountryCache;
    }
  })();
  
  return ipDetectionPromise;
}

export function useDetectedCountry(): Country {
  const [country, setCountry] = useState<Country>(() => detectCountryByTimezone());

  useEffect(() => {
    detectCountryByIP().then(setCountry);
  }, []);

  return country;
}

export function CountryCodePicker({ selectedCountry, onSelect }: CountryCodePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="input-field flex items-center gap-1 px-2 py-2 h-full shrink-0 text-xs sm:text-sm whitespace-nowrap"
      >
        <span className="text-base">{selectedCountry.flag}</span>
        <span>+{selectedCountry.dialCode}</span>
        <ChevronDownIcon className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[200px] overflow-hidden">
          {COUNTRIES.map(country => (
            <button
              key={country.code}
              type="button"
              onClick={() => { onSelect(country); setIsOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted transition-colors ${
                country.code === selectedCountry.code ? 'bg-muted' : ''
              }`}
            >
              <span className="text-lg">{country.flag}</span>
              <span className="flex-1 text-left">{country.name}</span>
              <span className="text-muted-foreground">+{country.dialCode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
