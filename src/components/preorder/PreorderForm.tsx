import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Coffee, Loader2, MapPin } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface PreorderFormProps {
  shopId: string;
  shopName: string;
  coffeeRemaining: number;
  addresses: string[];
  onSuccess: (preorder: { id: string; coffeeName: string; syrup: string | null; qrCode: string; createdAt: string }) => void;
  onCancel: () => void;
}

export function PreorderForm({ shopId, shopName, coffeeRemaining, addresses, onSuccess, onCancel }: PreorderFormProps) {
  const [coffeeName, setCoffeeName] = useState('');
  const [syrup, setSyrup] = useState('');
  const [selectedAddress, setSelectedAddress] = useState(addresses.length === 1 ? addresses[0] : '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useLanguage();

  const handleSubmit = async () => {
    if (!coffeeName.trim()) {
      toast({ title: 'Укажите название кофе', variant: 'destructive' });
      return;
    }

    if (addresses.length > 1 && !selectedAddress) {
      toast({ title: 'Выберите адрес', variant: 'destructive' });
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

      const addr = selectedAddress || addresses[0] || null;

      // Атомарное создание предзаказа со списанием на сервере (защита от накрутки)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'create_preorder_with_deduction',
        {
          _shop_id: shopId,
          _shop_name: shopName,
          _coffee_name: coffeeName.trim(),
          _syrup: syrup.trim() || null,
          _shop_address: addr,
        }
      );

      if (rpcError) throw rpcError;
      const result = rpcData as { success: boolean; error?: string; id?: string; qr_code?: string; created_at?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'preorder_failed');
      }
      const data = { id: result.id!, qr_code: result.qr_code!, created_at: result.created_at! };

      // Notify baristas via edge function (fire-and-forget)
      supabase.functions.invoke('preorder-notify', {
        body: {
          shopId,
          coffeeName: coffeeName.trim(),
          syrup: syrup.trim() || null,
          customerName: null,
          shopAddress: addr,
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

      {addresses.length > 1 && (
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">Адрес *</label>
          <Select value={selectedAddress} onValueChange={setSelectedAddress}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите адрес" />
            </SelectTrigger>
            <SelectContent>
              {addresses.map((addr, i) => (
                <SelectItem key={i} value={addr}>
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-muted-foreground" />
                    {addr}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
          disabled={isSubmitting || !coffeeName.trim() || (addresses.length > 1 && !selectedAddress)}
          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
          Оформить
        </button>
      </div>
    </div>
  );
}
