import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';

interface PushNotification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  user_id: string | null;
}

const DISMISSED_KEY = 'push_dismissed_ids';

function getDismissedIds(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}

function saveDismissedIds(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

function SwipeableNotification({
  notification,
  isNew,
  formatDate,
  onDismiss,
}: {
  notification: PushNotification;
  isNew: boolean;
  formatDate: (d: string) => string;
  onDismiss: (id: string) => void;
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
    // Only allow swipe left
    currentX.current = Math.min(0, diff);
    elRef.current.style.transform = `translateX(${currentX.current}px)`;
    elRef.current.style.transition = 'none';
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
    if (!elRef.current) return;
    if (currentX.current < -80) {
      // Dismiss
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
      {/* Delete background */}
      <div className="absolute inset-0 flex items-center justify-end bg-destructive/90 px-4">
        <Trash2 size={18} className="text-destructive-foreground" />
      </div>
      <div
        ref={elRef}
        className={`relative px-4 py-3 transition-colors bg-background ${isNew ? 'bg-primary/5' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <p className="text-sm font-semibold text-foreground">{notification.title}</p>
        {notification.title !== notification.message && (
          <p className="text-sm text-foreground/80 mt-0.5">{notification.message}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(notification.created_at)}
          {notification.user_id === null && (
            <span className="ml-2 text-xs text-primary/60">📢</span>
          )}
        </p>
      </div>
    </div>
  );
}

export function PushNotificationsBell() {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('push_last_seen_at');
    if (stored) setLastSeenAt(stored);
    setDismissedIds(getDismissedIds());

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;

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
        if (newNotif.user_id === null || newNotif.user_id === userId) {
          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'push_notifications',
      }, (payload) => {
        const deletedId = (payload.old as any)?.id;
        if (deletedId) {
          setNotifications(prev => prev.filter(n => n.id !== deletedId));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id));

  const unreadCount = lastSeenAt
    ? visibleNotifications.filter(n => n.created_at > lastSeenAt).length
    : visibleNotifications.length;

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && visibleNotifications.length > 0) {
      const now = new Date().toISOString();
      setLastSeenAt(now);
      localStorage.setItem('push_last_seen_at', now);
    }
  };

  const handleDismissOne = (id: string) => {
    const newDismissed = new Set(dismissedIds);
    newDismissed.add(id);
    setDismissedIds(newDismissed);
    saveDismissedIds(newDismissed);
  };

  const handleClearAll = () => {
    const allIds = new Set(dismissedIds);
    visibleNotifications.forEach(n => allIds.add(n.id));
    setDismissedIds(allIds);
    saveDismissedIds(allIds);
    toast({ title: 'Уведомления очищены' });
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
        <SheetHeader className="px-4 pb-3 border-b border-border pt-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
          <div className="flex items-center justify-between">
            {visibleNotifications.length > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors"
                    title="Очистить все"
                  >
                    <Trash2 size={18} className="text-destructive" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Очистить уведомления?</AlertDialogTitle>
                    <AlertDialogDescription>Все уведомления будут удалены. Это действие нельзя отменить.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll}>Очистить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <div className="w-[30px]" />
            )}
            <SheetTitle className="text-lg font-bold flex-1 text-center">
              Уведомления и Обновления
            </SheetTitle>
            <div className="w-[30px]" />
          </div>
        </SheetHeader>
        <div className="overflow-y-auto max-h-[calc(100vh-80px)]">
          {visibleNotifications.length === 0 ? (
            <div className="text-center py-16">
              <Bell size={40} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">Пока нет уведомлений</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {visibleNotifications.map(n => {
                const isNew = lastSeenAt ? n.created_at > lastSeenAt : true;
                return (
                  <SwipeableNotification
                    key={n.id}
                    notification={n}
                    isNew={isNew}
                    formatDate={formatDate}
                    onDismiss={handleDismissOne}
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
