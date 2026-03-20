import { formatDateKzWithYear } from '@/utils/kazakh';

/**
 * Pluralizes day word based on language
 */
export function pluralizeDays(days: number, lang: string = 'ru'): string {
  if (lang === 'kz' || lang === 'kg') return 'күн';
  if (lang === 'en') return days === 1 ? 'day' : 'days';
  if (lang === 'uz') return 'kun';
  // Russian pluralization
  if (days % 10 === 1 && days % 100 !== 11) return 'день';
  if (days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20)) return 'дня';
  return 'дней';
}

/**
 * Formats days remaining as "~XX дней"
 */
export function formatDaysCount(days: number, lang: string = 'ru'): string {
  return `~${days} ${pluralizeDays(days, lang)}`;
}

/**
 * Formats expiry date as "(до DD MMM YYYY)" with localization
 */
export function formatExpiryDateParens(expiresAt: string | Date, lang: string = 'ru', includeYear?: boolean): string {
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const showYear = includeYear !== undefined ? includeYear : daysUntil > 30;
  
  if (lang === 'kz' || lang === 'kg') {
    return `(${formatDateKzWithYear(date, showYear)} дейін)`;
  }
  if (lang === 'en') {
    return `(until ${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: showYear ? 'numeric' : undefined })})`;
  }
  if (lang === 'uz') {
    return `(${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: showYear ? 'numeric' : undefined })} gacha)`;
  }
  return `(до ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: showYear ? 'numeric' : undefined })})`;
}

/**
 * Full unified format: "~XX дней (до DD MMM YYYY)"
 * Used for subscription expiry display across the entire app.
 */
export function formatSubscriptionExpiry(
  days: number,
  expiresAt: string | Date,
  lang: string = 'ru',
  expiredText: string = 'Истёк'
): string {
  if (days <= 0) return expiredText;
  return `${formatDaysCount(days, lang)} ${formatExpiryDateParens(expiresAt, lang)}`;
}

/**
 * Calculates days remaining from an expiry date
 */
export function calcDaysRemaining(expiresAt: string | Date): number {
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
