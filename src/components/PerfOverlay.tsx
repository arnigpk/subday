import { useEffect, useState } from 'react';
import type { PerfReport } from '@/lib/perf';

// Оверлей замеров старта (Слой 4). Виден ТОЛЬКО когда включён флаг:
//   localStorage.subday_perf === '1'  (или ?perf=1 в URL для веба).
// Обычные пользователи его никогда не видят. Включается 7 тапами по флагу 🇰🇿
// на главной (см. HomePage) или вручную через консоль удалённой отладки.
export function PerfOverlay() {
  const [report, setReport] = useState<PerfReport | null>(null);
  const [hidden, setHidden] = useState(false);

  const enabled =
    (typeof localStorage !== 'undefined' && localStorage.getItem('subday_perf') === '1') ||
    (typeof location !== 'undefined' && /(?:\?|&)perf=1\b/.test(location.search));

  useEffect(() => {
    if (!enabled) return;
    // Отчёт готовится в момент интерактива; поллим глобал, пока не появится.
    const id = setInterval(() => {
      const r = window.__subdayPerf;
      if (r) { setReport(r); clearInterval(id); }
    }, 200);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled || !report || hidden) return null;

  const row = (label: string, v: number | null | undefined, warn?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <b style={{ color: warn ? '#ff8a80' : '#b9f6ca' }}>{v == null ? '—' : v + ' мс'}</b>
    </div>
  );

  return (
    <div
      onClick={() => setHidden(true)}
      style={{
        position: 'fixed', left: 8, right: 8, bottom: 8, zIndex: 99999,
        background: 'rgba(20,24,20,0.94)', color: '#eaeaea', borderRadius: 12,
        padding: '10px 12px', font: '12px/1.5 ui-monospace,monospace',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)', maxWidth: 420, margin: '0 auto',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#7cb342' }}>subday · старт (тап чтобы скрыть)</div>
      {row('Парс JS (html→main)', report.bundle_parse_ms, report.bundle_parse_ms > 800)}
      {row('React mount', report.react_mount_ms)}
      {row('Auth готов', report.auth_ms)}
      {row('Прелоадер ушёл', report.preloader_done_ms)}
      {row('Готов к работе', report.interactive_ms)}
      {row('Завис после прелоадера', report.hang_after_preloader_ms, (report.hang_after_preloader_ms ?? 0) > 300)}
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.12)', opacity: 0.9 }}>
        {report.verdict}
      </div>
    </div>
  );
}
