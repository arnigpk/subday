// Лёгкие замеры холодного старта (Слой 4). Нулевой оверхед: только запись
// временных меток в глобальный массив + один отчёт в консоль когда приложение
// стало интерактивным. Видно двумя способами:
//   1) удалённая отладка (Android chrome://inspect / iOS Safari Web Inspector) —
//      строка «[subday perf]» + таблица в консоли;
//   2) на самом устройстве — оверлей, если включён флаг localStorage.subday_perf='1'
//      (переключается 7 быстрыми тапами по флагу 🇰🇿 на главной).
//
// Все времена — миллисекунды от НАЧАЛА документа (первая метка 'html' в index.html).

type Mark = [name: string, t: number];

declare global {
  interface Window {
    __perf?: Mark[];
    __subdayPerf?: PerfReport;
  }
}

export interface PerfReport {
  total_ms: number;
  bundle_parse_ms: number;   // html → main (скачивание уже локальное, это ЧИСТО парс/компиляция JS)
  react_mount_ms: number;    // main → app-mount
  auth_ms: number | null;    // html → auth-ready
  preloader_done_ms: number | null;
  interactive_ms: number | null;
  hang_after_preloader_ms: number | null; // «завис после прелоадера»: interactive − preloader-done
  verdict: string;
  marks: { mark: string; at_ms: number; delta_ms: number }[];
}

export function perfMark(name: string): void {
  try {
    (window.__perf ||= []).push([name, performance.now()]);
  } catch { /* ignore */ }
}

function at(name: string): number | undefined {
  return (window.__perf || []).find(m => m[0] === name)?.[1];
}

let reported = false;

export function perfReport(): PerfReport | undefined {
  if (reported) return window.__subdayPerf;
  const marks = window.__perf || [];
  if (marks.length < 2) return;
  reported = true;

  const t0 = marks[0][1];
  const rel = (t?: number) => (t == null ? null : Math.round(t - t0));

  const html = t0;
  const main = at('main');
  const mount = at('app-mount');
  const auth = at('auth-ready');
  const preloader = at('preloader-done');
  const interactive = at('interactive');

  const report: PerfReport = {
    total_ms: Math.round(marks[marks.length - 1][1] - t0),
    bundle_parse_ms: main != null ? Math.round(main - html) : -1,
    react_mount_ms: main != null && mount != null ? Math.round(mount - main) : -1,
    auth_ms: rel(auth),
    preloader_done_ms: rel(preloader),
    interactive_ms: rel(interactive),
    hang_after_preloader_ms:
      interactive != null && preloader != null ? Math.round(interactive - preloader) : null,
    verdict: '',
    marks: marks.map((m, i) => ({
      mark: m[0],
      at_ms: Math.round(m[1] - t0),
      delta_ms: i === 0 ? 0 : Math.round(m[1] - marks[i - 1][1]),
    })),
  };

  const hang = report.hang_after_preloader_ms ?? 0;
  report.verdict =
    hang > 300 ? `⚠ После прелоадера ещё ${hang} мс пустого фона (auth/telegram не успели за таймер). Тут и тормозит.`
    : report.bundle_parse_ms > 800 ? `⚠ Парс JS ${report.bundle_parse_ms} мс — главный кандидат на оптимизацию (Слой 3/1).`
    : '✅ После прелоадера приложение готово почти сразу.';

  window.__subdayPerf = report;
  // eslint-disable-next-line no-console
  console.log('%c[subday perf] ' + report.verdict, 'font-weight:bold;color:#7cb342', report);
  // eslint-disable-next-line no-console
  console.table(report.marks);
  return report;
}
