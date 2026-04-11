import { Coffee, Check, Clock, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState } from 'react';

interface Preorder {
  id: string;
  shop_name: string;
  coffee_name: string;
  syrup: string | null;
  status: string;
  qr_code: string;
  created_at: string;
  completed_at: string | null;
  shop_address?: string | null;
}

export function PreorderHistoryItem({ preorder, index }: { preorder: Preorder; index: number }) {
  const [showDetail, setShowDetail] = useState(false);

  const isCompleted = preorder.status === 'completed';
  const isNew = preorder.status === 'new';

  const qrData = JSON.stringify({
    type: 'subday_preorder',
    preorderId: preorder.id,
    qrCode: preorder.qr_code,
  });

  const formatDate = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'd MMM', { locale: ru }); }
    catch { return dateStr; }
  };

  const formatTime = (dateStr: string) => {
    try { return format(parseISO(dateStr), 'HH:mm'); }
    catch { return ''; }
  };

  const getStatusBadge = () => {
    if (isCompleted) return { text: 'Выдан', className: 'bg-accent/10 text-accent' };
    return { text: 'Предзаказ', className: 'bg-amber-500/10 text-amber-600' };
  };

  const getIcon = () => {
    if (isCompleted) return <Check size={24} className="text-accent" />;
    return <Coffee size={24} className="text-primary" />;
  };

  const getIconBg = () => {
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
          {preorder.shop_address && <p className="text-xs text-muted-foreground truncate">{preorder.shop_address}</p>}
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
              {isCompleted ? <Check size={28} className="text-accent" /> : <Clock size={28} className="text-primary" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">{preorder.coffee_name}</h3>
              {preorder.syrup && <p className="text-sm text-muted-foreground">+ {preorder.syrup}</p>}
              <p className="text-sm text-muted-foreground mt-1">{preorder.shop_name}</p>
              {preorder.shop_address && <p className="text-xs text-muted-foreground">{preorder.shop_address}</p>}
            </div>
            <div className={`text-sm font-medium px-3 py-1 rounded-full ${badge.className}`}>
              {isCompleted ? 'Выдан' : 'Ожидает выдачи'}
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
