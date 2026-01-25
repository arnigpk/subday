import { AppLayout } from '@/components/layout/AppLayout';
import { User, MapPin, Bell, HelpCircle, FileText, LogOut, ChevronRight, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

interface Profile {
  name: string | null;
  phone: string;
  city: string | null;
}

export default function ProfilePage() {
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('name, phone, city')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (data) {
          setProfile(data);
        } else if (error) {
          console.error('Error fetching profile:', error);
        }
      }
      setIsLoading(false);
    };
    
    fetchProfile();
  }, []);
  
  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };
  
  const menuItems = [
    { icon: MapPin, label: 'Город', value: profile?.city || 'Алматы' },
    { icon: Bell, label: 'Уведомления', value: 'Включены' },
    { icon: HelpCircle, label: 'Помощь', action: true },
    { icon: FileText, label: 'Условия', action: true },
  ];
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-6">Профиль</h1>
          
          {/* User card */}
          <div className="card-static flex items-center gap-4 mb-6 animate-slide-up">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <User size={32} className="text-primary" />
            </div>
            <div>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-6 w-32 bg-muted rounded mb-1" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-foreground">{profile?.name || 'Пользователь'}</h2>
                  <p className="text-muted-foreground">{profile?.phone || ''}</p>
                </>
              )}
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <div className="card-static text-center py-4">
              <p className="text-2xl font-black text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Напитков</p>
            </div>
            <div className="card-static text-center py-4">
              <p className="text-2xl font-black text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Стрик</p>
            </div>
            <div className="card-static text-center py-4">
              <p className="text-2xl font-black text-foreground">0</p>
              <p className="text-xs text-muted-foreground">Баллы</p>
            </div>
          </div>
          
          {/* Theme toggle */}
          <div className="card-interactive flex items-center justify-between mb-3 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center gap-3">
              {isDark ? <Moon size={20} className="text-muted-foreground" /> : <Sun size={20} className="text-muted-foreground" />}
              <span className="font-medium text-foreground">Тема: {isDark ? 'Эспрессо' : 'Латте'}</span>
            </div>
            <button 
              onClick={toggleTheme}
              className="w-12 h-7 rounded-full bg-secondary flex items-center p-1 transition-all"
            >
              <div className={`w-5 h-5 rounded-full bg-accent transition-all ${isDark ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          
          {/* Menu */}
          <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="card-interactive flex items-center gap-3">
                  <Icon size={20} className="text-muted-foreground" />
                  <span className="flex-1 font-medium text-foreground">{item.label}</span>
                  {item.value && (
                    <span className="text-sm text-muted-foreground">{item.value}</span>
                  )}
                  <ChevronRight size={18} className="text-muted-foreground" />
                </div>
              );
            })}
          </div>
          
          {/* Logout */}
          <button 
            onClick={async () => {
              setIsLoggingOut(true);
              const { error } = await supabase.auth.signOut();
              if (error) {
                toast.error('Ошибка выхода');
                setIsLoggingOut(false);
              } else {
                toast.success('До скорого!');
              }
            }}
            disabled={isLoggingOut}
            className="w-full mt-6 card-interactive flex items-center gap-3 text-destructive animate-slide-up disabled:opacity-50" 
            style={{ animationDelay: '0.2s' }}
          >
            <LogOut size={20} />
            <span className="font-medium">{isLoggingOut ? 'Выходим...' : 'Выйти'}</span>
          </button>
          
          {/* Version */}
          <p className="text-center text-xs text-muted-foreground mt-8">
            subday v1.0.0
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
