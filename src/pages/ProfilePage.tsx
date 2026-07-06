import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link } from 'react-router-dom';
import { useVibration } from '@/hooks/useVibration';
import { AppLayout } from '@/components/layout/AppLayout';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { LiquidGlassHeader } from '@/components/layout/LiquidGlassHeader';
import logo from '@/assets/logo.png';
import { Camera, Pencil, Check, X, Copy, Trash2 } from 'lucide-react';
import { IconUser, IconMapPin, IconBell, IconMessageCircleUser, IconFileText, IconLogout, IconChevronRight, IconMoon, IconSun, IconVolume, IconDeviceMobile, IconDeviceMobileVibration, IconMapPinFilled, IconSnowflake, IconBan, IconBrandWhatsapp } from '@tabler/icons-react';
import { getBlockedUsers, unblockUser, type BlockedUser } from '@/lib/subflowModeration';
import { supabase } from '@/integrations/supabase/client';
import { ServiceRulesDialog } from '@/components/auth/ServiceRulesDialog';
import { toast } from '@/components/ui/sonner';
import { useUserStatsContext } from '@/contexts/UserStatsContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { PurchaseHistorySection } from '@/components/profile/PurchaseHistorySection';
import { GuestAccessSection } from '@/components/profile/GuestAccessSection';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CountryCityDialog } from '@/components/profile/CountryCityDialog';
import { getCountryFlag } from '@/utils/countries';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';

