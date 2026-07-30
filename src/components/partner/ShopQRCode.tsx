import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw, X, MapPin, ScanLine } from 'lucide-react';

interface Props {
  shopId: string;
  /** адрес точки; '' — единственная/основная точка кофейни */
  address?: string;
  onClose?: () => void;
}

/**
 * QR кофейни для второго способа забора: гость сканирует его сам, и списание
 * проходит без участия кассира. В коде — только секретный токен точки, поэтому
 * подделать чужой QR нельзя. Токен создаётся при первом открытии этого экрана.
 */
export function ShopQRCode({ shopId, address = '', onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_or_create_shop_qr' as never, {
        p_shop_id: shopId, p_address: address,
      } as never);
      if (error) throw error;
      const r = data as unknown as { ok?: boolean; token?: string; shop_name?: string };
      if (r?.ok && r.token) { setToken(r.token); setShopName(r.shop_name || ''); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось получить QR');
    } finally { setLoading(false); }
  }, [shopId, address]);

  useEffect(() => { load(); }, [load]);

  const rotate = async () => {
    if (!confirm('Перевыпустить QR? Старый распечатанный код перестанет работать — его нужно будет заменить.')) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('rotate_shop_qr' as never, {
        p_shop_id: shopId, p_address: address,
      } as never);
      if (error) throw error;
      const r = data as unknown as { ok?: boolean; token?: string };
      if (r?.token) { setToken(r.token); toast.success('QR перевыпущен — распечатайте новый'); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось перевыпустить');
    } finally { setBusy(false); }
  };

  // Скачиваем как PNG в высоком разрешении — чтобы код читался и в печати.
  const download = () => {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return;
    const size = 1024, pad = 72;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size + pad * 2; canvas.height = size + pad * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, size, size);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const safe = (shopName || 'shop').replace(/[^\wА-Яа-яЁё-]+/g, '_').slice(0, 40);
        a.download = `subday-QR-${safe}${address ? '-' + address.replace(/[^\wА-Яа-яЁё-]+/g, '_').slice(0, 30) : ''}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  };

  const payload = token ? JSON.stringify({ t: 'subday_shop', k: token }) : null;
  const warm = 'linear-gradient(135deg, hsl(14 82% 52%), hsl(4 74% 44%))';

  return (
    <div className="rounded-3xl overflow-hidden border border-border bg-card">
      {/* Шапка — тёплый градиент, как у кнопок забора */}
      <div className="px-5 py-4 text-white relative" style={{ background: warm }}>
        {onClose && (
          <button onClick={onClose} aria-label="Закрыть"
                  className="absolute right-3 top-3 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: 'hsl(0 0% 100% / 0.18)' }}>
            <X size={16} />
          </button>
        )}
        <div className="flex items-center gap-2">
          <ScanLine size={20} />
          <p className="font-bold" style={{ fontSize: 'clamp(16px,4.5vw,19px)' }}>QR кофейни</p>
        </div>
        <p className="text-white/85 text-sm mt-1 pr-8">Гость сканирует его сам — списание пройдёт автоматически</p>
        {address && (
          <p className="text-white/75 text-xs mt-1.5 flex items-center gap-1">
            <MapPin size={12} className="shrink-0" />
            <span className="truncate">{address}</span>
          </p>
        )}
      </div>

      {/* Сам код */}
      <div className="p-5 space-y-4">
        <div ref={wrapRef} className="flex justify-center">
          {loading ? (
            <div className="w-64 h-64 rounded-2xl flex items-center justify-center bg-secondary/40">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : payload ? (
            <div className="bg-white rounded-2xl p-4 shadow-sm border-2" style={{ borderColor: 'hsl(14 82% 52% / 0.25)' }}>
              <QRCodeSVG value={payload} size={232} level="M" includeMargin={false} bgColor="#FFFFFF" fgColor="#1a1a1a" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-16">QR недоступен</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={download}
            disabled={!payload}
            className="flex-1 rounded-2xl text-white font-bold py-3 active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: warm }}
          >
            <span className="inline-flex items-center gap-2"><Download size={17} />Скачать для печати</span>
          </button>
          <button
            onClick={rotate}
            disabled={busy || !payload}
            title="Перевыпустить, если код утёк"
            className="w-12 rounded-2xl border border-border flex items-center justify-center text-muted-foreground active:scale-95 transition-transform disabled:opacity-50"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
          </button>
        </div>

        <div className="rounded-2xl bg-secondary/50 px-4 py-3 space-y-1.5">
          <p className="text-xs text-muted-foreground leading-snug">
            <b className="text-foreground">Как использовать:</b> распечатайте код и поставьте на стойку.
            Гость открывает приложение → «Сканировать» → наводит камеру.
          </p>
          <p className="text-xs text-muted-foreground leading-snug">
            Работает только при включённой интеграции с кассой — заказ должен попадать в POS автоматически.
          </p>
        </div>
      </div>
    </div>
  );
}
