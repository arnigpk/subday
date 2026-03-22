import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UserGroupIcon, UserIcon, UserMinusIcon, ClockIcon, UserPlusIcon } from '@heroicons/react/24/outline';

export type AudienceType =
  | 'all'
  | 'subscribers'
  | 'no_subscription'
  | 'expiring_soon'
  | 'new_users'
  | 'inactive';

interface AudienceOption {
  value: AudienceType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const audienceOptions: AudienceOption[] = [
  { value: 'all', label: 'Все пользователи', description: 'С подпиской и без', icon: <UserGroupIcon className="w-4 h-4" /> },
  { value: 'subscribers', label: 'С активной подпиской', description: 'Все у кого есть подписка', icon: <UserIcon className="w-4 h-4" /> },
  { value: 'no_subscription', label: 'Без подписки', description: 'Нет активной подписки', icon: <UserMinusIcon className="w-4 h-4" /> },
  { value: 'expiring_soon', label: 'Осталось ≤5 дней', description: 'До конца подписки ≤5 дней', icon: <ClockIcon className="w-4 h-4" /> },
  { value: 'new_users', label: 'Новые пользователи', description: 'Зарегистрированы за 7 дней', icon: <UserPlusIcon className="w-4 h-4" /> },
  { value: 'inactive', label: 'Неактивные', description: 'Не заходили 30+ дней', icon: <UserMinusIcon className="w-4 h-4" /> },
];

export { audienceOptions };

interface AudienceTypeSelectorProps {
  value: AudienceType[];
  onChange: (value: AudienceType[]) => void;
  disabled?: boolean;
}

export function AudienceTypeSelector({ value, onChange, disabled }: AudienceTypeSelectorProps) {
  const toggle = (type: AudienceType) => {
    if (disabled) return;
    if (type === 'all') {
      onChange(['all']);
      return;
    }
    // Remove 'all' when selecting specific types
    const without = value.filter(v => v !== 'all');
    if (without.includes(type)) {
      const next = without.filter(v => v !== type);
      onChange(next.length === 0 ? ['all'] : next);
    } else {
      onChange([...without, type]);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Тип аудитории</Label>
      <div className="flex flex-wrap gap-2">
        {audienceOptions.map((opt) => {
          const isActive = value.includes(opt.value);
          return (
            <Badge
              key={opt.value}
              variant={isActive ? 'default' : 'outline'}
              className={`cursor-pointer select-none transition-colors gap-1.5 py-1.5 px-3 ${
                disabled ? 'opacity-50 pointer-events-none' : ''
              } ${isActive ? '' : 'hover:bg-muted'}`}
              onClick={() => toggle(opt.value)}
            >
              {opt.icon}
              {opt.label}
            </Badge>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Можно комбинировать несколько типов аудитории
      </p>
    </div>
  );
}
