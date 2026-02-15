import { useLanguage } from '@/contexts/LanguageContext';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'ru' ? 'kz' : 'ru')}
      className="text-xs font-bold text-foreground bg-secondary px-2 py-1 rounded-lg transition-colors hover:bg-secondary/80"
    >
      {language === 'ru' ? 'KZ' : 'RU'}
    </button>
  );
}
