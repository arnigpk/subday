import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';

// In-memory cache for translations (persists across renders, resets on page reload)
const translationCache = new Map<string, string>();

// Pre-seed with known correct Kazakh translations to avoid AI mistranslations
const MANUAL_KZ_OVERRIDES: Record<string, string> = {
  'Попробуй и будь в числе первых! ✅': 'Қосылыңыз және алғашқылардың қатарында болыңыз! ✅',
  'Капучино или Латте каждый день 🔥': 'Күнделікті капучино және латте 🔥',
  'Для тех, кто хочет попробовать всё 🚀': 'Барлығын сынап көргісі келетіндерге 🚀',
};

// Apply manual overrides to cache on load (both trimmed and original variants)
Object.entries(MANUAL_KZ_OVERRIDES).forEach(([ru, kz]) => {
  translationCache.set(ru, kz);
  translationCache.set(ru.trim(), kz);
});

// Batch queue for translations
let batchQueue: { text: string; resolve: (val: string) => void }[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

async function processBatch() {
  const batch = [...batchQueue];
  batchQueue = [];
  batchTimeout = null;

  if (batch.length === 0) return;

  const textsToTranslate = batch.map(b => b.text);

  try {
    const { data, error } = await supabase.functions.invoke('translate-text', {
      body: { texts: textsToTranslate, targetLang: 'kz' },
    });

    if (error) throw error;

    const translations: string[] = data?.translations || textsToTranslate;
    batch.forEach((item, i) => {
      const translated = translations[i] || item.text;
      translationCache.set(item.text, translated);
      item.resolve(translated);
    });
  } catch (err) {
    console.error('Translation error:', err);
    batch.forEach(item => item.resolve(item.text));
  }
}

function queueTranslation(text: string): Promise<string> {
  const trimmed = text.trim();
  const cached = translationCache.get(trimmed) || translationCache.get(text);
  if (cached) return Promise.resolve(cached);

  return new Promise(resolve => {
    batchQueue.push({ text, resolve });
    if (batchTimeout) clearTimeout(batchTimeout);
    batchTimeout = setTimeout(processBatch, 100); // batch within 100ms
  });
}

/**
 * Hook to auto-translate a single string.
 * Returns original text for 'ru', translated text for 'kz'.
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

    const cached = translationCache.get(text.trim()) || translationCache.get(text);
    if (cached) {
      setTranslated(cached);
      return;
    }

    // Show original while loading
    setTranslated(text);
    queueTranslation(text).then(setTranslated);
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

    // Show originals while loading
    setTranslated(texts);

    Promise.all(texts.map(t => queueTranslation(t))).then(setTranslated);
  }, [texts.join('|||'), language]);

  return translated;
}
