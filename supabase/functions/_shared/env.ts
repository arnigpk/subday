// Доступ к секретам в edge-функциях, устойчивый к self-hosted.
// На self-hosted subday секреты приходят в заголовке x-worker-env, а НЕ в Deno.env.
// Каждая функция в начале обработки вызывает setWorkerEnv(workerEnv) — после этого
// любой код (в т.ч. глубоко в _shared, куда workerEnv не прокинут) читает секрет
// через getEnv(), не завися от того, дошёл ли он в Deno.env.

let _extraEnv: Record<string, string> = {};

/** Запомнить окружение из заголовка x-worker-env (вызывать в начале каждой функции). */
export function setWorkerEnv(e: Record<string, string> | null | undefined): void {
  if (e && typeof e === 'object') _extraEnv = e;
}

/** Секрет: сначала Deno.env, затем x-worker-env. */
export function getEnv(name: string): string | undefined {
  try { const v = Deno.env.get(name); if (v) return v; } catch { /* ignore */ }
  return _extraEnv[name];
}
