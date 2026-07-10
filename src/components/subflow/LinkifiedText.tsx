import { Capacitor } from '@capacitor/core';

// Находит ссылки (http(s):// и www.) в тексте и делает их кликабельными.
// Обычный текст и переносы строк сохраняются (родитель — whitespace-pre-wrap).
// На нативе открываем во ВНЕШНЕМ браузере (_system), на вебе — новая вкладка.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,!?;:)\]}'"»])/gi;

export function LinkifiedText({ text }: { text: string }) {
  if (!text) return null;

  const openUrl = (raw: string) => {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    window.open(href, Capacitor.isNativePlatform() ? '_system' : '_blank');
  };

  const parts: Array<{ t: 'text' | 'url'; v: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    parts.push({ t: 'url', v: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });

  return (
    <>
      {parts.map((p, i) =>
        p.t === 'text' ? (
          <span key={i}>{p.v}</span>
        ) : (
          <a
            key={i}
            role="link"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); openUrl(p.v); }}
            className="text-primary underline break-all cursor-pointer"
          >
            {p.v}
          </a>
        )
      )}
    </>
  );
}
