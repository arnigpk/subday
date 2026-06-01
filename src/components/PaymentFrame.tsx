import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, ChevronLeft } from 'lucide-react';

interface PaymentFrameProps {
  url: string;
  orderId: string | null;
  onClose: () => void;
}

export function PaymentFrame({ url, orderId, onClose }: PaymentFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const handleSuccess = () => {
    onClose();
    navigate(`/packages?payment=success${orderId ? `&order=${orderId}` : ''}`);
  };

  const handleFailed = () => {
    onClose();
    navigate(`/packages?payment=failed${orderId ? `&order=${orderId}` : ''}`);
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;
        const status = data.pg_payment_status || data.status || data.type || '';
        if (status === 'success' || status === 'payment_success') handleSuccess();
        else if (status === 'failed' || status === 'failure' || status === 'payment_failed') handleFailed();
      } catch { /* non-JSON, ignore */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [orderId]);

  const handleLoad = () => {
    setLoading(false);
    try {
      const iframeUrl = iframeRef.current?.contentWindow?.location.href;
      if (!iframeUrl) return;
      if (iframeUrl.includes('payment=success')) handleSuccess();
      else if (iframeUrl.includes('payment=failed')) handleFailed();
    } catch { /* cross-origin, ignore */ }
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex flex-col bg-background"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 64px)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
          aria-label="Назад"
        >
          <ChevronLeft size={20} className="text-foreground" />
        </button>
        <span className="text-base font-semibold text-foreground">Оплата</span>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"
          aria-label="Закрыть"
        >
          <X size={18} className="text-foreground" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={url}
          onLoad={handleLoad}
          className="w-full h-full border-none"
          allow="payment *; camera; microphone"
          allowPaymentRequest
          title="Оплата"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
        />
      </div>
    </div>
  );
}
