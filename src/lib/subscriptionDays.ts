/**
 * Расчёт срока подписки в днях.
 *
 * Вынесено отдельно намеренно: этой арифметикой пользуется админка, и ошибка тут
 * молча сдвигает людям дату окончания подписки. Такое нельзя проверять глазами.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Сколько дней осталось до конца подписки.
 *
 * Округление ВВЕРХ — так же, как в приложении (useSubscriptionStatus) и в
 * админском ярлыке срока. Иначе цифра у пользователя, в кабинете партнёра и в
 * админке расходилась бы на день. Истёкшая подписка — ноль, не отрицательное.
 */
export function daysLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

/**
 * Новая дата окончания, когда админ изменил число дней.
 *
 * Считаем ДЕЛЬТОЙ от текущей даты окончания, а не «сегодня плюс N дней». Причина
 * в округлении: показанное число дней округлено вверх, и запись его обратно как
 * «сегодня + N» каждый раз добавляла бы человеку несколько часов — сохранение
 * без единой правки тихо продлевало бы подписку.
 *
 * У истёкшей подписки точка отсчёта — текущий момент: иначе продление на 30 дней
 * от даты в прошлом снова дало бы прошлое.
 */
export function shiftExpiry(expiresAt: string | null, fromDays: number, toDays: number): string {
  const current = expiresAt ? new Date(expiresAt) : null;
  const alive = current && !Number.isNaN(current.getTime()) && current.getTime() > Date.now();
  const base = alive ? current! : new Date();
  return new Date(base.getTime() + (toDays - fromDays) * DAY_MS).toISOString();
}

/**
 * Подпись срока для админки: «~8 дней (до 21 авг 2026)».
 * Использует тот же daysLeft, поэтому число в подписи и в поле ввода совпадает.
 */
export function formatExpiryLabel(expiresAt: string | null): string {
  if (!expiresAt) return '—';
  const days = daysLeft(expiresAt);
  if (days <= 0) return 'Истёк';
  const word = days % 10 === 1 && days % 100 !== 11
    ? 'день'
    : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 10 || days % 100 >= 20)
      ? 'дня'
      : 'дней';
  const date = new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  return `~${days} ${word} (до ${date})`;
}
