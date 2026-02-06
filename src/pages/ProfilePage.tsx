import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { User, MapPin, Bell, MessageCircle, FileText, LogOut, ChevronRight, Moon, Sun, Camera, Hash, Pencil, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceRulesDialog } from '@/components/auth/ServiceRulesDialog';
import { toast } from '@/components/ui/sonner';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { PurchaseHistorySection } from '@/components/profile/PurchaseHistorySection';
import { StoryViewer } from '@/components/stories/StoryViewer';

export default function ProfilePage() {
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingStory, setIsUploadingStory] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [userStories, setUserStories] = useState<any[]>([]);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nickname, setNickname] = useState('');
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const storyInputRef = useRef<HTMLInputElement>(null);
  
  const { profile, stats, isLoading, updateAvatar, refetch } = useUserStatsContext();
  const { hasActiveSubscription, activeSubscriptions, isLoading: isSubLoading } = useSubscriptionStatus();
  
  // Sync nickname state with profile
  useEffect(() => {
    if (profile?.subflowNickname) {
      setNickname(profile.subflowNickname);
    }
  }, [profile?.subflowNickname]);
  
  const handleSaveNickname = async () => {
    setIsSavingNickname(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('profiles')
        .update({ subflow_nickname: nickname.trim() || null })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      toast.success('Псевдоним сохранён!');
      setIsEditingNickname(false);
      refetch();
    } catch (error) {
      console.error('Error saving nickname:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setIsSavingNickname(false);
    }
  };
  
  const handleCancelNicknameEdit = () => {
    setNickname(profile?.subflowNickname || '');
    setIsEditingNickname(false);
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
  
  const handleStoryUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Выберите изображение');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Файл слишком большой (максимум 5МБ)');
      return;
    }

    setIsUploadingStory(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('subflow-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('subflow-images')
        .getPublicUrl(fileName);

      const { error: storyError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          image_url: publicUrl
        });

      if (storyError) throw storyError;

      toast.success('Сториз добавлен! 🎉');
    } catch (error) {
      console.error('Error uploading story:', error);
      toast.error('Ошибка загрузки сториз');
    } finally {
      setIsUploadingStory(false);
      if (storyInputRef.current) {
        storyInputRef.current.value = '';
      }
    }
  };

  const handleAvatarClick = () => {
    // Check subscription before allowing story upload
    if (!hasActiveSubscription) {
      toast.error('Приобретите пожалуйста подписку, что бы выкладывать сториз');
      return;
    }
    // Open file picker for story
    storyInputRef.current?.click();
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
          <input
            ref={storyInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleStoryUpload(file);
            }}
          />

          {/* User card */}
          <div className="card-static flex items-center gap-4 mb-10 animate-slide-up">
            <div className="relative">
              <button 
                onClick={handleAvatarClick}
                disabled={isUploadingStory}
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
                {isUploadingStory && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-full">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
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
                  <h2 className="text-xl font-bold text-foreground">{profile?.name || 'Пользователь'}</h2>
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
          
          {/* SubFlow Nickname */}
          <div className="card-static mb-3 animate-slide-up" style={{ animationDelay: '0.08s' }}>
            <div className="flex items-center gap-3">
              <Hash size={20} className="text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">Псевдоним #subFlow</p>
                {isEditingNickname ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Введите псевдоним..."
                      maxLength={30}
                      className="flex-1 px-2 py-1 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveNickname}
                      disabled={isSavingNickname}
                      className="p-1.5 bg-accent text-accent-foreground rounded-lg"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={handleCancelNicknameEdit}
                      className="p-1.5 bg-secondary text-foreground rounded-lg"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {profile?.subflowNickname || 'Не указан'}
                    </p>
                    <button
                      onClick={() => setIsEditingNickname(true)}
                      className="p-1 text-muted-foreground hover:text-primary"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
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
