import { useState, useEffect } from 'react';
import { Coffee, Check, Clock, XCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Preorder {
  id: string;
  shop_name: string;
  coffee_name: string;
  syrup: string | null;
  status: string;
  qr_code: string;
  created_at: string;
  completed_at: string | null;
  cancelled_at?: string | null;
}

export function PreorderHistoryItem({ preorder, index, onCancelSuccess }: { preorder: Preorder; index: number; onCancelSuccess?: () => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [canCancel, setCanCancel] = useState(false);

  const isCompleted = preorder.status === 'completed';
  const isCancelled = preorder.status === 'cancelled';
  const isNew = preorder.status === 'new';

  useEffect(() => {
    if (!isNew) { setCanCancel(false); return; }
    const check = () => {
      const mins = differenceInMinutes(new Date(), parseISO(preorder.created_at));
      setCanCancel(mins < 5);
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [isNew, preorder.created_at]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current stats to refund coffee
      const { data: stats } = await supabase
        .from('user_stats')
        .select('coffee_remaining')
        .eq('user_id', user.id)
        .single();

      // Update preorder status
      const { error: updateErr } = await supabase
        .from('preorders')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', preorder.id)
        .eq('status', 'new');

      if (updateErr) throw updateErr;

      // Refund coffee
      if (stats) {
        await supabase
          .from('user_stats')
          .update({ coffee_remaining: stats.coffee_remaining + 1 })
          .eq('user_id', user.id);
      }

      toast({ title: 'Предзаказ отменён, кофе возвращён' });
      setShowDetail(false);
      onCancelSuccess?.();
    } catch (e) {
      console.error('Cancel error:', e);
      toast({ title: 'Ошибка при отмене', variant: 'destructive' });
    } finally {
      setIsCancelling(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'd MMM', { locale: ru }); }
    catch { return dateStr; }
  };

  const formatTime = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'HH:mm'); }
    catch { return ''; }
  };

  const qrData = JSON.stringify({
    type: 'subday_preorder',
    preorderId: preorder.id,
    qrCode: preorder.qr_code,
  });

  const getStatusBadge = () => {
    if (isCancelled) return { text: 'Отменён', className: 'bg-destructive/10 text-destructive' };
    if (isCompleted) return { text: 'Выдан', className: 'bg-accent/10 text-accent' };
    return { text: 'Предзаказ', className: 'bg-amber-500/10 text-amber-600' };
  };

  const getIcon = () => {
    if (isCancelled) return <XCircle size={24} className="text-destructive" />;
    if (isCompleted) return <Check size={24} className="text-accent" />;
    return <Coffee size={24} className="text-primary" />;
  };

  const getIconBg = () => {
    if (isCancelled) return 'bg-destructive/10';
    if (isCompleted) return 'bg-accent/10';
    return 'bg-primary/10';
  };

  const badge = getStatusBadge();

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className="card-static flex items-center gap-4 animate-slide-up cursor-pointer active:scale-[0.98] transition-transform"
        style={{ animationDelay: `${index * 0.05}s` }}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${getIconBg()}`}>
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{preorder.coffee_name}</p>
          <p className="text-sm text-muted-foreground truncate">{preorder.shop_name}</p>
          {preorder.syrup && <p className="text-xs text-muted-foreground">+ {preorder.syrup}</p>}
        </div>
        <div className="text-right">
          <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
            {badge.text}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{formatDate(preorder.created_at)}</p>
          <p className="text-xs text-muted-foreground">{formatTime(preorder.created_at)}</p>
        </div>
      </div>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-sm mx-auto">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${getIconBg()}`}>
              {isCancelled ? <XCircle size={28} className="text-destructive" /> : isCompleted ? <Check size={28} className="text-accent" /> : <Clock size={28} className="text-primary" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{preorder.coffee_name}</h3>
              {preorder.syrup && <p className="text-sm text-muted-foreground">+ {preorder.syrup}</p>}
              <p className="text-sm text-muted-foreground mt-1">{preorder.shop_name}</p>
            </div>
            <div className={`text-sm font-medium px-3 py-1 rounded-full ${badge.className}`}>
              {isCancelled ? 'Отменён' : isCompleted ? 'Выдан' : 'Ожидает выдачи'}
            </div>
            {isNew && (
              <div className="bg-background p-4 rounded-2xl border border-border">
                <QRCodeSVG value={qrData} size={160} level="M" />
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {formatDate(preorder.created_at)} в {formatTime(preorder.created_at)}
              {preorder.completed_at && (
                <> • Выдан: {formatDate(preorder.completed_at)} в {formatTime(preorder.completed_at)}</>
              )}
              {preorder.cancelled_at && (
                <> • Отменён: {formatDate(preorder.cancelled_at)} в {formatTime(preorder.cancelled_at)}</>
              )}
            </div>
            {isNew && canCancel && (
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="w-full py-3 rounded-xl border border-destructive text-destructive font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isCancelling ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                Отменить предзаказ
              </button>
            )}
            {isNew && !canCancel && (
              <p className="text-xs text-muted-foreground">Время отмены истекло (5 минут)</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
