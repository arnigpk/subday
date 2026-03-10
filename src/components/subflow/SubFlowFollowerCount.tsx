import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useLanguage } from '@/contexts/LanguageContext';

interface SubFlowFollowerCountProps {
  userId: string | null;
}

function pluralFollowers(count: number, lang: string): string {
  if (lang === 'kz') {
    return `Сізге ${count} адам жазылған`;
  }
  if (lang === 'en') {
    return `You have ${count} follower${count === 1 ? '' : 's'}`;
  }
  if (lang === 'uz') {
    return `Sizda ${count} ta obunachi bor`;
  }
  if (lang === 'kg') {
    return `Сизге ${count} адам жазылган`;
  }
  // ru
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'подписчиков';
  if (mod10 === 1 && mod100 !== 11) word = 'подписчик';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'подписчика';
  return `У вас ${count} ${word}`;
}

export function SubFlowFollowerCount({ userId }: SubFlowFollowerCountProps) {
  const [count, setCount] = useState<number>(0);
  const { language } = useLanguage();

  useEffect(() => {
    if (!userId) return;

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('subflow_follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);
      setCount(c || 0);
    };

    fetchCount();

    const channel = supabase
      .channel(`follower-count-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subflow_follows',
        filter: `following_id=eq.${userId}`,
      }, () => {
        fetchCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex items-center gap-1 px-2 py-2 rounded-full hover:bg-secondary transition-colors">
          <Users size={20} className="text-foreground" />
          <span className="text-xs font-semibold text-foreground">{count}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto px-4 py-3 text-sm text-foreground" align="end">
        {pluralFollowers(count, language)}
      </PopoverContent>
    </Popover>
  );
}
