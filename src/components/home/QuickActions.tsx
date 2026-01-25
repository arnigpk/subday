import { MapPin, Package, Gift, Flame } from 'lucide-react';
import { Link } from 'react-router-dom';
import { userData } from '@/data/mockData';

const actions = [
  {
    icon: MapPin,
    label: 'Кофейни рядом',
    path: '/shops',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: Package,
    label: 'Мои пакеты',
    path: '/packages',
    color: 'bg-accent/10 text-accent',
  },
  {
    icon: Gift,
    label: 'Бонусы',
    path: '/bonuses',
    badge: `${userData.bonusPoints}`,
    color: 'bg-yellow-500/10 text-yellow-600',
  },
  {
    icon: Flame,
    label: 'Стрики',
    path: '/streaks',
    badge: `${userData.currentStreak}`,
    color: 'bg-orange-500/10 text-orange-500',
  },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.path}
            to={action.path}
            className="card-interactive flex items-center gap-3"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color}`}>
              <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{action.label}</p>
              {action.badge && (
                <span className="text-xs font-bold text-accent">{action.badge}</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
