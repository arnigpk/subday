import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Coffee, Check, Bell, Loader2, MapPin, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Preorder {
  id: string;
  coffee_name: string;
  syrup: string | null;
  status: string;
  created_at: string;
  customer_name: string | null;
  customer_public_id: string | null;
  shop_address: string | null;
}

interface PartnerPreordersProps {
  shopId: string;
  /** If provided, only show preorders for this address (barista mode) */
  filterAddress?: string | null;
}

export function PartnerPreorders({ shopId, filterAddress }: PartnerPreordersProps) {
  const [preorders, setPreorders] = useState<Preorder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevCountRef = useRef(0);

  const fetchPreorders = useCallback(async () => {
    if (!shopId) return;
    try {
      let query = supabase
        .from('preorders')
        .select('id, coffee_name, syrup, status, created_at, user_id, shop_address')
        .eq('shop_id', shopId)
        .in('status', ['new', 'completed'])
        .order('created_at', { ascending: false })
        .limit(50);

      // Filter by address for baristas
      if (filterAddress) {
        query = query.eq('shop_address', filterAddress);
      }

      const { data, error } = await query;

      if (error) { console.error(error); return; }
      if (!data) { setPreorders([]); return; }

      const userIds = [...new Set(data.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, public_id')
        .in('user_id', userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const mapped = data.map(p => ({
        id: p.id,
        coffee_name: p.coffee_name,
        syrup: p.syrup,
        status: p.status,
        created_at: p.created_at,
        customer_name: profileMap.get(p.user_id)?.name || null,
        customer_public_id: profileMap.get(p.user_id)?.public_id || null,
        shop_address: p.shop_address || null,
      }));

      const newCount = mapped.filter(p => p.status === 'new').length;
      if (newCount > prevCountRef.current && prevCountRef.current > 0) {
        playNotificationSound();
      }
      prevCountRef.current = newCount;

      setPreorders(mapped);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, filterAddress]);

  const playNotificationSound = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJSPi4eCfn2CiZCRjYqIhYODhYmNkI+MiYeEgoKEiIuOj42LiYaEgoOFiIqMjYyLiYeGhIOFh4mLjIyLiomHhYSEhoiJi4yMi4qIh4WEhYaIiYuLi4uKiIeGhYWGh4mKi4uLioiHhoWFhoeIiYqLi4qJiIeGhYaHiImKi4qKiYiHhoWGh4iJiYqKioqIh4aGhoeIiYqKioqJiIeGhoaHiImJioqKiYiHhoaGh4iJiYqKiomIh4aGhoeIiImKioqJiIeGhoaHiIiJioqKiYiHhw==');
      }
      audioRef.current.play().catch(() => {});
    } catch {}
  };

  useEffect(() => {
    fetchPreorders();
    const channel = supabase
      .channel(`preorders-${shopId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'preorders',
        filter: `shop_id=eq.${shopId}`,
      }, () => fetchPreorders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [shopId, fetchPreorders]);

  const newPreorders = preorders.filter(p => p.status === 'new');
  const completedPreorders = preorders.filter(p => p.status === 'completed');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {newPreorders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-amber-500 animate-bounce" />
            <h3 className="font-bold text-foreground">Новые предзаказы ({newPreorders.length})</h3>
          </div>
          {newPreorders.map(p => (
            <PreorderCard key={p.id} preorder={p} isNew />
          ))}
        </div>
      )}

      {completedPreorders.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-muted-foreground text-sm">Выданные</h3>
          {completedPreorders.map(p => (
            <PreorderCard key={p.id} preorder={p} isNew={false} />
          ))}
        </div>
      )}

      {preorders.length === 0 && (
        <div className="text-center py-8">
          <Coffee size={32} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">Пока нет предзаказов</p>
        </div>
      )}
    </div>
  );
}

function PreorderCard({ preorder, isNew }: { preorder: Preorder; isNew: boolean }) {
  return (
    <div className={`bg-card p-4 rounded-xl border ${isNew ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'} transition-colors`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isNew ? 'bg-amber-500/10' : 'bg-accent/10'}`}>
            {isNew ? <Coffee size={20} className="text-amber-600" /> : <Check size={20} className="text-accent" />}
          </div>
          <div>
            <p className="font-semibold text-foreground">{preorder.customer_name || 'Клиент'}</p>
            {preorder.customer_public_id && (
              <p className="text-xs text-muted-foreground font-mono">ID: {preorder.customer_public_id}</p>
            )}
            <p className="text-sm text-primary font-medium">{preorder.coffee_name}</p>
            {preorder.syrup && <p className="text-xs text-muted-foreground">+ {preorder.syrup}</p>}
            {preorder.shop_address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin size={10} />{preorder.shop_address}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isNew ? 'bg-amber-500/10 text-amber-600' : 'bg-accent/10 text-accent'}`}>
            {isNew ? 'Новый' : 'Выдан'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {format(new Date(preorder.created_at), 'HH:mm', { locale: ru })}
          </p>
        </div>
      </div>
    </div>
  );
}
