import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { MapPin, RefreshCw, Navigation, User, Download } from 'lucide-react';
import { downloadCSV } from '@/utils/exportCSV';

interface GeoRow {
  id: string;
  user_id: string;
  shop_id: string;
  distance_meters: number | null;
  sent_at: string;
}

interface Enriched extends GeoRow {
  userName: string;
  userPublicId: string | null;
  shopName: string;
  shopAddress: string | null;
}

export default function AdminGeoNotificationsPage() {
  const [rows, setRows] = useState<Enriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopFilter, setShopFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: log, error } = await supabase
        .from('geo_notification_log')
        .select('id, user_id, shop_id, distance_meters, sent_at')
        .order('sent_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (log as GeoRow[]) || [];

      // Дотягиваем имена пользователей и кофеен отдельными запросами (как в истории).
      const userIds = [...new Set(list.map(r => r.user_id).filter(Boolean))];
      const shopIds = [...new Set(list.map(r => r.shop_id).filter(Boolean))];
      const [{ data: profiles }, { data: shops }] = await Promise.all([
        userIds.length
          ? supabase.from('public_profiles').select('user_id, name, public_id').in('user_id', userIds)
          : Promise.resolve({ data: [] as any[] }),
        shopIds.length
          ? supabase.from('shops').select('id, name, address').in('id', shopIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const pMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const sMap = new Map((shops || []).map((s: any) => [s.id, s]));

      setRows(list.map(r => ({
        ...r,
        userName: pMap.get(r.user_id)?.name || 'Неизвестный',
        userPublicId: pMap.get(r.user_id)?.public_id || null,
        shopName: sMap.get(r.shop_id)?.name || '—',
        shopAddress: sMap.get(r.shop_id)?.address || null,
      })));
    } catch (e) {
      console.error('Error fetching geo notifications:', e);
      toast({ title: 'Ошибка загрузки гео-уведомлений', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const shopOptions = useMemo(
    () => [...new Set(rows.map(r => r.shopName))].filter(n => n && n !== '—').sort(),
    [rows],
  );

  const filtered = useMemo(() => rows.filter(r => {
    if (shopFilter !== 'all' && r.shopName !== shopFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!(`${r.userName} ${r.userPublicId || ''} ${r.shopName}`.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [rows, shopFilter, search]);

  const uniqueUsers = useMemo(() => new Set(filtered.map(r => r.user_id)).size, [filtered]);

  const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <AdminLayout title="Гео-уведомления">
      <div className="max-w-4xl space-y-4">
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Кто из пользователей получал уведомление, проходя рядом с кофейней-партнёром.
            Показаны последние 500 событий. Уведомление приходит один раз при приближении.
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input placeholder="Поиск по имени, ID, кофейне…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={shopFilter} onValueChange={setShopFilter}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Кофейня" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все кофейни</SelectItem>
              {shopOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Обновить
          </Button>
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => downloadCSV(
              `гео_уведомления_${new Date().toISOString().slice(0, 10)}.csv`,
              ['Дата', 'Пользователь', 'ID', 'Кофейня', 'Адрес', 'Дистанция (м)'],
              filtered.map(r => [fmt(r.sent_at), r.userName, r.userPublicId || '', r.shopName, r.shopAddress || '', r.distance_meters ?? '']),
            )}>
              <Download className="w-4 h-4 mr-1.5" />CSV
            </Button>
          )}
        </div>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Событий: <b className="text-foreground">{filtered.length}</b></span>
          <span>Пользователей: <b className="text-foreground">{uniqueUsers}</b></span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Card key={i}><CardContent className="p-4"><div className="h-8 bg-muted animate-pulse rounded" /></CardContent></Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-10 text-center">
            <Navigation className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-semibold">Пока нет гео-уведомлений</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Navigation className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="inline-flex items-center gap-1 font-medium"><User className="w-3.5 h-3.5" />{r.userName}</span>
                      {r.userPublicId && <span className="text-xs text-muted-foreground font-mono ml-1">ID: {r.userPublicId}</span>}
                      <span className="text-muted-foreground"> — проходил рядом с </span>
                      <span className="inline-flex items-center gap-1 font-medium"><MapPin className="w-3.5 h-3.5" />{r.shopName}</span>
                    </p>
                    {r.shopAddress && <p className="text-xs text-muted-foreground truncate">{r.shopAddress}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {r.distance_meters != null && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary text-foreground">{r.distance_meters} м</span>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{fmt(r.sent_at)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
