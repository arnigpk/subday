import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { User, MapPin, Bell, MessageCircle, FileText, LogOut, ChevronRight, Moon, Sun, Camera, Pencil, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceRulesDialog } from '@/components/auth/ServiceRulesDialog';
import { toast } from '@/components/ui/sonner';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { PurchaseHistorySection } from '@/components/profile/PurchaseHistorySection';


export default function ProfilePage() {
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  
  const { profile, stats, isLoading, updateAvatar, refetch } = useUserStatsContext();
  const { hasActiveSubscription, activeSubscriptions, isLoading: isSubLoading, refetch: refetchSubscription } = useSubscriptionStatus();
  
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetch(),
      refetchSubscription(),
    ]);
  }, [refetch, refetchSubscription]);
  
  
  // Sync edit name with profile
  useEffect(() => {
    if (profile?.name) {
      setEditName(profile.name);
    }
  }, [profile?.name]);

  const handleSaveName = async () => {
    if (!editName.trim()) {
      toast.error('Введите имя');
      return;
    }
    
    setIsSavingName(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('profiles')
        .update({ name: editName.trim() })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast.success('Имя сохранено!');
      setIsEditingName(false);
      refetch();
    } catch (error) {
      console.error('Error saving name:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelNameEdit = () => {
    setEditName(profile?.name || '');
    setIsEditingName(false);
  };

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
  
  const handleAvatarClick = () => {
    // Open avatar change dialog
    handleCameraClick();
  };

  const handleCameraClick = () => {
    setShowAvatarMenu(!showAvatarMenu);
  };
  
  const handleAvatarMenuSelect = () => {
    setShowAvatarMenu(false);
    avatarInputRef.current?.click();
  };
  
  const menuItems = [
    { icon: MapPin, label: 'Город', value: profile?.city || 'Атырау', type: 'static' as const },
    { icon: Bell, label: 'Уведомления', type: 'notification' as const },
    { icon: MessageCircle, label: 'Помощь/техподдержка', type: 'support' as const },
    { icon: FileText, label: 'Правила сервиса', type: 'rules' as const },
  ];
  
  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="safe-area-top">
          <div className="px-4 py-4">
            <h1 className="text-2xl font-black text-foreground mb-6">Профиль</h1>
          
          {/* Hidden file inputs */}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarChange(file);
              if (avatarInputRef.current) avatarInputRef.current.value = '';
            }}
          />

          {/* User card */}
          <div className="card-static flex items-center gap-4 mb-10 animate-slide-up">
            <div className="relative">
              <button 
                onClick={handleAvatarClick}
                className="block"
              >
                <Avatar className="w-16 h-16 rounded-full cursor-pointer hover:ring-2 hover:ring-accent transition-all">
                  {profile?.avatarUrl ? (
                    <AvatarImage src={profile.avatarUrl} alt="Avatar" className="object-cover" />
                  ) : null}
                  <AvatarFallback className="bg-primary/10">
                    <User size={32} className="text-primary" />
                  </AvatarFallback>
                </Avatar>
              </button>
              <div className="relative">
                <button
                  onClick={handleCameraClick}
                  disabled={isUploading}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                >
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera size={14} className="text-accent-foreground" />
                  )}
                </button>
                
                {showAvatarMenu && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-[100]" 
                      onClick={() => setShowAvatarMenu(false)} 
                    />
                    
                    {/* Dropdown Menu */}
                    <div className="absolute left-0 top-full mt-2 z-[101] bg-card border border-border rounded-xl shadow-lg p-1 animate-slide-up">
                      <button
                        onClick={handleAvatarMenuSelect}
                        className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Camera size={16} className="text-primary flex-shrink-0" />
                        <span className="font-medium">Поменять аватарку</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div>
              {isLoading ? (
                <div className="animate-pulse">
                  <div className="h-4 w-16 bg-muted rounded mb-1" />
                  <div className="h-6 w-32 bg-muted rounded mb-1" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
              ) : (
              <>
                  {!isSubLoading && hasActiveSubscription && activeSubscriptions[0]?.subscription_name && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mb-1">
                      {activeSubscriptions[0].subscription_name}
                    </span>
                  )}
                  {isEditingName ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Имя"
                        maxLength={50}
                        className="w-28 min-w-0 px-2 py-1 bg-secondary rounded-lg text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveName}
                        disabled={isSavingName}
                        className="p-1.5 bg-accent text-accent-foreground rounded-lg flex-shrink-0"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={handleCancelNameEdit}
                        className="p-1.5 bg-secondary text-foreground rounded-lg flex-shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 max-w-full">
                      <h2 className="text-xl font-bold text-foreground truncate max-w-[160px]">{profile?.name || 'Пользователь'}</h2>
                      <button
                        onClick={() => setIsEditingName(true)}
                        className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  )}
                  <p className="text-muted-foreground">
                    {profile?.phone?.startsWith('+telegram_') 
                      ? `ID: ${profile.phone.replace('+telegram_', '')}` 
                      : profile?.phone || ''}
                  </p>
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
      </PullToRefresh>
    </AppLayout>
  );
}
