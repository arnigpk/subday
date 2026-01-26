import { Home, Coffee, MapPin, Clock, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { icon: Home, label: 'Главная', path: '/' },
  { icon: Coffee, label: 'Пакеты', path: '/packages' },
  { icon: MapPin, label: 'Кофейни', path: '/shops' },
  { icon: Clock, label: 'История', path: '/history' },
  { icon: User, label: 'Профиль', path: '/profile' },
];

export function BottomNav() {
  const location = useLocation();
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom z-50">
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item transition-all duration-200 py-1 ${
                isActive ? 'nav-item-active scale-105' : 'nav-item-inactive'
              }`}
            >
              <Icon 
                size={20} 
                strokeWidth={isActive ? 2.5 : 2}
                className="transition-all duration-200"
              />
              <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
