import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

/** Общие настройки показа — одинаковые для баннеров и SubFlow-рекламы. */
export interface AdTargetingValues {
  weight: number;
  daily_limit: number;
  min_interval_minutes: number;
  view_budget: number;
  click_limit: number;
  days_of_week: number[];              // пусто = все дни
  hour_from: number | null;            // null = круглосуточно
  hour_to: number | null;
  target_subscription_type_ids: string[]; // пусто = все
  ab_split: number;                    // 0 = A/B выключен
}

export const emptyTargeting: AdTargetingValues = {
  weight: 1, daily_limit: 0, min_interval_minutes: 0, view_budget: 0, click_limit: 0,
  days_of_week: [], hour_from: null, hour_to: null, target_subscription_type_ids: [], ab_split: 0,
};

const DAYS = [
  { v: 1, l: 'Пн' }, { v: 2, l: 'Вт' }, { v: 3, l: 'Ср' }, { v: 4, l: 'Чт' },
  { v: 5, l: 'Пт' }, { v: 6, l: 'Сб' }, { v: 7, l: 'Вс' },
];

interface Props {
  value: AdTargetingValues;
  onChange: (v: AdTargetingValues) => void;
  /** Показывать «дневной лимит» (для SubFlow он уже есть отдельно — тогда false). */
  showDailyLimit?: boolean;
}

export function AdTargetingFields({ value, onChange, showDailyLimit = true }: Props) {
  const [subTypes, setSubTypes] = useState<{ id: string; name: string }[]>([]);
  const set = (patch: Partial<AdTargetingValues>) => onChange({ ...value, ...patch });

  useEffect(() => {
    supabase.from('subscription_types').select('id, name').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSubTypes((data as { id: string; name: string }[]) || []));
  }, []);

  const toggleDay = (d: number) => {
    const has = value.days_of_week.includes(d);
    set({ days_of_week: has ? value.days_of_week.filter(x => x !== d) : [...value.days_of_week, d].sort() });
  };
  const toggleSub = (id: string) => {
    const has = value.target_subscription_type_ids.includes(id);
    set({ target_subscription_type_ids: has ? value.target_subscription_type_ids.filter(x => x !== id) : [...value.target_subscription_type_ids, id] });
  };

  const num = (v: string) => Math.max(0, parseInt(v) || 0);

  return (
    <div className="space-y-4 rounded-xl border border-border p-3">
      <p className="text-sm font-semibold text-foreground">Показ и ограничения</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Вес (приоритет)</Label>
          <Input type="number" min={1} value={value.weight}
            onChange={e => set({ weight: Math.max(1, parseInt(e.target.value) || 1) })} />
          <p className="text-[11px] text-muted-foreground mt-1">Больше вес — чаще выпадает при конкуренции</p>
        </div>
        {showDailyLimit && (
          <div>
            <Label>Показов в день (на юзера)</Label>
            <Input type="number" min={0} value={value.daily_limit}
              onChange={e => set({ daily_limit: num(e.target.value) })} />
            <p className="text-[11px] text-muted-foreground mt-1">0 — без ограничения</p>
          </div>
        )}
        <div>
          <Label>Не чаще, чем раз в (мин)</Label>
          <Input type="number" min={0} value={value.min_interval_minutes}
            onChange={e => set({ min_interval_minutes: num(e.target.value) })} />
          <p className="text-[11px] text-muted-foreground mt-1">0 — без ограничения</p>
        </div>
        <div>
          <Label>Бюджет показов (всего)</Label>
          <Input type="number" min={0} value={value.view_budget}
            onChange={e => set({ view_budget: num(e.target.value) })} />
          <p className="text-[11px] text-muted-foreground mt-1">0 — безлимит; открутится и остановится</p>
        </div>
        <div>
          <Label>Лимит кликов (всего)</Label>
          <Input type="number" min={0} value={value.click_limit}
            onChange={e => set({ click_limit: num(e.target.value) })} />
          <p className="text-[11px] text-muted-foreground mt-1">0 — безлимит</p>
        </div>
      </div>

      <div>
        <Label>Дни недели</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {DAYS.map(d => {
            const on = value.days_of_week.includes(d.v);
            return (
              <button key={d.v} type="button" onClick={() => toggleDay(d.v)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>
                {d.l}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Ничего не выбрано — показ во все дни</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Час начала</Label>
          <Input type="number" min={0} max={23} placeholder="круглосуточно"
            value={value.hour_from ?? ''}
            onChange={e => set({ hour_from: e.target.value === '' ? null : Math.min(23, num(e.target.value)) })} />
        </div>
        <div>
          <Label>Час конца</Label>
          <Input type="number" min={1} max={24} placeholder="круглосуточно"
            value={value.hour_to ?? ''}
            onChange={e => set({ hour_to: e.target.value === '' ? null : Math.min(24, num(e.target.value)) })} />
        </div>
        <p className="col-span-2 text-[11px] text-muted-foreground -mt-1">Пусто — круглосуточно. Можно через полночь (напр. 22 → 6)</p>
      </div>

      <div>
        <Label>Только для тарифов</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {subTypes.map(s => {
            const on = value.target_subscription_type_ids.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleSub(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>
                {s.name}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Ничего не выбрано — показывать всем (без привязки к тарифу)</p>
      </div>

      <div>
        <Label>A/B-тест: доля варианта B (%)</Label>
        <Input type="number" min={0} max={99} value={value.ab_split}
          onChange={e => set({ ab_split: Math.min(99, num(e.target.value)) })} />
        <p className="text-[11px] text-muted-foreground mt-1">0 — A/B выключен. Напр. 50 — половине покажем вариант B</p>
      </div>
    </div>
  );
}
