import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Bug, RefreshCw, Trash2, ChevronDown, ChevronRight, Smartphone, Globe } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface ErrorLog {
  id: string;
  created_at: string;
  section: string | null;
  message: string | null;
  stack: string | null;
  component_stack: string | null;
  url: string | null;
  user_agent: string | null;
  app_version: string | null;
  platform: string | null;
  user_id: string | null;
}

const PLATFORM_ICON: Record<string, typeof Globe> = { web: Globe, ios: Smartphone, android: Smartphone };

export default function AdminErrorsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setLogs((data as ErrorLog[]) || []);
    } catch (e) {
      console.error('Error fetching error logs:', e);
      toast({ title: 'Ошибка загрузки логов', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const clearAll = async () => {
    try {
      // gt по фиксированной дате — валидный фильтр, удаляет все строки.
      const { error } = await supabase.from('client_error_logs').delete().gt('created_at', '1970-01-01');
      if (error) throw error;
      toast({ title: 'Логи очищены' });
      fetchLogs();
    } catch (e) {
      console.error('Error clearing logs:', e);
      toast({ title: 'Ошибка очистки', variant: 'destructive' });
    }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  return (
    <AdminLayout title="Ошибки">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Клиентские ошибки за последнее время. Обновляется вручную.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          {logs.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Очистить
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Очистить все логи ошибок?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Это удалит все записи об ошибках. На работу приложения не влияет.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll}>Очистить</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-10 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Bug className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-semibold">Ошибок нет</p>
            <p className="text-sm text-muted-foreground mt-1">Чисто — приложение работает без сбоев.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const isOpen = expanded === log.id;
            const PIcon = PLATFORM_ICON[log.platform || 'web'] || Globe;
            return (
              <Card key={log.id} className="overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : log.id)}
                  className="w-full text-left p-4 flex items-start gap-3 hover:bg-secondary/40 transition-colors"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 mt-1 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">{log.section || '—'}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <PIcon className="w-3 h-3" />{log.platform || '—'}
                      </span>
                      {log.app_version && <span className="text-xs text-muted-foreground">v{log.app_version}</span>}
                      <span className="text-xs text-muted-foreground ml-auto">{fmt(log.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground mt-1 break-words">{log.message || '(без текста)'}</p>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 space-y-2 text-xs">
                    {log.url && <Detail label="URL" value={log.url} />}
                    {log.user_id && <Detail label="Пользователь" value={log.user_id} />}
                    {log.user_agent && <Detail label="User-Agent" value={log.user_agent} />}
                    {log.stack && <Pre label="Стек" value={log.stack} />}
                    {log.component_stack && <Pre label="Компоненты" value={log.component_stack} />}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground break-all font-mono">{value}</span>
    </div>
  );
}

function Pre({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1">{label}:</p>
      <pre className="bg-secondary/50 rounded-lg p-2 overflow-x-auto text-[11px] leading-relaxed whitespace-pre-wrap break-words">{value}</pre>
    </div>
  );
}
