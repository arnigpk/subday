import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BaristaAddressDialogProps {
  open: boolean;
  onSelect: (address: string) => void;
  addresses: string[];
  shopId: string;
}

export function BaristaAddressDialog({ open, onSelect, addresses, shopId }: BaristaAddressDialogProps) {
  const [selecting, setSelecting] = useState<string | null>(null);

  const handleSelect = async (address: string) => {
    setSelecting(address);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Upsert barista shift (unique on user_id)
      const { error } = await supabase
        .from('barista_shifts')
        .upsert({
          user_id: user.id,
          shop_id: shopId,
          address,
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast.success(`Адрес выбран: ${address}`);
      onSelect(address);
    } catch (e) {
      console.error('Shift address error:', e);
      toast.error('Ошибка выбора адреса');
    } finally {
      setSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm mx-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin size={20} className="text-primary" />
            Выберите адрес смены
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-2">
          На каком адресе вы сейчас работаете?
        </p>
        <div className="space-y-2">
          {addresses.map((addr, i) => (
            <Button
              key={i}
              variant="outline"
              className="w-full justify-start text-left h-auto py-3"
              disabled={selecting !== null}
              onClick={() => handleSelect(addr)}
            >
              <MapPin size={16} className="mr-2 shrink-0 text-primary" />
              <span className="truncate">{addr}</span>
              {selecting === addr && <span className="ml-auto text-xs text-muted-foreground">...</span>}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
