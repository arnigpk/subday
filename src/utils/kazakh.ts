/**
 * Returns the correct Kazakh ablative suffix (-дан/-ден/-тан/-тен/-нан/-нен)
 * based on the number, following Kazakh grammar rules.
 */
export function getKzSuffix(n: number): string {
  const lastTwo = n % 100;
  const lastOne = n % 10;

  if (lastOne === 0) {
    const tens = Math.floor(lastTwo / 10);
    if (tens === 1 || tens === 2 || tens === 3 || tens === 4 || tens === 7 || tens === 8) return 'дан';
    if (tens === 5) return 'тен';
    if (tens === 6) return 'тан';
    if (tens === 9) return 'нан';
    if (n % 1000 === 0) return 'нан';
    if (n % 100 === 0) return 'ден';
    return 'дан';
  }

  if (lastOne === 6 || lastOne === 9) return 'дан';
  if (lastOne === 3 || lastOne === 4 || lastOne === 5) return 'тен';
  if (lastOne === 1 || lastOne === 2 || lastOne === 7 || lastOne === 8) return 'ден';

  return 'ден';
}

const KZ_MONTHS_SHORT = [
  'қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.',
  'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'
];

const KZ_MONTHS_FULL = [
  'Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым',
  'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'
];

/**
 * Format a date with Kazakh month names.
 * pattern: 'short' = "5 қаң", 'long' = "5 Қаңтар"
 */
export function formatDateKz(date: Date, pattern: 'short' | 'long' = 'short'): string {
  const day = date.getDate();
  const month = pattern === 'short' ? KZ_MONTHS_SHORT[date.getMonth()] : KZ_MONTHS_FULL[date.getMonth()];
  return `${day} ${month}`;
}

/**
 * Format a date for subscription expiry display in Kazakh.
 * Returns "5 қаң" or "5 қаң 2026" if includeYear is true.
 */
export function formatDateKzWithYear(date: Date, includeYear: boolean): string {
  const day = date.getDate();
  const month = KZ_MONTHS_SHORT[date.getMonth()];
  return includeYear ? `${day} ${month} ${date.getFullYear()}` : `${day} ${month}`;
}
