import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw, X, MapPin, ScanLine } from 'lucide-react';

interface Props {
  shopId: string;
  /** адрес точки; '' — единственная/основная точка кофейни */
  address?: string;
  /** Перевыпуск доступен ТОЛЬКО владельцу кофейни (на сервере тоже запрещено бариста). */
  canRotate?: boolean;
  onClose?: () => void;
}

// Перенос текста по ширине для canvas: разбивает на строки, не длиннее maxWidth,
// максимум maxLines; если не влезает — последнюю строку укорачивает с «…».
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = test;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Если весь текст не поместился — добавляем многоточие к последней строке.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    const joined = lines.join(' ');
    if (joined.replace(/\s+/g, '') !== text.replace(/\s+/g, '')) {
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last + '…';
    }
  }
  return lines;
}

/**
 * QR кофейни для второго способа забора: гость сканирует его сам, и списание
 * проходит без участия кассира. В коде — только секретный токен точки, поэтому
 * подделать чужой QR нельзя. Токен создаётся при первом открытии этого экрана.
 */
export function ShopQRCode({ shopId, address = '', canRotate = false, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // Отдельный ref именно на QR (в карточке теперь есть и иконки-SVG адреса).
  const qrRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_or_create_shop_qr' as never, {
        p_shop_id: shopId, p_address: address,
      } as never);
      if (error) throw error;
      const r = data as unknown as { ok?: boolean; token?: string; shop_name?: string; message?: string };
      if (r?.ok && r.token) { setToken(r.token); setShopName(r.shop_name || ''); setNote(null); }
      // Сервер отказал (напр. у кофейни несколько адресов и точка не выбрана) —
      // показываем понятную причину вместо пустого «QR недоступен».
      else if (r && r.ok === false) { setToken(null); setNote(r.message || 'QR недоступен'); }
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

  // Скачиваем как PNG в высоком разрешении: QR + под ним название и адрес
  // кофейни — готовая наклейка на стойку, читается и в печати.
  const download = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const size = 1024, padX = 88, padTop = 88, padBottom = 76;
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = size + padX * 2;
      const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      const nameFont = `bold 54px ${FONT}`;
      const addrFont = `36px ${FONT}`;
      const nameLineH = 66, addrLineH = 48;
      const gapQrToDivider = 56, dividerToText = 46, nameToAddr = 14;

      // Ширину задаём заранее — чтобы измерить перенос адреса по ширине QR.
      canvas.width = width;
      ctx.font = addrFont;
      const addrLines = address ? wrapText(ctx, address, size, 2) : [];
      const hasName = !!shopName;

      // Считаем высоту текстового блока и итоговую высоту холста.
      let textH = 0;
      if (hasName || addrLines.length) {
        textH = gapQrToDivider + 2 /* разделитель */ + dividerToText;
        if (hasName) textH += nameLineH;
        if (addrLines.length) textH += (hasName ? nameToAddr : 0) + addrLines.length * addrLineH;
      }
      canvas.height = padTop + size + textH + padBottom;

      // Рисуем (смена размеров сбросила состояние контекста).
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, padX, padTop, size, size);

      if (hasName || addrLines.length) {
        const cx = canvas.width / 2;
        let y = padTop + size + gapQrToDivider;
        // Тонкий разделитель по центру.
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padX + size * 0.16, y);
        ctx.lineTo(padX + size * 0.84, y);
        ctx.stroke();
        y += dividerToText;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        if (hasName) {
          ctx.font = nameFont;
          ctx.fillStyle = '#1a1a1a';
          ctx.fillText(shopName, cx, y + 44);
          y += nameLineH + (addrLines.length ? nameToAddr : 0);
        }
        if (addrLines.length) {
          ctx.font = addrFont;
          ctx.fillStyle = '#726a63';
          addrLines.forEach((line, i) => ctx.fillText(line, cx, y + 34 + i * addrLineH));
        }
      }

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
    <div className="rounded-3xl overflow-hidden border border-border bg-card">
      {/* Шапка — фирменный карамельный градиент приложения */}
      <div className="px-5 py-4 text-white relative bg-gradient-caramel">
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
        <div className="flex justify-center">
          {loading ? (
            <div className="w-64 h-64 rounded-2xl flex items-center justify-center bg-secondary/40">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : payload ? (
            // Белая карточка = готовая печатная наклейка: QR, тонкий разделитель,
            // название кофейни и адрес. Цвета жёстко тёмные (не тема) — фон всегда
            // белый и в приложении, и на печати.
            <div className="bg-white rounded-2xl p-5 shadow-sm border-2 border-primary/25 flex flex-col items-center"
                 style={{ maxWidth: 288 }}>
              <div ref={qrRef}>
                <QRCodeSVG value={payload} size={232} level="M" includeMargin={false} bgColor="#FFFFFF" fgColor="#1a1a1a" />
              </div>
              {(shopName || address) && (
                <div className="w-full mt-3 pt-3 border-t border-black/10 text-center">
                  {shopName && (
                    <p className="font-bold leading-tight break-words" style={{ color: '#1a1a1a', fontSize: 15 }}>
                      {shopName}
                    </p>
                  )}
                  {address && (
                    <p className="mt-1 leading-snug inline-flex items-start justify-center gap-1 break-words"
                       style={{ color: '#726a63', fontSize: 12 }}>
                      <MapPin size={11} className="shrink-0 mt-[2px]" />
                      <span>{address}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-16 px-4 text-center">{note || 'QR недоступен'}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={download}
            disabled={!payload}
            className="flex-1 rounded-2xl bg-gradient-caramel text-white font-bold py-3 active:scale-95 transition-transform disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-2"><Download size={17} />Скачать для печати</span>
          </button>
          {/* Перевыпуск — только владелец кофейни. У бариста кнопки нет (и сервер откажет). */}
          {canRotate && (
            <button
              onClick={rotate}
              disabled={busy || !payload}
              title="Перевыпустить, если код утёк"
              className="w-12 rounded-2xl border border-border flex items-center justify-center text-muted-foreground active:scale-95 transition-transform disabled:opacity-50"
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            </button>
          )}
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
