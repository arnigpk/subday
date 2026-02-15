/**
 * Returns the correct Kazakh ablative suffix (-дан/-ден/-тан/-тен/-нан/-нен)
 * based on the number, following Kazakh grammar rules.
 */
export function getKzSuffix(n: number): string {
  // Specific known mappings based on Kazakh phonetic rules
  // Last significant digit determines the suffix
  const lastTwo = n % 100;
  const lastOne = n % 10;

  // Numbers ending in 0
  if (lastOne === 0) {
    // 10,20,30 -> дан; 40,70,80 -> дан; 50 -> тен; 60 -> тан; 90 -> нан
    const tens = Math.floor(lastTwo / 10);
    if (tens === 1 || tens === 2 || tens === 3 || tens === 4 || tens === 7 || tens === 8) return 'дан';
    if (tens === 5) return 'тен';
    if (tens === 6) return 'тан';
    if (tens === 9) return 'нан';
    // 100, 200... 
    if (n % 1000 === 0) return 'нан'; // мың -> нан
    if (n % 100 === 0) return 'ден'; // жүз -> ден
    return 'дан';
  }

  // Numbers ending in 6, 9 -> дан
  if (lastOne === 6 || lastOne === 9) return 'дан';

  // Numbers ending in 3, 4, 5 -> тен
  if (lastOne === 3 || lastOne === 4 || lastOne === 5) return 'тен';

  // Numbers ending in 1, 2, 7, 8 -> ден
  if (lastOne === 1 || lastOne === 2 || lastOne === 7 || lastOne === 8) return 'ден';

  return 'ден';
}
