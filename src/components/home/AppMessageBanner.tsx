import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserAudienceMatch } from '@/hooks/useUserAudienceMatch';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface AppMessage {
  id: string;
  content: string;
  audience_types: string[];
  frequency_type: string;
  daily_frequency: number;
  scheduled_at: string | null;
  is_active: boolean;
}

export function AppMessageBanner() {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const { matchesAudience, isLoading: audienceLoading } = useUserAudienceMatch();
  const trackedViewsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadMessages();

    // Realtime: remove deleted/deactivated messages instantly
    const channel = supabase
      .channel('app_messages_user')
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'app_messages' }, (payload) => {
        const deletedId = (payload.old as any)?.id;
        if (deletedId) {
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_messages' }, (payload) => {
        const updated = payload.new as any;
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
      supabase.from('app_messages').select('*').eq('is_active', true),
      supabase.from('app_message_dismissals').select('message_id, dismiss_date').eq('user_id', user.id),
    ]);

    const allMessages = (msgsRes.data || []) as AppMessage[];
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
      if (msg.scheduled_at && new Date(msg.scheduled_at) > now) return false;
      return true;
    });

    setMessages(visible);
  };

  // Track view when message becomes visible
  const trackView = async (messageId: string) => {
    if (!userId || trackedViewsRef.current.has(messageId)) return;
    trackedViewsRef.current.add(messageId);

    // Always log a general view
    supabase.from('app_message_views').insert({
      message_id: messageId,
      user_id: userId,
    }).then(() => {});

    // Try to log unique view (will fail silently on duplicate due to unique constraint)
    supabase.from('app_message_unique_views').insert({
      message_id: messageId,
      user_id: userId,
    }).then(() => {});
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

  if (audienceLoading) return null;

  const visibleMessages = messages.filter(
    msg => !dismissedIds.has(msg.id) && matchesAudience(msg.audience_types)
  );

  if (visibleMessages.length === 0) return null;

  const msg = visibleMessages[0];

  // Track view for visible message
  trackView(msg.id);

  return (
    <AnimatePresence>
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-[72px] left-3 right-3 z-40 max-w-lg mx-auto"
      >
        <div className="relative rounded-2xl border border-white/20 bg-card/90 backdrop-blur-xl shadow-lg px-4 py-3 pr-10">
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </p>
          <button
            onClick={() => handleDismiss(msg.id)}
            className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground"
            aria-label="Закрыть"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
