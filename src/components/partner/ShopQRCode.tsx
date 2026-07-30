import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw, QrCode, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  shopId: string;
  /** адрес точки; '' — единственная/основная точка кофейни */
  address?: string;
  onClose?: () => void;
}

/**
 * QR кофейни для второго способа забора: гость сканирует его и списание проходит
 * само. В коде — только секретный токен точки, никаких данных о кофейне, поэтому
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

  // Скачиваем как PNG: рисуем SVG на canvas в высоком разрешении, чтобы код
  // хорошо читался и в печати (1024px с белым полем по краям).
  const download = () => {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return;
    const size = 1024, pad = 64;
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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <QrCode size={18} className="text-primary" />
          QR кофейни
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 -mr-1" aria-label="Закрыть">
            <X size={18} />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Распечатайте и поставьте на стойку. Гость сканирует его в приложении — списание
        пройдёт само, как при обычном сканировании.
        {address ? <> Код для точки: <b className="text-foreground">{address}</b>.</> : null}
      </p>

      <div ref={wrapRef} className="flex justify-center py-2">
        {loading ? (
          <div className="w-56 h-56 flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : payload ? (
          <div className="bg-white p-3 rounded-2xl border border-border">
            <QRCodeSVG value={payload} size={224} level="M" includeMargin={false} bgColor="#FFFFFF" fgColor="#000000" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-10">QR недоступен</p>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={download} disabled={!payload} className="flex-1">
          <Download size={16} className="mr-2" />Скачать PNG
        </Button>
        <Button variant="outline" onClick={rotate} disabled={busy || !payload} title="Перевыпустить, если код утёк">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Самообслуживание работает только при включённой интеграции с кассой — заказ
        должен попадать в POS автоматически.
      </p>
    </div>
  );
}
