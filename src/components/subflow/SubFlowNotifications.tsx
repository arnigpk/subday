import { useState, useEffect, useRef } from 'react';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { useVibration } from '@/hooks/useVibration';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { supabase } from '@/integrations/supabase/client';
import { Bell, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
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
}

export function SubFlowNotifications({ userId, onNavigateToPost }: SubFlowNotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const playNotificationSound = useNotificationSound();
  const { vibrate } = useVibration();
  const { settings: notifSettings } = useNotificationSettings();
  const initialLoadDone = useRef(false);

  const fetchNotifications = async () => {
    if (!userId) return;

    const { data: notifs } = await supabase
      .from('subflow_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!notifs) return;

    // Get actor profiles
    const actorIds = [...new Set(notifs.map(n => n.actor_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, name, avatar_url, subflow_nickname')
      .in('user_id', actorIds);

    const profileMap = new Map(
      (profiles || []).map(p => [p.user_id, p])
    );

    // Fetch post previews for notifications with post_id
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

  // Realtime for new notifications
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
          if (notifSettings.subflowSoundEnabled) playNotificationSound();
          if (notifSettings.vibrationEnabled) vibrate(2000);
        }
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
      default:
        return 'уведомление';
    }
  };

  const formatDate = (dateStr: string) => {
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
          <SheetTitle className="text-lg font-bold">Уведомления</SheetTitle>
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
                const isClickable = !!n.post_id && !!onNavigateToPost;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (isClickable) {
                        setOpen(false);
                        setTimeout(() => onNavigateToPost!(n.post_id!), 300);
                      }
                    }}
                    className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                      !n.is_read ? 'bg-primary/5' : ''
                    } ${isClickable ? 'cursor-pointer active:bg-secondary/80' : ''}`}
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarFallback className="bg-primary/10">
                        <User size={16} className="text-primary" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{n.actor_name}</span>{' '}
                        {getNotificationText(n)}
                      </p>
                      {n.post_preview && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate italic">
                          «{n.post_preview}»
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(n.created_at)}
                      </p>
                    </div>
                    {isClickable ? (
                      <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1.5" />
                    ) : !n.is_read ? (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
