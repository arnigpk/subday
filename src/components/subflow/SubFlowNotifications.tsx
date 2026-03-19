import { useState, useEffect, useRef } from 'react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useVibration } from '@/hooks/useVibration';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { supabase } from '@/integrations/supabase/client';
import { Bell, ChevronRight, Trash2, User } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface Notification {
  id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  reaction: string | null;
  is_read: boolean;
  created_at: string;
  actor_name: string;
  actor_avatar: string | null;
  post_preview: string | null;
}

interface SubFlowNotificationsProps {
  userId: string | null;
  onNavigateToPost?: (postId: string) => void;
  onOpenStory?: (storyId: string) => void;
}

function SwipeableSubFlowNotification({
  notification,
  isClickable,
  onDismiss,
  onClick,
  getNotificationText,
  formatDate,
}: {
  notification: Notification;
  isClickable: boolean;
  onDismiss: (id: string) => void;
  onClick: () => void;
  getNotificationText: (n: Notification) => string;
  formatDate: (d: string) => string;
}) {
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    isDragging.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !elRef.current) return;
    const diff = e.touches[0].clientX - startX.current;
    currentX.current = Math.min(0, diff);
    elRef.current.style.transform = `translateX(${currentX.current}px)`;
    elRef.current.style.transition = 'none';
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    if (!elRef.current) return;
    if (currentX.current < -80) {
      elRef.current.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      elRef.current.style.transform = 'translateX(-100%)';
      elRef.current.style.opacity = '0';
      setTimeout(() => onDismiss(notification.id), 300);
    } else {
      elRef.current.style.transition = 'transform 0.2s ease';
      elRef.current.style.transform = 'translateX(0)';
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end bg-destructive/90 px-4">
        <Trash2 size={18} className="text-destructive-foreground" />
      </div>
      <div
        ref={elRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onClick}
        className={`relative flex items-start gap-3 px-4 py-3 bg-background transition-colors ${
          !notification.is_read ? 'bg-primary/5' : ''
        } ${isClickable ? 'cursor-pointer active:bg-secondary/80' : ''}`}
      >
        <Avatar className="w-9 h-9 shrink-0">
          <AvatarFallback className="bg-primary/10">
            <User size={16} className="text-primary" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            <span className="font-semibold">{notification.actor_name}</span>{' '}
            {getNotificationText(notification)}
          </p>
          {notification.post_preview && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate italic">
              «{notification.post_preview}»
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(notification.created_at)}
          </p>
        </div>
        {isClickable ? (
          <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1.5" />
        ) : !notification.is_read ? (
          <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
        ) : null}
      </div>
    </div>
  );
}

