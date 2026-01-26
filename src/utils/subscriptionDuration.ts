/**
 * Determines subscription duration in days based on cups count.
 * 
 * Rules:
 * - 365+ cups = 1 year (365 days)
 * - Less than 365 cups = 1 month (30 days)
 */
export function getSubscriptionDurationDays(cupsCount: number): number {
  if (cupsCount >= 365) {
    return 365; // 1 year
  }
  return 30; // 1 month
}

/**
 * Formats duration for display
 */
export function formatDurationLabel(days: number): string {
  if (days >= 365) {
    return '1 год';
  }
  return `${days} дней`;
}

/**
 * Returns true if subscription is annual (365+ cups)
 */
export function isAnnualSubscription(cupsCount: number): boolean {
  return cupsCount >= 365;
}
