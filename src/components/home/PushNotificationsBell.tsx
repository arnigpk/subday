import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as AlertContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertTitle,
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
const SWIPE_HINT_KEY = 'push_swipe_hint_shown';

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
  showSwipeHint,
  onHintDone,
}: {
  notification: PushNotification;
  isNew: boolean;
  formatDate: (d: string) => string;
  onDismiss: (id: string) => void;
  showSwipeHint?: boolean;
  onHintDone?: () => void;
}) {
  const startX = useRef(0);
  const currentX = useRef(0);
  const isDragging = useRef(false);
  const elRef = useRef<HTMLDivElement>(null);
  const hintPlayed = useRef(false);

  useEffect(() => {
    if (showSwipeHint && !hintPlayed.current && elRef.current) {
      hintPlayed.current = true;
      const el = elRef.current;
      const timer = setTimeout(() => {
        el.style.transition = 'transform 0.4s ease';
        el.style.transform = 'translateX(-60px)';
        setTimeout(() => {
          el.style.transition = 'transform 0.3s ease';
          el.style.transform = 'translateX(0)';
          onHintDone?.();
        }, 600);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showSwipeHint, onHintDone]);

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
        className={`relative px-4 py-3 bg-background ${isNew ? 'bg-primary/5' : ''}`}
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
  const [showHint, setShowHint] = useState(false);

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

  const handleOpen = () => {
    setOpen(true);
    if (visibleNotifications.length > 0) {
      const now = new Date().toISOString();
      setLastSeenAt(now);
      localStorage.setItem('push_last_seen_at', now);
    }
    // Check if swipe hint should be shown
    if (!localStorage.getItem(SWIPE_HINT_KEY)) {
      setShowHint(true);
    }
  };

  const handleHintDone = useCallback(() => {
    localStorage.setItem(SWIPE_HINT_KEY, '1');
    setShowHint(false);
  }, []);

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
    <>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-secondary transition-colors"
      >
        <Bell size={22} className="text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="px-4 py-3 border-b border-border/30 shrink-0 flex flex-row items-center justify-between space-y-0">
            {visibleNotifications.length > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors" title="Очистить все">
                    <Trash2 size={18} className="text-destructive" />
                  </button>
                </AlertDialogTrigger>
                <AlertContent>
                  <AlertDialogHeader>
                    <AlertTitle>Очистить уведомления?</AlertTitle>
                    <AlertDialogDescription>Все уведомления будут удалены. Это действие нельзя отменить.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll}>Очистить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertContent>
              </AlertDialog>
            ) : (
              <div className="w-[30px]" />
            )}
            <DialogTitle className="text-base font-bold text-foreground text-center flex-1">
              Уведомления и Обновления
            </DialogTitle>
            <div className="w-[30px]" />
          </DialogHeader>

          <div className="overflow-y-auto flex-1 overscroll-contain">
            {visibleNotifications.length === 0 ? (
              <div className="text-center py-16">
                <Bell size={40} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">Пока нет уведомлений</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {visibleNotifications.map((n, idx) => {
                  const isNew = lastSeenAt ? n.created_at > lastSeenAt : true;
                  const isLast = idx === visibleNotifications.length - 1;
                  return (
                    <SwipeableNotification
                      key={n.id}
                      notification={n}
                      isNew={isNew}
                      formatDate={formatDate}
                      onDismiss={handleDismissOne}
                      showSwipeHint={showHint && isLast}
                      onHintDone={handleHintDone}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}