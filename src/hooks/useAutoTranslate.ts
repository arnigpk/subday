import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';

// Per-language cache
const translationCaches = new Map<string, Map<string, string>>();

function getCache(lang: string): Map<string, string> {
  if (!translationCaches.has(lang)) {
    translationCaches.set(lang, new Map());
  }
  return translationCaches.get(lang)!;
}

// Pre-seed Kazakh overrides
const MANUAL_KZ_OVERRIDES: Record<string, string> = {
  'Попробуй и будь в числе первых! ✅': 'Қосылыңыз және алғашқылардың қатарында болыңыз! ✅',
  'Капучино или Латте каждый день 🔥': 'Күнделікті капучино және латте 🔥',
  'Для тех, кто хочет попробовать всё 🚀': 'Барлығын сынап көргісі келетіндерге 🚀',
};

const kzCache = getCache('kz');
Object.entries(MANUAL_KZ_OVERRIDES).forEach(([ru, kz]) => {
  kzCache.set(ru, kz);
  kzCache.set(ru.trim(), kz);
});

// Target language map for translate-text edge function
const LANG_MAP: Record<string, string> = {
  kz: 'kz',
  en: 'en',
  uz: 'uz',
  kg: 'kg',
};

// Batch queue per language
const batchQueues = new Map<string, { text: string; resolve: (val: string) => void }[]>();
const batchTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

async function processBatch(lang: string) {
  const queue = batchQueues.get(lang) || [];
  batchQueues.set(lang, []);
  batchTimeouts.delete(lang);

  if (queue.length === 0) return;

  const textsToTranslate = queue.map(b => b.text);
  const cache = getCache(lang);

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { texts: textsToTranslate, targetLang: LANG_MAP[lang] || lang },
    });

    if (error) throw error;

    const translations: string[] = data?.translations || textsToTranslate;
    queue.forEach((item, i) => {
      const translated = translations[i] || item.text;
      cache.set(item.text, translated);
      item.resolve(translated);
    });
  } catch (err) {
    console.error('Translation error:', err);
    queue.forEach(item => item.resolve(item.text));
  }
}

function queueTranslation(text: string, lang: string): Promise<string> {
  const trimmed = text.trim();
  const cache = getCache(lang);
  const cached = cache.get(trimmed) || cache.get(text);
  if (cached) return Promise.resolve(cached);

  return new Promise(resolve => {
    if (!batchQueues.has(lang)) batchQueues.set(lang, []);
    batchQueues.get(lang)!.push({ text, resolve });
    
    const existing = batchTimeouts.get(lang);
    if (existing) clearTimeout(existing);
    batchTimeouts.set(lang, setTimeout(() => processBatch(lang), 100));
  });
}

/**
 * Hook to auto-translate a single string.
 * Returns original text for 'ru', translated text for other languages.
 */
export function useAutoTranslate(text: string | null | undefined): string {
  const { language } = useLanguage();
  const [translated, setTranslated] = useState(text || '');

  useEffect(() => {
    if (!text) {
      setTranslated('');
      return;
    }
    if (language === 'ru') {
      setTranslated(text);
      return;
    }

    const cache = getCache(language);
    const cached = cache.get(text.trim()) || cache.get(text);
    if (cached) {
      setTranslated(cached);
      return;
    }

    setTranslated(text);
    queueTranslation(text, language).then(setTranslated);
  }, [text, language]);

  return translated;
}

/**
 * Hook to auto-translate an array of strings.
 */
export function useAutoTranslateArray(texts: string[]): string[] {
  const { language } = useLanguage();
  const [translated, setTranslated] = useState<string[]>(texts);

  useEffect(() => {
    if (language === 'ru') {
      setTranslated(texts);
      return;
    }

    if (texts.length === 0) {
      setTranslated([]);
      return;
    }

    setTranslated(texts);
    Promise.all(texts.map(t => queueTranslation(t, language))).then(setTranslated);
  }, [texts.join('|||'), language]);

  return translated;
}
