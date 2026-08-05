import { useEffect, useState, useCallback, useMemo } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Flag, RefreshCw, Trash2, Ban, Check, X, User, FileText, MessageSquare, Image as ImageIcon } from 'lucide-react';

// Модерация UGC #subFlow (App Store 1.2): разбор жалоб на посты/комментарии/пользователей.
// Действия: удалить пост (каскадом удалит комменты/реакции), заблокировать автора,
// отметить разобранной / отклонить. Работает на существующих admin-RLS (без правок БД).

interface Report {
  id: string;
  reporter_id: string;
  target_type: string;          // 'post' | 'comment' | 'user'
  target_id: string | null;     // id поста/коммента
  target_user_id: string | null;// автор контента
  reason: string | null;
  status: string;
  created_at: string;
}
interface Prof { user_id: string; name: string | null; subflow_nickname: string | null; public_id: string | null; is_blocked: boolean }
interface Post { id: string; content: string | null; image_url: string | null; image_urls: string[] | null; user_id: string }

export default function AdminModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [profs, setProfs] = useState<Record<string, Prof>>({});
  const [posts, setPosts] = useState<Record<string, Post>>({});
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('subflow_reports').select('*').order('created_at', { ascending: false }).limit(300);
      if (!showResolved) q = q.eq('status', 'pending');
      const { data: rows, error } = await q;
      if (error) throw error;
      const list = (rows as Report[]) || [];
      setReports(list);

      const userIds = [...new Set(list.flatMap(r => [r.reporter_id, r.target_user_id]).filter(Boolean) as string[])];
      const postIds = [...new Set(list.filter(r => r.target_type === 'post' && r.target_id).map(r => r.target_id as string))];
      const [{ data: pf }, { data: ps }] = await Promise.all([
        userIds.length ? supabase.from('profiles').select('user_id, name, subflow_nickname, public_id, is_blocked').in('user_id', userIds) : Promise.resolve({ data: [] as any[] }),
        postIds.length ? supabase.from('subflow_posts').select('id, content, image_url, image_urls, user_id').in('id', postIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      setProfs(Object.fromEntries((pf || []).map((p: any) => [p.user_id, p])));
      setPosts(Object.fromEntries((ps || []).map((p: any) => [p.id, p])));
    } catch (e) {
      console.error('moderation fetch error:', e);
      toast({ title: 'Ошибка загрузки жалоб', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const nameOf = useCallback((uid: string | null) => {
    if (!uid) return '—';
    const p = profs[uid];
    const nm = p?.subflow_nickname || p?.name || 'Пользователь';
    return p?.public_id ? `${nm} (id${p.public_id})` : nm;
  }, [profs]);

  const setStatus = async (ids: string[], status: 'resolved' | 'dismissed') => {
    const { error } = await supabase.from('subflow_reports').update({ status }).in('id', ids);
    if (error) throw error;
  };

  const resolveOne = async (r: Report, status: 'resolved' | 'dismissed') => {
    setBusy(r.id);
    try { await setStatus([r.id], status); toast({ title: status === 'resolved' ? 'Отмечено разобранным' : 'Жалоба отклонена' }); await fetchReports(); }
    catch (e: any) { toast({ title: 'Ошибка: ' + e.message, variant: 'destructive' }); } finally { setBusy(null); }
  };

  const deletePost = async (r: Report) => {
    if (!r.target_id) return;
    if (!confirm('Удалить пост? Он исчезнет у всех, вместе с комментариями и реакциями. Действие необратимо.')) return;
    setBusy(r.id);
    try {
      const { error } = await supabase.from('subflow_posts').delete().eq('id', r.target_id);
      if (error) throw error;
      // Все жалобы на этот пост считаем разобранными.
      const related = reports.filter(x => x.target_type === 'post' && x.target_id === r.target_id && x.status === 'pending').map(x => x.id);
      if (related.length) await setStatus(related, 'resolved');
      toast({ title: 'Пост удалён, жалобы закрыты' });
      await fetchReports();
    } catch (e: any) { toast({ title: 'Не удалось удалить: ' + e.message, variant: 'destructive' }); } finally { setBusy(null); }
  };

  const blockAuthor = async (r: Report) => {
    if (!r.target_user_id) return;
    if (!confirm(`Заблокировать пользователя ${nameOf(r.target_user_id)}? Он потеряет доступ.`)) return;
    setBusy(r.id);
    try {
      const { error } = await supabase.from('profiles').update({ is_blocked: true }).eq('user_id', r.target_user_id);
      if (error) throw error;
      // Закрываем все жалобы на этого пользователя.
      const related = reports.filter(x => x.target_user_id === r.target_user_id && x.status === 'pending').map(x => x.id);
      if (related.length) await setStatus(related, 'resolved');
      toast({ title: 'Пользователь заблокирован, жалобы закрыты' });
      await fetchReports();
    } catch (e: any) { toast({ title: 'Не удалось заблокировать: ' + e.message, variant: 'destructive' }); } finally { setBusy(null); }
  };

  const pendingCount = useMemo(() => reports.filter(r => r.status === 'pending').length, [reports]);
  const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const TypeIcon = ({ t }: { t: string }) => t === 'post' ? <FileText className="w-4 h-4" /> : t === 'comment' ? <MessageSquare className="w-4 h-4" /> : <User className="w-4 h-4" />;

  return (
    <AdminLayout title="Модерация #subFlow">
      <div className="max-w-3xl space-y-4">
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Жалобы на контент и пользователей (App Store 1.2 — реагируем в течение 24 ч). Удаление поста убирает его у всех вместе с комментариями и реакциями. Блокировка автора закрывает все жалобы на него.
          </CardContent>
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm">На разборе: <b className="text-foreground">{pendingCount}</b></span>
          <div className="flex-1" />
          <Button variant={showResolved ? 'default' : 'outline'} size="sm" onClick={() => setShowResolved(v => !v)}>
            {showResolved ? 'Показаны все' : 'Показать разобранные'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchReports} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Обновить
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Card key={i}><CardContent className="p-4"><div className="h-14 bg-muted animate-pulse rounded" /></CardContent></Card>)}</div>
        ) : reports.length === 0 ? (
          <Card><CardContent className="p-10 text-center">
            <Flag className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-semibold">Жалоб нет</p>
            <p className="text-xs text-muted-foreground mt-1">Всё разобрано 🎉</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {reports.map(r => {
              const post = r.target_id ? posts[r.target_id] : null;
              const authorBlocked = r.target_user_id ? profs[r.target_user_id]?.is_blocked : false;
              const hasImg = post ? (!!post.image_url || (Array.isArray(post.image_urls) && post.image_urls.length > 0)) : false;
              const isPending = r.status === 'pending';
              return (
                <Card key={r.id} className={isPending ? '' : 'opacity-60'}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full bg-secondary">
                        <TypeIcon t={r.target_type} />
                        {r.target_type === 'post' ? 'Пост' : r.target_type === 'comment' ? 'Комментарий' : 'Пользователь'}
                      </span>
                      {!isPending && <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{r.status === 'resolved' ? 'разобрано' : 'отклонено'}</span>}
                      {authorBlocked && <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">автор заблокирован</span>}
                      <span className="text-xs text-muted-foreground ml-auto">{fmt(r.created_at)}</span>
                    </div>

                    <div className="text-sm space-y-0.5">
                      <p><span className="text-muted-foreground">Пожаловался:</span> {nameOf(r.reporter_id)}</p>
                      {r.target_user_id && <p><span className="text-muted-foreground">Автор:</span> {nameOf(r.target_user_id)}</p>}
                      {r.reason && <p><span className="text-muted-foreground">Причина:</span> {r.reason}</p>}
                    </div>

                    {r.target_type === 'post' && (
                      <div className="rounded-lg bg-muted/50 p-3 text-sm">
                        {!post ? <span className="text-muted-foreground italic">Пост не найден (уже удалён)</span> : (
                          <>
                            {post.content && <p className="text-foreground whitespace-pre-wrap break-words">{post.content}</p>}
                            {hasImg && <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />есть изображение</p>}
                            {!post.content && !hasImg && <span className="text-muted-foreground italic">пустой пост</span>}
                          </>
                        )}
                      </div>
                    )}

                    {isPending && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {r.target_type === 'post' && post && (
                          <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => deletePost(r)} disabled={busy === r.id}>
                            <Trash2 className="w-4 h-4 mr-1.5" />Удалить пост
                          </Button>
                        )}
                        {r.target_user_id && !authorBlocked && (
                          <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => blockAuthor(r)} disabled={busy === r.id}>
                            <Ban className="w-4 h-4 mr-1.5" />Заблокировать автора
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => resolveOne(r, 'resolved')} disabled={busy === r.id}>
                          <Check className="w-4 h-4 mr-1.5" />Разобрано
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => resolveOne(r, 'dismissed')} disabled={busy === r.id}>
                          <X className="w-4 h-4 mr-1.5" />Отклонить
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