export function SubFlowNotifications({ userId, onNavigateToPost, onOpenStory }: SubFlowNotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const playNotificationSound = useNotificationSound();
  const { vibrate } = useVibration();
  const { settings: notifSettings } = useNotificationSettings();
  const initialLoadDone = useRef(false);

  // Use refs to avoid stale closures in realtime callback
  const notifSettingsRef = useRef(notifSettings);
  notifSettingsRef.current = notifSettings;
  const playNotificationSoundRef = useRef(playNotificationSound);
  playNotificationSoundRef.current = playNotificationSound;
  const vibrateRef = useRef(vibrate);
  vibrateRef.current = vibrate;

  const fetchNotifications = async () => {
    if (!userId) return;

    const { data: notifs } = await supabase
      .from('subflow_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!notifs) return;

    const actorIds = [...new Set(notifs.map(n => n.actor_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, name, avatar_url, subflow_nickname')
      .in('user_id', actorIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    const postIds = [...new Set(notifs.filter(n => n.post_id).map(n => n.post_id!))];
    const { data: postsData } = postIds.length > 0
      ? await supabase.from('subflow_posts').select('id, content').in('id', postIds)
      : { data: [] };
    const postMap = new Map((postsData || []).map(p => [p.id, p.content]));

    const enriched: Notification[] = notifs.map(n => {
      const profile = profileMap.get(n.actor_id);
      const postContent = n.post_id ? postMap.get(n.post_id) : null;
      return {
        ...n,
        actor_name: profile?.subflow_nickname || profile?.name || 'Пользователь',
        actor_avatar: profile?.avatar_url || null,
        post_preview: postContent ? postContent.slice(0, 40) + (postContent.length > 40 ? '…' : '') : null,
      };
    });

    setNotifications(enriched);
    setUnreadCount(enriched.filter(n => !n.is_read).length);
  };

  useEffect(() => {
    fetchNotifications().then(() => { initialLoadDone.current = true; });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'subflow_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        if (initialLoadDone.current) {
          if (notifSettingsRef.current.subflowSoundEnabled) playNotificationSoundRef.current();
          if (notifSettingsRef.current.vibrationEnabled) vibrateRef.current(2000);
        }
        fetchNotifications();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'subflow_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        fetchNotifications();
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'subflow_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const markAllRead = async () => {
    if (!userId || unreadCount === 0) return;

    await supabase
      .from('subflow_notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0) {
      markAllRead();
    }
  };

  const handleDismissOne = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('subflow_notifications').delete().eq('id', id);
  };

  const handleClearAll = async () => {
    if (!userId || notifications.length === 0) return;
    setNotifications([]);
    setUnreadCount(0);
    await supabase.from('subflow_notifications').delete().eq('user_id', userId);
    toast({ title: 'Уведомления очищены' });
  };

  const getNotificationText = (n: Notification) => {
    switch (n.type) {
      case 'reaction':
        return `${n.reaction || '💚'} поставил(а) реакцию`;
      case 'new_post':
        return '📝 опубликовал(а) новый пост';
      case 'comment':
        return '💬 прокомментировал(а) пост';
      case 'follow':
        return '👥 подписался на вас';
      case 'story_like':
        return '❤️ понравилась ваша история';
      default:
        return 'уведомление';
    }
  };

  const formatDateStr = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd MMM в HH:mm', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <button className="relative group p-2.5 rounded-xl transition-all duration-300">
          <div className="relative">
            <Bell
              size={20}
              className={`text-primary transition-transform duration-300 group-hover:rotate-12 ${unreadCount > 0 ? 'animate-[swing_2s_ease-in-out_infinite]' : ''}`}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-2.5 -right-2.5 min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground text-[10px] font-bold px-1 shadow-[0_2px_8px_hsl(var(--destructive)/0.4)] animate-[pulse_2s_ease-in-out_infinite]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center relative">
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="absolute left-0 p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={18} />
              </button>
            )}
            <SheetTitle className="text-lg font-bold w-full text-center">Уведомления #subFlow</SheetTitle>
          </div>
        </SheetHeader>
        <div className="overflow-y-auto max-h-[calc(100vh-80px)]">
          {notifications.length === 0 ? (
            <div className="text-center py-16">
              <Bell size={40} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">Пока нет уведомлений</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => {
                const isStoryLike = n.type === 'story_like';
                const isClickable = isStoryLike
                  ? !!n.post_id && !!onOpenStory
                  : !!n.post_id && !!onNavigateToPost;
                return (
                  <SwipeableSubFlowNotification
                    key={n.id}
                    notification={n}
                    isClickable={isClickable}
                    onDismiss={handleDismissOne}
                    onClick={() => {
                      if (isStoryLike && n.post_id && onOpenStory) {
                        setOpen(false);
                        setTimeout(() => onOpenStory(n.post_id!), 300);
                      } else if (n.post_id && onNavigateToPost) {
                        setOpen(false);
                        setTimeout(() => onNavigateToPost(n.post_id!), 300);
                      }
                    }}
                    getNotificationText={getNotificationText}
                    formatDate={formatDateStr}
                  />
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
