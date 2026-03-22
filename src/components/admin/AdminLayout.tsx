import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  Users, 
  History, 
  Coffee, 
  Settings, 
  LogOut,
  ChevronLeft,
  CreditCard,
  Send,
  Bell,
  Receipt,
  Image,
  Gift,
  Zap,
  Loader,
  Megaphone,
  QrCode,
  MessageSquareText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

const navItems = [
  { icon: LayoutDashboard, label: 'Дашборд', path: '/admin', roles: ['superadmin', 'admin', 'moderator'] },
  { icon: Users, label: 'Пользователи', path: '/admin/users', roles: ['superadmin', 'admin', 'moderator'] },
  { icon: History, label: 'История', path: '/admin/history', roles: ['superadmin', 'admin', 'moderator', 'partner'] },
  { icon: Receipt, label: 'Транзакции подписок', path: '/admin/subscription-transactions', roles: ['superadmin', 'admin'] },
  { icon: Coffee, label: 'Кофейни', path: '/admin/shops', roles: ['superadmin', 'admin', 'moderator', 'partner'] },
  { icon: CreditCard, label: 'Подписки', path: '/admin/subscriptions', roles: ['superadmin', 'admin'] },
  { icon: Image, label: 'Рекл. баннеры', path: '/admin/banners', roles: ['superadmin', 'admin'] },
  { icon: Megaphone, label: 'Реклама subFlow', path: '/admin/subflow-ads', roles: ['superadmin', 'admin'] },
  { icon: Gift, label: 'Спецпредложения', path: '/admin/special-offers', roles: ['superadmin', 'admin'] },
  { icon: Send, label: 'Рассылка Telegram', path: '/admin/broadcast', roles: ['superadmin', 'admin'] },
  { icon: Bell, label: 'Рассылка PUSH', path: '/admin/push-broadcast', roles: ['superadmin', 'admin'] },
  { icon: MessageSquareText, label: 'Сообщения', path: '/admin/messages', roles: ['superadmin', 'admin'] },
  { icon: Zap, label: 'Автоуведомления', path: '/admin/auto-notifications', roles: ['superadmin', 'admin'] },
  { icon: Loader, label: 'Прелоадер', path: '/admin/preloader', roles: ['superadmin', 'admin'] },
  { icon: QrCode, label: 'Настройки QR', path: '/admin/qr-settings', roles: ['superadmin', 'admin'] },
  { icon: Settings, label: 'Настройки', path: '/admin/settings', roles: ['superadmin'] },
];

export function AdminLayout({ children, title }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isAdmin } = useAdminAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const filteredNavItems = navItems.filter(item => 
    role && item.roles.includes(role)
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm">Вернуться в приложение</span>
          </Link>
          <h1 className="text-xl font-bold mt-3">subday admin</h1>
          {role === 'superadmin' ? (
            <Badge className="mt-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">
              ⭐ СуперАдмин
            </Badge>
          ) : (
            <p className="text-xs text-muted-foreground capitalize mt-1">{role === 'admin' ? 'Админ' : role}</p>
          )}
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
            <span>Выйти</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-card border-b border-border z-50">
        <div className="flex items-center justify-between p-4">
          <div>
            <Link to="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-xs mb-1">
              <ChevronLeft className="w-3 h-3" />
              <span>В приложение</span>
            </Link>
            <h1 className="font-bold">subday admin</h1>
            {role === 'superadmin' ? (
              <Badge className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">
                ⭐ СуперАдмин
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground capitalize">{role === 'admin' ? 'Админ' : role}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
        <nav className="flex overflow-x-auto px-4 pb-2 gap-2">
          {filteredNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:overflow-auto">
        <div className="md:p-8 p-4 pt-28 md:pt-8">
          <h2 className="text-2xl font-bold mb-6">{title}</h2>
          {children}
        </div>
      </main>
    </div>
  );
}
