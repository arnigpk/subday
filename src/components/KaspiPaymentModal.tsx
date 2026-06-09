import { useEffect, useState } from 'react';
import { X, Clock } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

interface KaspiPaymentModalProps {
  qrToken: string;
  amount: number;
  expireDate?: string;
  onClose: () => void;
}

export function KaspiPaymentModal({ qrToken, amount, expireDate, onClose }: KaspiPaymentModalProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (!expireDate) return;
    const update = () => {
      const diff = Math.floor((new Date(expireDate).getTime() - Date.now()) / 1000);
      setSecondsLeft(diff > 0 ? diff : 0);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expireDate]);

  const formattedAmount = new Intl.NumberFormat('ru-RU').format(amount);
  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : null;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrToken)}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm">
      <div className="w-full bg-background rounded-t-3xl shadow-xl overflow-y-auto"
           style={{ maxHeight: '90vh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}>
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#F14635] flex items-center justify-center">
                <span className="text-white text-xs font-black">K</span>
              </div>
              <span className="font-bold text-foreground">Kaspi Pay</span>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
              <X size={16} className="text-foreground" />
            </button>
          </div>

          {/* Amount */}
          <p className="text-center text-2xl font-black text-foreground mb-1">{formattedAmount} ₸</p>
          <p className="text-center text-sm text-muted-foreground mb-4">Отсканируйте QR или нажмите кнопку</p>

          {/* QR code */}
          <div className="flex justify-center mb-3">
            <div className="p-3 bg-white rounded-2xl shadow-sm">
              <img src={qrImageUrl} alt="Kaspi QR" width={200} height={200} className="rounded-lg" />
            </div>
          </div>

          {/* Timer */}
          {secondsLeft !== null && (
            <div className="flex items-center justify-center gap-1.5 mb-4 text-sm text-muted-foreground">
              <Clock size={14} />
              <span>
                {secondsLeft > 0
                  ? `Действителен ${minutes}:${String(seconds).padStart(2, '0')}`
                  : 'Истёк — закройте и попробуйте снова'}
              </span>
            </div>
          )}

          {/* Open button — on native Android/iOS use _system so the OS
              handles the intent and opens the Kaspi app; on web use _blank. */}
          <button
            onClick={() => window.open(qrToken, Capacitor.isNativePlatform() ? '_system' : '_blank')}
            className="block w-full rounded-2xl bg-[#F14635] text-white text-center font-bold text-sm mb-2 py-3.5"
          >
            Нажмите, чтобы открыть Kaspi и оплатить
          </button>

          <p className="text-center text-xs text-muted-foreground mb-3">
            Работает только на мобильном с приложением Kaspi
          </p>

          <button onClick={onClose} className="w-full h-10 rounded-2xl bg-secondary text-foreground text-sm font-medium">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
