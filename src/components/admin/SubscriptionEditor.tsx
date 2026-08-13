import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { formatExpiryLabel } from '@/lib/subscriptionDays';

/** Подписка в том виде, в каком её показывает карточка пользователя. */
export interface EditableSubscription {
  name: string;
  expires_at: string | null;
  sub_id: string;
  cups_count: number | null;
  duration_days: number | null;
}

/**
 * Остаток и срок одной подписки.
 *
 * Править можно только то, что у человека реально есть: без подписки поля
 * заблокированы — менять остаток в никуда бессмысленно, а срок тем более.
 * Продление идёт по существующему тарифу: кнопка «+период» добавляет ровно
 * столько дней и чашек, сколько записано в самом тарифе, новую подписку не
 * создаёт.
 */
export function SubscriptionEditor({ title, icon, sub, remaining, days, canManage, onRemaining, onDays }: {
  title: string;
  icon: React.ReactNode;
  sub: EditableSubscription | null;
  remaining: number;
  days: number | null;
  canManage: boolean;
  onRemaining: (v: number) => void;
  onDays: (v: number) => void;
}) {
  const has = !!sub;
  const editable = canManage && has;
  const period = sub?.duration_days ?? null;
  const cups = sub?.cups_count ?? null;

  return (
    <div className={`rounded-lg border px-3 py-3 space-y-3 ${has ? '' : 'opacity-60'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          {has ? (
            <span className="text-xs text-muted-foreground">— {sub!.name}</span>
          ) : (
            <span className="text-xs text-muted-foreground">— нет подписки</span>
          )}
        </div>
        {has && (
          <span className="text-xs text-muted-foreground">{formatExpiryLabel(sub!.expires_at)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Остаток, шт</Label>
          <Input
            type="number"
            min="0"
            value={remaining}
            onChange={(e) => onRemaining(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={!editable}
            className={`mt-1 ${editable ? '' : 'bg-muted'}`}
          />
        </div>
        <div>
          <Label className="text-xs">Срок, дней</Label>
          <Input
            type="number"
            min="0"
            value={days ?? 0}
            onChange={(e) => onDays(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={!editable}
            className={`mt-1 ${editable ? '' : 'bg-muted'}`}
          />
        </div>
      </div>

      {/* Срок на нуле, а остаток начислен — начисленное не доживёт до утра.
          Ежечасная проверка (expire_subscriptions) отключает просроченную подписку
          и обнуляет остаток. Пока срок не продлён, добавлять чашки бессмысленно —
          предупреждаем прямо, а не даём наступить на грабли. */}
      {editable && (days ?? 0) === 0 && remaining > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Срок истёк. Остаток обнулится при ближайшей проверке — добавьте дни,
          иначе начисленное пропадёт.
        </p>
      )}

      {editable && period !== null && cups !== null && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => { onDays((days ?? 0) + period); onRemaining(remaining + cups); }}
          >
            <Plus className="w-3 h-3" />
            период тарифа: +{period} дн / +{cups} шт
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => { onDays(Math.max(0, (days ?? 0) - period)); onRemaining(Math.max(0, remaining - cups)); }}
          >
            −период
          </Button>
        </div>
      )}
    </div>
  );
}