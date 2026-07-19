import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Потолок рекламы на пользователя поверх лимитов отдельных объявлений —
 * чтобы пять разных кампаний не выдали пять реклам подряд «по правилам».
 * Настройка общая для баннеров и SubFlow.
 */
export function AdsGlobalCapsCard() {
  const [perDay, setPerDay] = useState(0);
  const [perSession, setPerSession] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    supabase.from('ads_settings').select('max_ads_per_day, max_ads_per_session').maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPerDay(data.max_ads_per_day || 0);
          setPerSession(data.max_ads_per_session || 0);
        }
        setIsLoading(false);
      });
  }, []);

  const save = async () => {
    setIsSaving(true);
    const { error } = await supabase
      .from('ads_settings')
      .update({
        max_ads_per_day: perDay,
        max_ads_per_session: perSession,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    setIsSaving(false);
    if (error) toast.error('Не удалось сохранить: ' + error.message);
    else toast.success('Ограничения сохранены');
  };

  const num = (v: string) => Math.max(0, parseInt(v) || 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" />
          Общий потолок рекламы
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Действует поверх лимитов отдельных объявлений и защищает ленту от перегрева рекламой
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Не больше реклам в день</Label>
                <Input type="number" min={0} value={perDay}
                  onChange={e => setPerDay(num(e.target.value))} />
                <p className="text-[11px] text-muted-foreground mt-1">0 — без ограничения</p>
              </div>
              <div>
                <Label>Не больше за сессию</Label>
                <Input type="number" min={0} value={perSession}
                  onChange={e => setPerSession(num(e.target.value))} />
                <p className="text-[11px] text-muted-foreground mt-1">0 — без ограничения</p>
              </div>
            </div>
            <Button onClick={save} disabled={isSaving} className="w-full">
              {isSaving ? <><Loader2 size={16} className="mr-2 animate-spin" />Сохраняем…</> : 'Сохранить'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
