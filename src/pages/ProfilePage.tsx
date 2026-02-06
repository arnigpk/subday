import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { User, MapPin, Bell, MessageCircle, FileText, LogOut, ChevronRight, Moon, Sun } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceRulesDialog } from '@/components/auth/ServiceRulesDialog';
import { toast } from '@/components/ui/sonner';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { PurchaseHistorySection } from '@/components/profile/PurchaseHistorySection';
import { AvatarMenu } from '@/components/profile/AvatarMenu';

export default function ProfilePage() {
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { profile, stats, isLoading, updateAvatar, refetch } = useUserStatsContext();
  const { hasActiveSubscription, activeSubscriptions, isLoading: isSubLoading } = useSubscriptionStatus();
  
  // Check current notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);
  
  const handleNotificationToggle = async () => {
    if (!('Notification' in window)) {
      toast.error('Ваш браузер не поддерживает уведомления');
      return;
    }
    
    if (notificationsEnabled) {
      // Can't programmatically revoke, just update UI state
      setNotificationsEnabled(false);
      toast.info('Уведомления отключены');
      return;
    }
    
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        setNotificationsEnabled(true);
        toast.success('Уведомления включены!');
        // Show test notification
        new Notification('subday', {
          body: 'Уведомления успешно включены! ☕',
          icon: '/favicon.ico'
        });
      } else if (permission === 'denied') {
        toast.error('Разрешение на уведомления отклонено. Измените в настройках браузера.');
      } else {
        toast.info('Запрос на уведомления отменён');
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      toast.error('Ошибка при запросе разрешения');
    }
  };
  
  const handleSupportClick = () => {
    window.open('https://api.whatsapp.com/send/?phone=77077000994', '_blank');
  };
  
  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };
  
  const handleAvatarChange = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите изображение');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5МБ)');
      return;
    }
    
    setIsUploading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      
      // Update profile
      const success = await updateAvatar(publicUrl);
      
      if (success) {
        toast.success('Фото обновлено!');
        refetch();
      } else {
        throw new Error('Failed to update avatar');
      }
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Ошибка загрузки фото');
    } finally {
      setIsUploading(false);
    }
  };
  
  const menuItems = [
    { icon: MapPin, label: 'Город', value: profile?.city || 'Атырау', type: 'static' as const },
    { icon: Bell, label: 'Уведомления', type: 'notification' as const },
    { icon: MessageCircle, label: 'Помощь/техподдержка', type: 'support' as const },
    { icon: FileText, label: 'Правила сервиса', type: 'rules' as const },
  ];
  
  return (
    <AppLayout>
      <div className="safe-area-top">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-foreground mb-6">Профиль</h1>
          
          {/* User card */}
          <div className="card-static flex items-center gap-4 mb-6 animate-slide-up">
            <div className="relative">
              <Avatar className="w-16 h-16 rounded-2xl">
                {profile?.avatarUrl ? (
                  <AvatarImage src={profile.avatarUrl} alt="Avatar" className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-primary/10 rounded-2xl">
                  <User size={32} className="text-primary" />
                </AvatarFallback>
              </Avatar>
              <AvatarMenu 
                onAvatarChange={handleAvatarChange}
                isUploading={isUploading}
              />
            </div>
            <div>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-6 w-32 bg-muted rounded mb-1" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-foreground">{profile?.name || 'Пользователь'}</h2>
                    {!isSubLoading && hasActiveSubscription && activeSubscriptions[0]?.subscription_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {activeSubscriptions[0].subscription_name}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground">{profile?.phone || ''}</p>
                </>
              )}
            </div>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <Link to="/streaks" className="card-interactive text-center py-4">
              <p className="text-2xl font-black text-foreground">{stats.totalCups}</p>
              <p className="text-xs text-muted-foreground">Выпито</p>
            </Link>
            <div className="card-static text-center py-4">
              <p className="text-2xl font-black text-foreground">{stats.currentStreak}</p>
              <p className="text-xs text-muted-foreground">Дней подряд</p>
            </div>
            <Link to="/bonuses" className="card-interactive text-center py-4">
              <p className="text-2xl font-black text-foreground">{stats.bonusPoints}</p>
              <p className="text-xs text-muted-foreground">Бонусов</p>
            </Link>
          </div>
          
          {/* Purchase History Section */}
          <div style={{ animationDelay: '0.1s' }}>
            <PurchaseHistorySection />
          </div>
          
          {/* Theme toggle */}
          <div className="card-interactive flex items-center justify-between mb-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
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
          <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              
              if (item.type === 'notification') {
                return (
                  <div key={item.label} className="card-static flex items-center gap-3">
                    <Icon size={20} className="text-muted-foreground" />
                    <span className="flex-1 font-medium text-foreground">{item.label}</span>
                    <Switch 
                      checked={notificationsEnabled} 
                      onCheckedChange={handleNotificationToggle}
                    />
                  </div>
                );
              }
              
              if (item.type === 'support') {
                return (
                  <button 
                    key={item.label} 
                    onClick={handleSupportClick}
                    className="w-full card-interactive flex items-center gap-3"
                  >
                    <Icon size={20} className="text-muted-foreground" />
                    <span className="flex-1 font-medium text-foreground text-left">{item.label}</span>
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </button>
                );
              }
              
              if (item.type === 'rules') {
                return (
                  <ServiceRulesDialog key={item.label}>
                    <button type="button" className="w-full card-interactive flex items-center gap-3 text-left">
                      <Icon size={20} className="text-muted-foreground" />
                      <span className="flex-1 font-medium text-foreground">{item.label}</span>
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </button>
                  </ServiceRulesDialog>
                );
              }
              
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
            style={{ animationDelay: '0.25s' }}
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
