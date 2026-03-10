import { COUNTRY_OPTIONS, getCitiesForCountry } from '@/utils/countries';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CountryCityFilterProps {
  countryFilter: string;
  cityFilter: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  countryClassName?: string;
  cityClassName?: string;
}

export function CountryCityFilter({
  countryFilter,
  cityFilter,
  onCountryChange,
  onCityChange,
  countryClassName = 'w-full sm:w-44',
  cityClassName = 'w-full sm:w-44',
}: CountryCityFilterProps) {
  return (
    <>
      <Select value={countryFilter} onValueChange={(v) => {
        onCountryChange(v);
        onCityChange('all');
      }}>
        <SelectTrigger className={countryClassName}>
          <SelectValue placeholder="Страна" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все страны</SelectItem>
          {COUNTRY_OPTIONS.map(c => (
            <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={cityFilter} onValueChange={onCityChange}>
        <SelectTrigger className={cityClassName}>
          <SelectValue placeholder="Город" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все города</SelectItem>
          {countryFilter !== 'all' && getCitiesForCountry(countryFilter).map(city => (
            <SelectItem key={city} value={city}>{city}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