export default function ProfilePage() {
  const [isDark, setIsDark] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCityDialog, setShowCityDialog] = useState(false);
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [showUnfreezeDialog, setShowUnfreezeDialog] = useState(false);
  const [freezeDays, setFreezeDays] = useState(7);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  // Диалог «Помощь»: заблокированные пользователи + связь с поддержкой
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [showBlockedDialog, setShowBlockedDialog] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const { settings: notifSettings, update: updateNotifSettings, togglePush } = useNotificationSettings();
  const [geoNotifEnabled, setGeoNotifEnabled] = useState<boolean>(true);
  
  const { profile, stats, isLoading, updateAvatar, refetch } = useUserStatsContext();

  // Подгружаем тумблер гео-уведомлений из профиля
  useEffect(() => {
    if (profile && (profile as any).geoNotificationsEnabled !== undefined) {
      setGeoNotifEnabled((profile as any).geoNotificationsEnabled !== false);
    }
  }, [profile]);

  const handleGeoNotifToggle = async (enabled: boolean) => {
    setGeoNotifEnabled(enabled);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await (supabase.from('profiles') as any)
        .update({ geo_notifications_enabled: enabled })
        .eq('user_id', user.id);
      toast.success(enabled ? 'Гео-уведомления включены' : 'Гео-уведомления отключены');
      refetch();
    } catch (e) {
      console.error('geo toggle error', e);
      setGeoNotifEnabled(!enabled);
      toast.error('Не удалось сохранить');
    }
  };
  const { hasActiveSubscription, activeSubscriptions, isLoading: isSubLoading, refetch: refetchSubscription } = useSubscriptionStatus();
  const { vibrateShort, vibrateSuccess, vibrate } = useVibration();
  
  const handleRefresh = useCallback(async () => {
    await Promise.all([refetch(), refetchSubscription()]);
  }, [refetch, refetchSubscription]);

  useEffect(() => {
    if (profile?.name) setEditName(profile.name);
  }, [profile?.name]);

  const handleSaveName = async () => {
    if (!editName.trim()) { toast.error(t('profile.enterName')); return; }
    setIsSavingName(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('profiles').update({ name: editName.trim() }).eq('user_id', user.id);
      if (error) throw error;
      toast.success(t('profile.nameSaved'));
      vibrateSuccess();
      setIsEditingName(false);
      refetch();
    } catch (error) {
      console.error('Error saving name:', error);
      toast.error(t('profile.saveError'));
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelNameEdit = () => { setEditName(profile?.name || ''); setIsEditingName(false); };

  const handlePushToggle = async () => {
    const wasEnabled = notifSettings.pushEnabled;
    const result = await togglePush();
    if (result === 'granted') {
      toast.success(t('profile.notificationsEnabled'));
    } else if (result === 'blocked') {
      toast.error('Уведомления запрещены в настройках устройства. Включите их в настройках телефона.');
    } else if (result === 'denied') {
      toast.error('Разрешение на уведомления отклонено.');
    } else {
      // 'toggled' — пользователь выключил push
      toast.success(wasEnabled ? t('profile.notificationsDisabled') : t('profile.notificationsEnabled'));
    }
  };
  
  const handleSupportClick = () => window.open('https://api.whatsapp.com/send/?phone=77077000994', Capacitor.isNativePlatform() ? '_system' : '_blank');

  const openBlockedList = async () => {
    setShowSupportDialog(false);
    setShowBlockedDialog(true);
    setBlockedLoading(true);
    setBlockedUsers(await getBlockedUsers());
    setBlockedLoading(false);
  };

  const handleUnblock = async (blockedId: string) => {
    const ok = await unblockUser(blockedId);
    if (ok) {
      setBlockedUsers(prev => prev.filter(u => u.blocked_id !== blockedId));
      toast.success('Пользователь разблокирован');
    } else {
      toast.error('Не удалось разблокировать');
    }
  };

  const isFrozen = activeSubscriptions.some(s => s.is_frozen);
  const freezeUsed = activeSubscriptions.some(s => s.freeze_used);

  const handleFreeze = async () => {
    setFreezeLoading(true);
    try {
      const { data, error } = await supabase.rpc('freeze_subscription', { _days: freezeDays });
      const ok = !error && (data as any)?.success;
      if (!ok) {
        const code = (data as any)?.error;
        const map: Record<string, string> = {
          already_frozen: 'Подписка уже заморожена',
          freeze_already_used: 'Заморозку можно использовать один раз за подписку',
          no_active_subscription: 'Нет активной подписки',
          invalid_days: 'Некорректный срок заморозки',
        };
        toast.error(map[code] || 'Не удалось заморозить подписку');
        return;
      }
      toast.success(`Подписка заморожена на ${freezeDays} дней`);
      setShowFreezeDialog(false);
      await refetchSubscription();
    } catch (e) {
      console.error('Freeze error:', e);
      toast.error('Ошибка');
    } finally {
      setFreezeLoading(false);
    }
  };

  const handleUnfreeze = async () => {
    setFreezeLoading(true);
    try {
      const { data, error } = await supabase.rpc('unfreeze_subscription');
      const ok = !error && (data as any)?.success;
      if (!ok) {
        toast.error('Не удалось разморозить подписку');
        return;
      }
      toast.success('Подписка разморожена');
      setShowUnfreezeDialog(false);
      await refetchSubscription();
    } catch (e) {
      console.error('Unfreeze error:', e);
      toast.error('Ошибка');
    } finally {
      setFreezeLoading(false);
    }
  };
  
  const toggleTheme = () => { setIsDark(!isDark); document.documentElement.classList.toggle('dark'); };
  
  const handleAvatarChange = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error(t('profile.selectImage')); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error(t('profile.fileTooLarge')); return; }
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const success = await updateAvatar(publicUrl);
      if (success) { toast.success(t('profile.photoUpdated')); refetch(); }
      else throw new Error('Failed to update avatar');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error(t('profile.uploadError'));
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleAvatarClick = () => handleCameraClick();
  const handleCameraClick = () => setShowAvatarMenu(!showAvatarMenu);
  const handleAvatarMenuSelect = () => { setShowAvatarMenu(false); avatarInputRef.current?.click(); };

  const handleAvatarDelete = async () => {
    setShowAvatarMenu(false);
    if (!profile?.avatarUrl) return;
    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Best-effort: remove all files in user's avatar folder
      const { data: files } = await supabase.storage.from('avatars').list(user.id);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(paths);
      }

      const success = await updateAvatar(null);
      if (!success) throw new Error('update failed');
      toast.success(t('profile.photoUpdated'));
      vibrateShort();
      refetch();
    } catch (e) {
      console.error('Avatar delete error', e);
      toast.error(t('profile.uploadError'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmWord = t('profile.deleteWord');
    if (deleteConfirmText !== confirmWord) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      
      const response = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (response.error) throw response.error;
      const result = response.data;
      if (!result?.success) throw new Error(result?.error || 'Delete failed');
      
      toast.success(t('profile.deleteAccountSuccess'));
      vibrate();
      // Sign out locally after account deletion
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(t('profile.deleteAccountError'));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeleteConfirmText('');
    }
  };
  
  const menuItems = [
    { icon: IconMapPin, label: t('profile.city'), value: `${getCountryFlag(profile?.country)} ${profile?.city || 'Атырау'}`, type: 'city' as const },
    { icon: IconBell, label: t('profile.notifications'), type: 'notification' as const },
    { icon: IconMessageCircleUser, label: t('profile.support'), type: 'support' as const },
    ...(activeSubscriptions.length > 0 && (isFrozen || !freezeUsed)
      ? [{ icon: IconSnowflake, label: isFrozen ? 'Разморозить подписку' : 'Заморозить подписку', type: 'freeze' as const }]
      : []),
    { icon: IconFileText, label: t('profile.rules'), type: 'rules' as const },
  ];
  
  return (
    <AppLayout>
      <PullToRefresh onRefresh={handleRefresh}>
        <div>
          <LiquidGlassHeader>
            <div className="px-4 py-4 flex items-center justify-between">
              <h1 className="text-2xl font-black text-foreground">{t('profile.title')}</h1>
              <img src={logo} alt="subday" className="h-10 w-auto object-contain shrink-0" />
            </div>
          </LiquidGlassHeader>
          <div className="px-4 pt-2">
          
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAvatarChange(file); if (avatarInputRef.current) avatarInputRef.current.value = ''; }}
          />

          <div className="card-static flex items-center gap-4 mb-10 animate-slide-up">
            <div className="relative">
              <button onClick={handleAvatarClick} className="block">
                <Avatar className="w-16 h-16 rounded-full cursor-pointer hover:ring-2 hover:ring-accent transition-all">
                  {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt="Avatar" className="object-cover" /> : null}
                  <AvatarFallback className="bg-primary/10"><IconUser size={32} className="text-primary" /></AvatarFallback>
                </Avatar>
              </button>
              <div className="relative">
                <button onClick={handleCameraClick} disabled={isUploading}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-accent flex items-center justify-center shadow-lg transition-transform hover:scale-110">
                  {isUploading ? <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" /> : <Camera size={14} className="text-accent-foreground" />}
                </button>
                {showAvatarMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowAvatarMenu(false)} />
                    <div className="absolute left-0 top-full mt-2 z-[101] bg-background/75 backdrop-blur-xl border border-border/40 rounded-xl shadow-[0_8px_32px_hsl(var(--foreground)/0.1),inset_0_1px_0_hsl(var(--background)/0.5)] p-1 animate-slide-up min-w-[180px]">
                      <button onClick={handleAvatarMenuSelect}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-secondary rounded-lg transition-colors whitespace-nowrap">
                        <Camera size={16} className="text-primary flex-shrink-0" />
                        <span className="font-medium">{t('profile.changeAvatar')}</span>
                      </button>
                      {profile?.avatarUrl && (
                        <button onClick={handleAvatarDelete} disabled={isUploading}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50">
                          <Trash2 size={16} className="text-destructive flex-shrink-0" />
                          <span className="font-medium">{t('profile.deleteAvatar')}</span>
                        </button>
                      )}
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
                {!isSubLoading && hasActiveSubscription && (() => {
                  const hasCoffee = activeSubscriptions.some(s => s.subscription_type === 'coffee');
                  const hasLunch = activeSubscriptions.some(s => s.subscription_type === 'drinks');
                  const hasBoth = hasCoffee && hasLunch;
                  const label = hasBoth ? 'subday Combo🚀' : activeSubscriptions[0]?.subscription_name || 'subday';
                  return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary mb-1">
                      {label}
                    </span>
                  );
                })()}
                {isEditingName ? (
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={t('profile.enterName')} maxLength={50}
                      className="w-28 min-w-0 px-2 py-1 bg-secondary rounded-lg text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      autoFocus />
                    <button onClick={handleSaveName} disabled={isSavingName} className="p-1.5 bg-accent text-accent-foreground rounded-lg flex-shrink-0"><Check size={14} /></button>
                    <button onClick={handleCancelNameEdit} className="p-1.5 bg-secondary text-foreground rounded-lg flex-shrink-0"><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 max-w-full">
                    <h2 className="text-xl font-bold text-foreground truncate max-w-[140px]">{profile?.name || t('profile.user')}</h2>
                    <button onClick={() => setIsEditingName(true)} className="p-1 text-muted-foreground hover:text-primary transition-colors"><Pencil size={14} /></button>
                    <button onClick={() => setShowDeleteDialog(true)} className="p-1 text-destructive/60 hover:text-destructive transition-colors"><Trash2 size={14} /></button>
                  </div>
                )}
                <button onClick={() => {
                  const value = profile?.publicId || '';
                  if (value) { navigator.clipboard.writeText(value); toast.success(t('profile.copied')); vibrateShort(); }
                }} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                  <span>ID: {profile?.publicId || '...'}</span>
                  <Copy size={12} className="flex-shrink-0" />
                </button>
              </>
              )}
            </div>
          </div>
          
          
          
          <div style={{ animationDelay: '0.1s' }}><PurchaseHistorySection /></div>

          <div className="mb-3"><GuestAccessSection /></div>

          <div className="card-interactive flex items-center justify-between mb-3 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <div className="flex items-center gap-3">
              {isDark ? <IconMoon size={20} className="text-muted-foreground" /> : <IconSun size={20} className="text-muted-foreground" />}
              <span className="font-medium text-foreground">{t('profile.theme')} {isDark ? t('profile.espresso') : t('profile.latte')}</span>
            </div>
            <button onClick={toggleTheme} className="w-12 h-7 rounded-full backdrop-blur-lg border border-border/40 flex items-center p-1 transition-all" style={{ background: 'hsl(var(--background) / 0.5)', boxShadow: 'inset 0 1px 2px hsl(var(--foreground) / 0.06)' }}>
              <div className={`w-5 h-5 rounded-full bg-accent/90 backdrop-blur-sm shadow-[0_1px_3px_hsl(var(--foreground)/0.1)] transition-all ${isDark ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          
          <div className="space-y-2 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              if (item.type === 'notification') {
                return (
                  <button key={item.label} onClick={() => setShowNotificationSettings(true)} className="w-full card-interactive flex items-center gap-3">
                    <Icon size={20} className="text-muted-foreground" />
                    <span className="flex-1 font-medium text-foreground text-left">{item.label}</span>
                    <IconChevronRight size={18} className="text-muted-foreground" />
                  </button>
                );
              }
              if (item.type === 'support') {
                return (
                  <button key={item.label} onClick={() => setShowSupportDialog(true)} className="w-full card-interactive flex items-center gap-3">
                    <Icon size={20} className="text-muted-foreground" />
                    <span className="flex-1 font-medium text-foreground text-left">{item.label}</span>
                    <IconChevronRight size={18} className="text-muted-foreground" />
                  </button>
                );
              }
              if (item.type === 'freeze') {
                return (
                  <button key={item.label} onClick={() => (isFrozen ? setShowUnfreezeDialog(true) : setShowFreezeDialog(true))} className="w-full card-interactive flex items-center gap-3">
                    <Icon size={20} className={isFrozen ? 'text-primary' : 'text-muted-foreground'} />
                    <span className="flex-1 font-medium text-foreground text-left">{item.label}</span>
                    <IconChevronRight size={18} className="text-muted-foreground" />
                  </button>
                );
              }
              if (item.type === 'rules') {
                return (
                  <ServiceRulesDialog key={item.label}>
                    <button type="button" className="w-full card-interactive flex items-center gap-3 text-left">
                      <Icon size={20} className="text-muted-foreground" />
                      <span className="flex-1 font-medium text-foreground">{item.label}</span>
                      <IconChevronRight size={18} className="text-muted-foreground" />
                    </button>
                  </ServiceRulesDialog>
                );
              }
              if (item.type === 'city') {
                return (
                  <button key={item.label} onClick={() => setShowCityDialog(true)} className="w-full card-interactive flex items-center gap-3">
                    <Icon size={20} className="text-muted-foreground" />
                    <span className="flex-1 font-medium text-foreground text-left">{item.label}</span>
                    {item.value && <span className="text-sm text-muted-foreground">{item.value}</span>}
                    <IconChevronRight size={18} className="text-muted-foreground" />
                  </button>
                );
              }
              return null;
            })}
          </div>
          
          <button 
            onClick={async () => {
              setIsLoggingOut(true);
              const { error } = await supabase.auth.signOut();
              if (error) { toast.error(t('profile.logoutError')); setIsLoggingOut(false); }
              else { vibrate(); toast.success(t('profile.goodbye')); }
            }}
            disabled={isLoggingOut}
            className="w-full mt-6 card-interactive flex items-center gap-3 text-destructive animate-slide-up disabled:opacity-50" 
            style={{ animationDelay: '0.25s' }}
          >
            <IconLogout size={20} />
            <span className="font-medium">{isLoggingOut ? t('profile.loggingOut') : t('profile.logout')}</span>
          </button>
          
          
          <Dialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteConfirmText(''); }}>
            <DialogContent className="max-w-sm p-0">
              <DialogHeader className="p-5 pb-0">
                <DialogTitle className="text-lg font-bold text-destructive flex items-center gap-2">
                  <Trash2 size={20} />
                  {t('profile.deleteAccountTitle')}
                </DialogTitle>
              </DialogHeader>
              <div className="px-5 pb-5 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('profile.deleteAccountWarning')}
                </p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{t('profile.typeDeleteToConfirm')}</label>
                  <input 
                    type="text" 
                    value={deleteConfirmText} 
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={t('profile.deleteWord')}
                    className="w-full px-3 py-2.5 bg-secondary rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50 transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(''); }}
                    disabled={isDeleting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-secondary text-foreground transition-colors hover:bg-secondary/80"
                  >
                    {t('profile.deleteAccountCancel')}
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={isDeleting || deleteConfirmText !== t('profile.deleteWord')}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground disabled:opacity-40 transition-all"
                  >
                    {isDeleting ? t('profile.deleteAccountDeleting') : t('profile.deleteAccountConfirm')}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <CountryCityDialog
            open={showCityDialog}
            onOpenChange={setShowCityDialog}
            currentCountry={profile?.country || 'KZ'}
            currentCity={profile?.city || null}
            onSaved={refetch}
          />

          {/* Notification Settings Dialog */}
          <Dialog open={showNotificationSettings} onOpenChange={setShowNotificationSettings}>
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <IconBell size={20} className="text-primary" />
                  {t('profile.notifications')}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Push notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconDeviceMobile size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Push-уведомления</p>
                      <p className="text-xs text-muted-foreground">Системные уведомления</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifSettings.pushEnabled}
                    onCheckedChange={handlePushToggle}
                  />
                </div>

                {/* SubFlow sound */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center">
                      <IconVolume size={18} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Звук #subFlow</p>
                      <p className="text-xs text-muted-foreground">Звук при новых уведомлениях</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifSettings.subflowSoundEnabled}
                    onCheckedChange={(v) => updateNotifSettings({ subflowSoundEnabled: v })}
                  />
                </div>

                {/* Vibration */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
                      <IconDeviceMobileVibration size={18} className="text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Вибрация</p>
                      <p className="text-xs text-muted-foreground">Вибрация при уведомлениях</p>
                    </div>
                  </div>
                  <Switch
                    checked={notifSettings.vibrationEnabled}
                    onCheckedChange={(v) => updateNotifSettings({ vibrationEnabled: v })}
                  />
                </div>

                {/* Geo notifications */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconMapPinFilled size={18} className="text-primary" />
                    </div>
                    <div className="pr-2">
                      <p className="text-sm font-semibold text-foreground">Кофейни рядом</p>
                      <p className="text-xs text-muted-foreground">Push, когда вы рядом с кофейней</p>
                    </div>
                  </div>
                  <Switch
                    checked={geoNotifEnabled}
                    onCheckedChange={handleGeoNotifToggle}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Support dialog: заблокированные пользователи + связь с поддержкой */}
          <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <IconMessageCircleUser size={20} className="text-primary" /> {t('profile.support')}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2.5">
                <button
                  onClick={openBlockedList}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-muted hover:bg-muted/70 transition-colors text-left"
                >
                  <IconBan size={20} className="text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">Заблокированные</p>
                    <p className="text-xs text-muted-foreground">Пользователи, которых вы заблокировали в #subFlow</p>
                  </div>
                  <IconChevronRight size={18} className="text-muted-foreground shrink-0" />
                </button>
                <button
                  onClick={() => { setShowSupportDialog(false); handleSupportClick(); }}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 transition-colors text-left"
                >
                  <IconBrandWhatsapp size={20} className="text-[#25D366] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground">Обратиться в поддержку</p>
                    <p className="text-xs text-muted-foreground">Напишите нам в WhatsApp — ответим быстро</p>
                  </div>
                  <IconChevronRight size={18} className="text-muted-foreground shrink-0" />
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Blocked users dialog */}
          <Dialog open={showBlockedDialog} onOpenChange={setShowBlockedDialog}>
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <IconBan size={20} className="text-destructive" /> Заблокированные
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {blockedLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : blockedUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Вы никого не блокировали
                  </p>
                ) : (
                  blockedUsers.map((u) => (
                    <div key={u.blocked_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted">
                      <Avatar className="w-9 h-9 shrink-0">
                        {u.avatar_url && <AvatarImage src={u.avatar_url} />}
                        <AvatarFallback className="text-xs">{(u.name || '?').charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 min-w-0 font-medium text-foreground truncate">{u.name || 'Пользователь'}</span>
                      <button
                        onClick={() => handleUnblock(u.blocked_id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-xs font-semibold text-foreground transition-colors"
                      >
                        Разблокировать
                      </button>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Freeze subscription dialog */}
          <Dialog open={showFreezeDialog} onOpenChange={setShowFreezeDialog}>
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <IconSnowflake size={20} className="text-primary" /> Заморозить подписку
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  На время заморозки подписка приостановлена, а срок её действия продлевается на выбранное количество дней.
                </p>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Срок заморозки</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[7, 10, 14].map(d => (
                      <button
                        key={d}
                        onClick={() => setFreezeDays(d)}
                        className={`py-3 rounded-xl font-bold transition border ${freezeDays === d ? 'bg-primary/10 border-primary text-primary' : 'bg-muted border-transparent text-foreground'}`}
                      >
                        {d} дней
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleFreeze}
                  disabled={freezeLoading}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
                >
                  {freezeLoading ? 'Замораживаем…' : 'Заморозить'}
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Unfreeze confirmation dialog */}
          <Dialog open={showUnfreezeDialog} onOpenChange={setShowUnfreezeDialog}>
            <DialogContent className="max-w-sm rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">Разморозить подписку прямо сейчас?</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Подписка снова станет активной ровно на тот срок, что оставался на момент заморозки.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowUnfreezeDialog(false)}
                    className="flex-1 py-3 rounded-xl bg-muted font-bold text-foreground"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={handleUnfreeze}
                    disabled={freezeLoading}
                    className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
                  >
                    {freezeLoading ? '…' : 'Да'}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <p className="text-center text-[10px] sm:text-xs text-muted-foreground mt-8 mb-4 px-4 leading-relaxed">
            ТОО &ldquo;Subday Group&rdquo;
            <br className="sm:hidden" />
            {' - '}Все права защищены
          </p>
        </div>
      </div>
      </PullToRefresh>
    </AppLayout>
  );
}
