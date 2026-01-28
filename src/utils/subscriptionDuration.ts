/**
 * Determines subscription duration in days based on cups count.
 * 
 * Rules:
 * - 360+ cups = 1 year (365 days)
 * - 180+ cups = 6 months (180 days)
 * - Less than 180 cups = 1 month (30 days, minimum)
 */
export function getSubscriptionDurationDays(cupsCount: number): number {
  if (cupsCount >= 360) {
    return 365; // 1 year
  }
  if (cupsCount >= 180) {
    return 180; // 6 months
  }
  return 30; // 1 month (minimum)
}

/**
 * Formats duration for display
 */
export function formatDurationLabel(days: number): string {
  if (days >= 365) {
    return '1 год';
  }
  if (days >= 180) {
    return '6 месяцев';
  }
  if (days >= 30) {
    return '1 месяц';
  }
  return `${days} дней`;
}

/**
 * Returns period text for UI display
 */
export function getPeriodText(days: number): string {
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
