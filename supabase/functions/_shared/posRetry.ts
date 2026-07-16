// Общие правила ретрая POS-заказов (iiko / Poster / Rosta).
// Главное правило: НИКОГДА не отправлять повторно уже упавший на кассу заказ.
// Достигается на уровне вызывающего кода:
//   * ретраятся только строки status='failed' (успешные created/closed — терминальны);
//   * атомарный захват строки (failed→pending) исключает гонки;
//   * iiko — стабильный order.id = redemption_id (нативная дедупликация iiko);
//   * Poster/Rosta — если pos_order_id уже записан, повторно НЕ создаём (только дозакрываем),
//     а неоднозначные сетевые сбои создания снимают авто-ретрай (остаётся ручная кнопка).

export const RETRY_MAX = 5;            // авто-ретраев (шагов крона) после первой попытки
export const RETRY_DELAY_MS = 60_000;  // шаг 1 минута

/**
 * Поля журнала при НЕуспехе попытки.
 * @param attempts  текущее значение attempts у строки (число уже сделанных авто-захватов)
 * @param autoRetry можно ли авто-ретраить этот сбой (false — исход неоднозначный → только вручную)
 */
export function failFields(attempts: number, autoRetry: boolean, error: string): Record<string, unknown> {
  const willAuto = autoRetry && attempts < RETRY_MAX;
  return {
    status: 'failed',
    error,
    auto_retry: autoRetry,
    next_retry_at: willAuto ? new Date(Date.now() + RETRY_DELAY_MS).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

/** Поля журнала при УСПЕХе — терминальное состояние, ретраи выключены. */
export function successFields(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { next_retry_at: null, error: null, updated_at: new Date().toISOString(), ...extra };
}
