import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, UserCheck, UserX, Clock, UserPlus, UserMinus } from 'lucide-react';

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
  { value: 'all', label: 'Все пользователи', description: 'С подпиской и без', icon: <Users className="w-4 h-4" /> },
  { value: 'subscribers', label: 'С активной подпиской', description: 'Все у кого есть подписка', icon: <UserCheck className="w-4 h-4" /> },
  { value: 'no_subscription', label: 'Без подписки', description: 'Нет активной подписки', icon: <UserX className="w-4 h-4" /> },
  { value: 'expiring_soon', label: 'Осталось ≤5 дней', description: 'До конца подписки ≤5 дней', icon: <Clock className="w-4 h-4" /> },
  { value: 'new_users', label: 'Новые пользователи', description: 'Зарегистрированы за 7 дней', icon: <UserPlus className="w-4 h-4" /> },
  { value: 'inactive', label: 'Неактивные', description: 'Не заходили 30+ дней', icon: <UserMinus className="w-4 h-4" /> },
];

interface AudienceTypeSelectorProps {
  value: AudienceType;
  onChange: (value: AudienceType) => void;
  disabled?: boolean;
}

export function AudienceTypeSelector({ value, onChange, disabled }: AudienceTypeSelectorProps) {
  const selected = audienceOptions.find(o => o.value === value);

  return (
    <div className="space-y-2">
      <Label>Тип аудитории</Label>
      <Select value={value} onValueChange={(v) => onChange(v as AudienceType)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue>
            {selected && (
              <span className="flex items-center gap-2">
                {selected.icon}
                {selected.label}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {audienceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex items-center gap-2">
                {opt.icon}
                <div>
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
