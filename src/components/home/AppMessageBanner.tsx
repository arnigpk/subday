import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserAudienceMatch } from '@/hooks/useUserAudienceMatch';
import { X } from 'lucide-react';
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

  useEffect(() => {
    loadMessages();
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

    // Build dismissed set
    const dismissed = new Set<string>();
    for (const msg of allMessages) {
      const msgDismissals = dismissals.filter(d => d.message_id === msg.id);
      if (msg.frequency_type === 'once') {
        // If dismissed at all, hide forever
        if (msgDismissals.length > 0) dismissed.add(msg.id);
      } else {
        // Daily: count today's dismissals
        const todayDismissals = msgDismissals.filter(d => d.dismiss_date === today).length;
        if (todayDismissals >= msg.daily_frequency) dismissed.add(msg.id);
      }
    }

    setDismissedIds(dismissed);

    // Filter by schedule
    const now = new Date();
    const visible = allMessages.filter(msg => {
      if (msg.scheduled_at && new Date(msg.scheduled_at) > now) return false;
      return true;
    });

    setMessages(visible);
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

  // Show only the first matching message
  const msg = visibleMessages[0];

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
            <X className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
