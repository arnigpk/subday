import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Coffee, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface PreorderFormProps {
  shopId: string;
  shopName: string;
  coffeeRemaining: number;
  onSuccess: (preorder: { id: string; coffeeName: string; syrup: string | null; qrCode: string; createdAt: string }) => void;
  onCancel: () => void;
}

export function PreorderForm({ shopId, shopName, coffeeRemaining, onSuccess, onCancel }: PreorderFormProps) {
  const [coffeeName, setCoffeeName] = useState('');
  const [syrup, setSyrup] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async () => {
    if (!coffeeName.trim()) {
      toast({ title: 'Укажите название кофе', variant: 'destructive' });
      return;
    }

    if (coffeeRemaining <= 0) {
      toast({ title: 'Нет доступных напитков', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Deduct 1 coffee from subscription
      const { error: statsError } = await supabase
        .from('user_stats')
        .update({ coffee_remaining: coffeeRemaining - 1 })
        .eq('user_id', user.id);

      if (statsError) throw statsError;

      // Create preorder
      const { data, error } = await supabase
        .from('preorders')
        .insert({
          user_id: user.id,
          shop_id: shopId,
          shop_name: shopName,
          coffee_name: coffeeName.trim(),
          syrup: syrup.trim() || null,
        })
        .select('id, qr_code, created_at')
        .single();

      if (error) {
        // Rollback coffee deduction
        await supabase.from('user_stats').update({ coffee_remaining: coffeeRemaining }).eq('user_id', user.id);
        throw error;
      }

      // Notify baristas via FCM (fire-and-forget)
      supabase.functions.invoke('preorder-notify', {
        body: {
          shopId,
          coffeeName: coffeeName.trim(),
          syrup: syrup.trim() || null,
          customerName: null, // privacy: don't send name
        },
      }).catch(() => {});

      onSuccess({
        id: data.id,
        coffeeName: coffeeName.trim(),
        syrup: syrup.trim() || null,
        qrCode: data.qr_code,
        createdAt: data.created_at,
      });
    } catch (error) {
      console.error('Preorder error:', error);
      toast({ title: 'Ошибка при оформлении предзаказа', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Coffee size={20} className="text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-foreground">Сделать предзаказ</h3>
          <p className="text-xs text-muted-foreground">{shopName}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        ☕ Пока вы дойдёте или доедете до кофейни — ваш кофе уже будет готов!
      </p>

      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Название кофе *</label>
        <Input
          value={coffeeName}
          onChange={(e) => setCoffeeName(e.target.value)}
          placeholder="Например: Латте, Капучино"
          maxLength={100}
          autoFocus
        />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">Сироп</label>
        <Input
          value={syrup}
          onChange={(e) => setSyrup(e.target.value)}
          placeholder="Например: Ваниль, Карамель"
          maxLength={100}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl border border-border text-foreground font-semibold text-sm"
        >
          Отмена
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !coffeeName.trim()}
          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
          Оформить
        </button>
      </div>
    </div>
  );
}
