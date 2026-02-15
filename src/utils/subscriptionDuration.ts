/**
 * Determines subscription duration in days based on cups count.
 */
export function getSubscriptionDurationDays(cupsCount: number): number {
  if (cupsCount >= 360) return 365;
  if (cupsCount >= 180) return 180;
  return 30;
}

/**
 * Formats duration for display
 */
export function formatDurationLabel(days: number, lang: string = 'ru'): string {
  if (lang === 'kz') {
    if (days >= 365) return '1 жыл';
    if (days >= 180) return '6 ай';
    if (days >= 30) return '1 ай';
    return `${days} күн`;
  }
  if (days >= 365) return '1 год';
  if (days >= 180) return '6 месяцев';
  if (days >= 30) return '1 месяц';
  return `${days} дней`;
}

/**
 * Returns period text for UI display
 */
export function getPeriodText(days: number, lang: string = 'ru'): string {
  if (lang === 'kz') {
    if (days >= 365) return 'жыл';
    if (days >= 180) return '6 ай';
    if (days >= 30) return 'ай';
    return `${days} күн`;
  }
  if (days >= 365) return 'год';
  if (days >= 180) return '6 месяцев';
  if (days >= 30) return 'месяц';
  return `${days} дней`;
}

/**
 * Returns true if subscription is annual (360+ cups)
 */
export function isAnnualSubscription(cupsCount: number): boolean {
  return cupsCount >= 360;
}

/**
 * Returns true if subscription is semi-annual (180+ cups)
 */
export function isSemiAnnualSubscription(cupsCount: number): boolean {
  return cupsCount >= 180 && cupsCount < 360;
}
