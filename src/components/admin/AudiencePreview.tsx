import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserGroupIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';;
import { Button } from '@/components/ui/button';
import type { AudienceType } from './AudienceTypeSelector';

interface UserProfile {
  user_id: string;
  name: string | null;
  phone: string;
}

interface AudiencePreviewProps {
  audienceTypes: AudienceType[];
  /** 'push' shows all users, 'telegram' shows only telegram users */
  channel: 'push' | 'telegram';
}

export function AudiencePreview({ audienceTypes, channel }: AudiencePreviewProps) {
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [activeSubIds, setActiveSubIds] = useState<Set<string>>(new Set());
  const [expiringSoonIds, setExpiringSoonIds] = useState<Set<string>>(new Set());
  const [newUserIds, setNewUserIds] = useState<Set<string>>(new Set());
  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    fetchData();
  }, [channel]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch all profiles (paginate past 1000 limit)
      const fetchAllProfiles = async () => {
        const allResults: { user_id: string; name: string | null; phone: string }[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          let q = supabase.from('profiles').select('user_id, name, phone').order('name').range(from, from + pageSize - 1);
          if (channel === 'telegram') {
            q = q.like('phone', '+telegram_%');
          }
          const { data } = await q;
          if (!data || data.length === 0) break;
          allResults.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return allResults;
      };

      const [profiles, subsRes, expiringRes, newRes, recentActiveRes] = await Promise.all([
        fetchAllProfiles(),
        supabase.from('user_subscriptions').select('user_id').eq('is_active', true),
        supabase.from('user_subscriptions').select('user_id').eq('is_active', true).lte('expires_at', fiveDaysLater).gte('expires_at', now.toISOString()),
        supabase.from('profiles').select('user_id').gte('created_at', sevenDaysAgo),
        supabase.from('redemptions').select('user_id').gte('redeemed_at', thirtyDaysAgo),
      ]);

      setAllProfiles(profiles);
      const activeSet = new Set((subsRes.data || []).map(r => r.user_id));
      setActiveSubIds(activeSet);
      setExpiringSoonIds(new Set((expiringRes.data || []).map(r => r.user_id)));
      setNewUserIds(new Set((newRes.data || []).map(r => r.user_id)));

      const recentSet = new Set((recentActiveRes.data || []).map(r => r.user_id));
      setActiveUserIds(new Set([...recentSet, ...activeSet]));
    } catch (err) {
      console.error('Error fetching audience data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (audienceTypes.includes('all')) return allProfiles;

    return allProfiles.filter(user => {
      const uid = user.user_id;
      for (const t of audienceTypes) {
        if (t === 'subscribers' && activeSubIds.has(uid)) return true;
        if (t === 'no_subscription' && !activeSubIds.has(uid)) return true;
        if (t === 'expiring_soon' && expiringSoonIds.has(uid)) return true;
        if (t === 'new_users' && newUserIds.has(uid)) return true;
        if (t === 'inactive' && !activeUserIds.has(uid)) return true;
      }
      return false;
    });
  }, [allProfiles, audienceTypes, activeSubIds, expiringSoonIds, newUserIds, activeUserIds]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border border-border">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Загрузка аудитории...</span>
      </div>
    );
  }

  const formatPhone = (phone: string) => {
    if (phone.startsWith('+telegram_')) return `TG: ${phone.replace('+telegram_', '')}`;
    return phone;
  };

  return (
    <div className="p-3 bg-muted rounded-lg border border-border space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserGroupIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            Получателей: <Badge variant="secondary" className="ml-1">{filteredUsers.length}</Badge>
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowList(!showList)}
          className="h-7 px-2 text-xs"
        >
          {showList ? <ChevronUpIcon className="w-3 h-3 mr-1" /> : <ChevronDownIcon className="w-3 h-3 mr-1" />}
          {showList ? 'Скрыть' : 'Показать список'}
        </Button>
      </div>

      {showList && (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-1">
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">Нет пользователей в выбранной аудитории</p>
            ) : (
              filteredUsers.map(user => (
                <div key={user.user_id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-background/50">
                  <span className="font-medium truncate max-w-[60%]">{user.name || 'Без имени'}</span>
                  <span className="text-muted-foreground">{formatPhone(user.phone)}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
