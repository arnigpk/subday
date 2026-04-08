import { QRCodeSVG } from 'qrcode.react';
import { Check, Coffee } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface PreorderConfirmationProps {
  shopName: string;
  coffeeName: string;
  syrup: string | null;
  qrCode: string;
  preorderId: string;
  createdAt: string;
  onClose: () => void;
}

export function PreorderConfirmation({ shopName, coffeeName, syrup, qrCode, preorderId, createdAt, onClose }: PreorderConfirmationProps) {
  const qrData = JSON.stringify({
    type: 'subday_preorder',
    preorderId,
    qrCode,
  });

  const formattedTime = (() => {
    try { return format(parseISO(createdAt), 'HH:mm, d MMM', { locale: ru }); }
    catch { return ''; }
  })();

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center animate-pop">
        <Check size={32} strokeWidth={3} className="text-accent-foreground" />
      </div>

      <div>
        <h3 className="text-xl font-black text-foreground">Предзаказ принят!</h3>
        <p className="text-sm text-muted-foreground mt-1">{shopName}</p>
      </div>

      <div className="card-static w-full text-left">
        <div className="flex items-center gap-2 mb-2">
          <Coffee size={16} className="text-primary" />
          <span className="font-semibold text-foreground">{coffeeName}</span>
        </div>
        {syrup && (
          <p className="text-sm text-muted-foreground ml-6">+ {syrup}</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">{formattedTime}</p>
      </div>

      <div className="bg-background p-4 rounded-2xl border border-border">
        <QRCodeSVG value={qrData} size={180} level="M" />
      </div>
      <p className="text-xs text-muted-foreground">Покажите QR-код баристе</p>

      <button
        onClick={onClose}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
      >
        Готово
      </button>
    </div>
  );
}
