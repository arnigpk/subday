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
  behavior_target: string;             // any | new | lapsed | active
  behavior_days: number;
  exclude_visited_days: number;
  target_competitor_shop_ids: string[];
  pacing: string;                      // asap | even
}

export const emptyTargeting: AdTargetingValues = {
  weight: 1, daily_limit: 0, min_interval_minutes: 0, view_budget: 0, click_limit: 0,
  days_of_week: [], hour_from: null, hour_to: null, target_subscription_type_ids: [], ab_split: 0,
  behavior_target: 'any', behavior_days: 30, exclude_visited_days: 0,
  target_competitor_shop_ids: [], pacing: 'asap',
};

const BEHAVIORS = [
  { v: 'any',    l: 'Всем',           hint: 'Без учёта посещений' },
  { v: 'new',    l: 'Не был ни разу', hint: 'Привлечение новых гостей' },
  { v: 'lapsed', l: 'Давно не был',   hint: 'Возврат ушедших — обычно самый конверсионный сегмент' },
  { v: 'active', l: 'Ходит сейчас',   hint: 'Удержание постоянных' },
];

const DAYS = [
  { v: 1, l: 'Пн' }, { v: 2, l: 'Вт' }, { v: 3, l: 'Ср' }, { v: 4, l: 'Чт' },
  { v: 5, l: 'Пт' }, { v: 6, l: 'Сб' }, { v: 7, l: 'Вс' },
];

interface Props {
  value: AdTargetingValues;
  onChange: (v: AdTargetingValues) => void;
  /** Показывать «дневной лимит» (для SubFlow он уже есть отдельно — тогда false). */
  showDailyLimit?: boolean;
  /** Кофейня объявления — от неё считается поведенческий таргет и охват. */
  shopId?: string | null;
  /** Гео и аудитория объявления — нужны для честной оценки охвата. */
  country?: string | null;
  city?: string | null;
  audienceTypes?: string[];
}

export function AdTargetingFields({
  value, onChange, showDailyLimit = true, shopId, country, city, audienceTypes,
}: Props) {
  const [subTypes, setSubTypes] = useState<{ id: string; name: string }[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [reach, setReach] = useState<{ matched: number; total: number } | null>(null);
  const [reachError, setReachError] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const set = (patch: Partial<AdTargetingValues>) => onChange({ ...value, ...patch });

  useEffect(() => {
    supabase.from('subscription_types').select('id, name').eq('is_active', true).order('sort_order')
      .then(({ data }) => setSubTypes((data as { id: string; name: string }[]) || []));
    supabase.from('shops').select('id, name').order('name')
      .then(({ data }) => setShops((data as { id: string; name: string }[]) || []));
  }, []);

  // Оценка охвата: сколько людей вообще попадёт под текущие настройки.
  // Считается на сервере по тем же правилам, что применяет клиент.
  useEffect(() => {
    let cancelled = false;
    setIsEstimating(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('estimate_ad_reach', {
        p: {
          country: country || null,
          city: city || null,
          shop_id: shopId || null,
          behavior_target: value.behavior_target,
          behavior_days: value.behavior_days,
          exclude_visited_days: value.exclude_visited_days,
          audience_types: audienceTypes?.length ? audienceTypes : ['all'],
          target_subscription_type_ids: value.target_subscription_type_ids,
          target_competitor_shop_ids: value.target_competitor_shop_ids,
        },
      });
      if (cancelled) return;
      setIsEstimating(false);
      if (error) { setReachError(error.message); setReach(null); return; }
      setReachError(null);
      setReach(data as unknown as { matched: number; total: number });
    }, 400); // не дёргаем сервер на каждое нажатие
    return () => { cancelled = true; clearTimeout(t); };
  }, [
    country, city, shopId, audienceTypes,
    value.behavior_target, value.behavior_days, value.exclude_visited_days,
    value.target_subscription_type_ids, value.target_competitor_shop_ids,
  ]);

  const toggleCompetitor = (id: string) => {
    const has = value.target_competitor_shop_ids.includes(id);
    set({
      target_competitor_shop_ids: has
        ? value.target_competitor_shop_ids.filter(x => x !== id)
        : [...value.target_competitor_shop_ids, id],
    });
  };

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

      {/* Поведенческий таргет — работает только если у объявления выбрана кофейня */}
      <div className="border-t border-border pt-3">
        <Label>Кому показывать по посещениям</Label>
        {!shopId && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1">
            Выберите кофейню у объявления — без неё поведенческий таргет не применяется
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {BEHAVIORS.map(b => {
            const on = value.behavior_target === b.v;
            return (
              <button key={b.v} type="button" disabled={!shopId && b.v !== 'any'}
                onClick={() => set({ behavior_target: b.v })}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-40 ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>
                {b.l}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {BEHAVIORS.find(b => b.v === value.behavior_target)?.hint}
        </p>

        {(value.behavior_target === 'lapsed' || value.behavior_target === 'active') && (
          <div className="mt-2">
            <Label>Окно, дней</Label>
            <Input type="number" min={1} value={value.behavior_days}
              onChange={e => set({ behavior_days: Math.max(1, parseInt(e.target.value) || 1) })} />
            <p className="text-[11px] text-muted-foreground mt-1">
              {value.behavior_target === 'lapsed'
                ? 'Не приходил столько дней'
                : 'Приходил за последние столько дней'}
            </p>
          </div>
        )}

        <div className="mt-2">
          <Label>Не показывать тем, кто был за последние (дней)</Label>
          <Input type="number" min={0} value={value.exclude_visited_days}
            onChange={e => set({ exclude_visited_days: num(e.target.value) })} />
          <p className="text-[11px] text-muted-foreground mt-1">0 — выключено. Не жечь показы на тех, кто и так ходит</p>
        </div>
      </div>

      {/* Перехват гостей других кофеен */}
      <div>
        <Label>Показывать тем, кто ходит в кофейни</Label>
        <div className="flex flex-wrap gap-1.5 mt-1 max-h-40 overflow-y-auto">
          {shops.filter(s => s.id !== shopId).map(s => {
            const on = value.target_competitor_shop_ids.includes(s.id);
            return (
              <button key={s.id} type="button" onClick={() => toggleCompetitor(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>
                {s.name}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Ничего не выбрано — правило не применяется</p>
      </div>

      {/* Темп открутки бюджета */}
      <div>
        <Label>Темп открутки</Label>
        <div className="flex gap-1.5 mt-1">
          {[
            { v: 'asap', l: 'Как пойдёт' },
            { v: 'even', l: 'Равномерно' },
          ].map(o => {
            const on = (value.pacing || 'asap') === o.v;
            return (
              <button key={o.v} type="button" onClick={() => set({ pacing: o.v })}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>
                {o.l}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          «Равномерно» растягивает бюджет показов на срок кампании — нужны бюджет и обе даты
        </p>
      </div>

      {/* Оценка охвата */}
      <div className="rounded-lg bg-secondary/60 px-3 py-2">
        {reachError ? (
          <p className="text-sm text-destructive">Не удалось оценить охват: {reachError}</p>
        ) : isEstimating || !reach ? (
          <p className="text-sm text-muted-foreground">Считаем охват…</p>
        ) : (
          <>
            <p className={`text-sm font-semibold ${reach.matched === 0 ? 'text-destructive' : 'text-foreground'}`}>
              Подходит {reach.matched} из {reach.total} пользователей
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {reach.matched === 0
                ? 'Под эти условия не попадает никто — кампания не открутится'
                : 'Оценка по текущим настройкам таргетинга'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
