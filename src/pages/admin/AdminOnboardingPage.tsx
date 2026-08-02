import { useEffect, useState, useCallback } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2, Eye } from 'lucide-react';

interface Slide {
  id?: string;          // есть у сохранённых, нет у новых
  emoji: string;
  title: string;
  body: string;
  button_label: string;
  is_active: boolean;
}

const BLANK: Slide = { emoji: '☕', title: '', body: '', button_label: 'Далее →', is_active: true };

export default function AdminOnboardingPage() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const fetchSlides = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('onboarding_slides')
        .select('id, emoji, title, body, button_label, is_active')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setSlides((data as Slide[]) || []);
      setRemovedIds([]);
    } catch (e) {
      console.error('Error fetching onboarding slides:', e);
      toast({ title: 'Ошибка загрузки слайдов', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSlides(); }, [fetchSlides]);

  const patch = (i: number, p: Partial<Slide>) =>
    setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, ...p } : s));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    setSlides(prev => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const remove = (i: number) => {
    const s = slides[i];
    if (s.id) setRemovedIds(prev => [...prev, s.id!]);
    setSlides(prev => prev.filter((_, idx) => idx !== i));
  };

  const add = () => setSlides(prev => [...prev, { ...BLANK }]);

  const save = async () => {
    if (slides.some(s => !s.title.trim())) {
      toast({ title: 'У каждого слайда должен быть заголовок', variant: 'destructive' });
      return;
    }
    if (slides.filter(s => s.is_active).length === 0) {
      toast({ title: 'Хотя бы один слайд должен быть активным', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Удаляем убранные.
      if (removedIds.length) {
        const { error } = await supabase.from('onboarding_slides').delete().in('id', removedIds);
        if (error) throw error;
      }
      // Обновляем существующие и вставляем новые — sort_order = позиция.
      await Promise.all(slides.map((s, idx) => {
        const row = {
          sort_order: idx + 1,
          emoji: s.emoji || '☕',
          title: s.title.trim(),
          body: s.body,
          button_label: s.button_label.trim() || 'Далее →',
          is_active: s.is_active,
          updated_at: new Date().toISOString(),
        };
        return s.id
          ? supabase.from('onboarding_slides').update(row).eq('id', s.id)
          : supabase.from('onboarding_slides').insert(row);
      })).then(results => {
        const failed = (results as { error: unknown }[]).find(r => r.error);
        if (failed?.error) throw failed.error;
      });

      toast({ title: 'Онбординг сохранён' });
      fetchSlides();
    } catch (e) {
      console.error('Error saving onboarding:', e);
      toast({ title: 'Ошибка сохранения', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Онбординг">
      <div className="max-w-2xl space-y-4">
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p>Приветственные слайды, которые видит новый пользователь после регистрации.</p>
            <p>
              В тексте: каждая строка — абзац. Строка, начинающаяся с <code className="text-foreground">- </code>
              (дефис и пробел), становится пунктом списка.
            </p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Card key={i}><CardContent className="p-6"><div className="h-32 bg-muted animate-pulse rounded" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <>
            {slides.map((s, i) => (
              <Card key={s.id || `new-${i}`} className={!s.is_active ? 'opacity-60' : ''}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground w-14">Слайд {i + 1}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setPreviewIdx(previewIdx === i ? null : i)} title="Предпросмотр">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} title="Выше">
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === slides.length - 1} title="Ниже">
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(i)} title="Удалить">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-20">
                      <Label className="text-xs">Эмодзи</Label>
                      <Input value={s.emoji} onChange={e => patch(i, { emoji: e.target.value })} className="text-center text-2xl" maxLength={4} />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">Заголовок</Label>
                      <Input value={s.title} onChange={e => patch(i, { title: e.target.value })} placeholder="Заголовок слайда" />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Текст</Label>
                    <Textarea value={s.body} onChange={e => patch(i, { body: e.target.value })} rows={5}
                      placeholder={'Абзац текста.\n- пункт списка\n- ещё пункт'} className="text-sm" />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">Текст кнопки</Label>
                      <Input value={s.button_label} onChange={e => patch(i, { button_label: e.target.value })} placeholder="Далее →" />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Switch checked={s.is_active} onCheckedChange={v => patch(i, { is_active: v })} />
                      <Label className="text-xs">Активен</Label>
                    </div>
                  </div>

                  {previewIdx === i && (
                    <div className="rounded-2xl bg-[#FAF9F6] border p-6 flex flex-col items-center text-center gap-3">
                      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-4xl">{s.emoji}</div>
                      <p className="text-lg font-semibold text-foreground">{s.title || '(без заголовка)'}</p>
                      <div className="text-sm text-muted-foreground text-left max-w-xs space-y-2">
                        {previewBody(s.body)}
                      </div>
                      <div className="mt-2 rounded-full bg-primary text-primary-foreground px-6 py-2 text-sm font-medium">{s.button_label}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={add}>
                <Plus className="w-4 h-4 mr-1.5" /> Добавить слайд
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Сохранить
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// Тот же рендер тела, что в самом онбординге — абзацы + списки из «- ».
function previewBody(body: string) {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const out: JSX.Element[] = [];
  let bullets: string[] = [];
  const flush = (k: string) => {
    if (bullets.length) {
      out.push(<ul key={k} className="list-disc pl-5 space-y-1">{bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>);
      bullets = [];
    }
  };
  lines.forEach((line, i) => {
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else { flush(`u${i}`); out.push(<p key={`p${i}`}>{line}</p>); }
  });
  flush('uend');
  return out;
}
