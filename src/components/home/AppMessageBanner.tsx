import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserAudienceMatch } from '@/hooks/useUserAudienceMatch';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { TT } from '@/components/TT';
import { openWithDeepLink } from '@/utils/deepLinks';

interface AppMessage {
  id: string;
  content: string;
  title: string | null;
  media_type: string;          // none | emoji | image
  emoji: string | null;
  image_url: string | null;
  button_label: string | null;
  button_action: string;       // dismiss | shop | packages | external
  button_value: string | null;
  audience_types: string[];
  frequency_type: string;
  daily_frequency: number;
  scheduled_at: string | null;
  ends_at: string | null;
  display_style: string;       // banner | modal
  is_active: boolean;
}

export function AppMessageBanner() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const { matchesAudience, isLoading: audienceLoading } = useUserAudienceMatch();
  const trackedViewsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadMessages();

    // Realtime: remove deleted/deactivated messages instantly
    const channel = supabase
      .channel('app_messages_user-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'app_messages' }, (payload) => {
        const deletedId = (payload.old as { id?: string })?.id;
        if (deletedId) {
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_messages' }, (payload) => {
        const updated = payload.new as { id?: string; is_active?: boolean };
        if (updated && !updated.is_active) {
          setMessages(prev => prev.filter(m => m.id !== updated.id));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_messages' }, () => {
        loadMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadMessages = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const today = new Date().toISOString().split('T')[0];

    const [msgsRes, dismissRes] = await Promise.all([
      supabase.from('app_messages').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('app_message_dismissals').select('message_id, dismiss_date').eq('user_id', user.id),
    ]);

    const allMessages = (msgsRes.data || []) as unknown as AppMessage[];
    const dismissals = dismissRes.data || [];

    const dismissed = new Set<string>();
    for (const msg of allMessages) {
      const msgDismissals = dismissals.filter(d => d.message_id === msg.id);
      if (msg.frequency_type === 'once') {
        if (msgDismissals.length > 0) dismissed.add(msg.id);
      } else {
        const todayDismissals = msgDismissals.filter(d => d.dismiss_date === today).length;
        if (todayDismissals >= msg.daily_frequency) dismissed.add(msg.id);
      }
    }

    setDismissedIds(dismissed);

    const now = new Date();
    const visible = allMessages.filter(msg => {
      // Ещё не начался показ.
      if (msg.scheduled_at && new Date(msg.scheduled_at) > now) return false;
      // Показ уже закончился (дата окончания в прошлом).
      if (msg.ends_at && new Date(msg.ends_at) < now) return false;
      return true;
    });

    setMessages(visible);
  };

  // Track view when message becomes visible
  const trackView = (messageId: string) => {
    if (!userId || trackedViewsRef.current.has(messageId)) return;
    trackedViewsRef.current.add(messageId);

    supabase.from('app_message_views').insert({ message_id: messageId, user_id: userId }).then(() => {});
    // Unique view — упадёт тихо на дубле из-за unique-констрейнта.
    supabase.from('app_message_unique_views').insert({ message_id: messageId, user_id: userId }).then(() => {});
  };

  const handleDismiss = async (messageId: string) => {
    setDismissedIds(prev => new Set([...prev, messageId]));
    if (userId) {
      await supabase.from('app_message_dismissals').insert({
        message_id: messageId,
        user_id: userId,
        dismiss_date: new Date().toISOString().split('T')[0],
      });
    }
  };

  // Нажатие кнопки-действия: выполняем переход, затем закрываем (= засчитываем
  // как «закрыто», чтобы для разовых сообщений оно больше не всплывало).
  const handleAction = (msg: AppMessage) => {
    switch (msg.button_action) {
      case 'shop':
        if (msg.button_value) navigate(`/shops/${msg.button_value}`);
        break;
      case 'packages':
        navigate('/packages');
        break;
      case 'external':
        if (msg.button_value) openWithDeepLink(msg.button_value);
        break;
      // 'dismiss' — просто закрыть.
    }
    handleDismiss(msg.id);
  };

  if (audienceLoading) return null;

  const visibleMessages = messages.filter(
    msg => !dismissedIds.has(msg.id) && matchesAudience(msg.audience_types)
  );

  if (visibleMessages.length === 0) return null;

  const msg = visibleMessages[0];
  trackView(msg.id);

  const hasButton = !!(msg.button_label && msg.button_label.trim());
  const showImage = msg.media_type === 'image' && !!msg.image_url;
  const showEmoji = msg.media_type === 'emoji' && !!msg.emoji;

  // ───────────────────────── Модалка по центру ─────────────────────────────
  if (msg.display_style === 'modal') {
    return (
      <AnimatePresence>
        <motion.div
          key={`overlay-${msg.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
          onClick={() => handleDismiss(msg.id)}
        >
          <motion.div
            key={`card-${msg.id}`}
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-3xl bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Картинка сверху (если выбрана) */}
            {showImage && (
              <div className="relative w-full aspect-[16/10] bg-muted overflow-hidden rounded-t-3xl">
                <img src={msg.image_url!} alt="" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Кнопка закрытия — поверх картинки или в углу карточки */}
            <button
              onClick={() => handleDismiss(msg.id)}
              className={`absolute top-3 right-3 p-1.5 rounded-full transition-colors ${
                showImage ? 'bg-black/40 text-white hover:bg-black/60' : 'text-muted-foreground hover:bg-muted/60'
              }`}
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-6 pt-6 pb-6 flex flex-col items-center text-center">
              {/* Эмодзи в кружке (если выбрано и нет картинки) */}
              {showEmoji && !showImage && (
                <div className="mb-4 w-16 h-16 rounded-2xl bg-accent/15 flex items-center justify-center text-4xl leading-none">
                  {msg.emoji}
                </div>
              )}

              {msg.title && (
                <h3 className="text-xl font-bold text-foreground mb-2 leading-snug">
                  <TT text={msg.title} />
                </h3>
              )}

              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                <TT text={msg.content} />
              </p>

              {hasButton ? (
                <button
                  onClick={() => handleAction(msg)}
                  className="btn-accent mt-5 w-full h-11 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  {msg.button_label}
                </button>
              ) : (
                <button
                  onClick={() => handleDismiss(msg.id)}
                  className="mt-5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Понятно
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ─────────────────── Плашка снизу (совместимость + кнопка) ────────────────
  return (
    <AnimatePresence>
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed app-banner-above-nav left-3 right-3 z-40 max-w-lg mx-auto"
      >
        <div className="relative rounded-2xl border border-white/20 bg-card/90 backdrop-blur-xl shadow-lg px-4 py-3 pr-10">
          <div className="flex items-start gap-3">
            {showEmoji && <span className="text-2xl leading-none shrink-0">{msg.emoji}</span>}
            <div className="min-w-0 flex-1">
              {msg.title && <p className="text-sm font-bold text-foreground mb-0.5"><TT text={msg.title} /></p>}
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                <TT text={msg.content} />
              </p>
              {hasButton && (
                <button
                  onClick={() => handleAction(msg)}
                  className="mt-2 text-sm font-semibold text-accent hover:underline"
                >
                  {msg.button_label} →
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => handleDismiss(msg.id)}
            className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground"
            aria-label="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
