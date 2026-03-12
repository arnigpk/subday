import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface PushNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  user_id: string | null;
}

export function PushNotificationsBell() {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('push_last_seen_at');
    if (stored) setLastSeenAt(stored);

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

    // Fetch notifications for this user OR broadcast (user_id IS NULL)
    const { data } = await supabase
      .from('push_notifications')
      .select('*')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(30);

    if (data) {
      setNotifications(data as PushNotification[]);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime for new push notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`push-notifs-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'push_notifications',
      }, (payload) => {
        const newNotif = payload.new as PushNotification;
        // Only add if it's for this user or broadcast
        if (newNotif.user_id === null || newNotif.user_id === userId) {
          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const unreadCount = lastSeenAt
    ? notifications.filter(n => n.created_at > lastSeenAt).length
    : notifications.length;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && notifications.length > 0) {
      const now = new Date().toISOString();
      setLastSeenAt(now);
      localStorage.setItem('push_last_seen_at', now);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd MMM в HH:mm', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  if (!userId) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-secondary transition-colors">
          <Bell size={22} className="text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <SheetTitle className="text-lg font-bold">Уведомления и Обновления</SheetTitle>
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
                const isNew = lastSeenAt ? n.created_at > lastSeenAt : true;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 transition-colors ${isNew ? 'bg-primary/5' : ''}`}
                  >
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    {n.title !== n.message && (
                      <p className="text-sm text-foreground/80 mt-0.5">{n.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(n.created_at)}
                      {n.user_id === null && (
                        <span className="ml-2 text-xs text-primary/60">📢</span>
                      )}
                    </p>
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
