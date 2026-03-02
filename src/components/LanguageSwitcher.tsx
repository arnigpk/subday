import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { useLanguage, Language } from '@/contexts/LanguageContext';

const options: { value: Language; label: string; code: string }[] = [
  { value: 'ru', label: 'Русский', code: 'RU' },
  { value: 'kz', label: 'Қазақша', code: 'KZ' },
  { value: 'en', label: 'English', code: 'EN' },
  { value: 'uz', label: 'O\'zbek', code: 'UZ' },
  { value: 'kg', label: 'Кыргызча', code: 'KG' },
];

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find(o => o.value === language)!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 bg-secondary/80 backdrop-blur-sm px-2.5 py-1.5 rounded-xl text-xs font-semibold text-foreground transition-all hover:bg-secondary active:scale-95 border border-border/50"
      >
        <Globe size={14} className="text-primary" />
        <span>{current.code}</span>
        <ChevronDown size={12} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-[200] bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[150px] animate-in fade-in-0 zoom-in-95 duration-150">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setLanguage(opt.value); setIsOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                opt.value === language
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-secondary'
              }`}
            >
              <span className="text-xs font-bold uppercase">{opt.code}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
