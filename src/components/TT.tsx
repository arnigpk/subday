import { useAutoTranslate } from '@/hooks/useAutoTranslate';

// «Translate Text» — обёртка для автоперевода любой строки через Gemini
// (translate-text edge function). Для ru возвращает текст как есть; для
// остальных языков переводит с кэшем и батчингом (см. useAutoTranslate).
// Используется там, где текст захардкожен по-русски или приходит из БД
// без словарного перевода.
export function TT({ text }: { text: string | null | undefined }) {
  const translated = useAutoTranslate(text || '');
  return <>{translated}</>;
}
