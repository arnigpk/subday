import { isVideoUrl } from './imageCompression';

/**
 * Ссылка на уменьшенную копию картинки через трансформацию Supabase Storage.
 *
 * Зачем: оригиналы в ленте весят под полмегабайта, а карточка шириной ~800px
 * столько не требует. На реальном файле: 440 КБ -> 119 КБ (в 3.7 раза меньше).
 *
 * Осознанно НЕ трогаем и возвращаем ссылку как есть, если:
 *   • это видео — они лежат в том же бакете, что и картинки, и трансформация
 *     их сломает (эндпоинт рассчитан только на изображения);
 *   • файл лежит НЕ на нашем сервере — часть старых постов ссылается на
 *     прежний хостед-проект Supabase, которым мы не управляем;
 *   • ссылка непубличная/нестандартная — преобразовывать нечего.
 *
 * На стороне вызова всегда должен быть запасной путь на оригинал (onError):
 * несуществующий файл трансформация отдаёт как 400, а не как картинку.
 */

const PUBLIC_OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_IMAGE_PATH = '/storage/v1/render/image/public/';

function ownStorageHost(): string | null {
  try {
    // Обёрнуто в try: если по какой-то причине окружения нет, функция должна
    // вернуть ссылку как есть, а не уронить рендер картинок исключением.
    const base = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL;
    return base ? new URL(base).host : null;
  } catch {
    return null;
  }
}

function isOwnStorageUrl(url: string): boolean {
  const host = ownStorageHost();
  if (!host) return false;
  try {
    return new URL(url).host === host;
  } catch {
    return false;
  }
}

export interface ThumbOptions {
  width?: number;
  quality?: number;
}

export function getThumbUrl(url: string | null | undefined, opts: ThumbOptions = {}): string {
  if (!url) return '';
  if (isVideoUrl(url)) return url;
  if (!isOwnStorageUrl(url)) return url;
  if (!url.includes(PUBLIC_OBJECT_PATH)) return url;

  const { width = 800, quality = 70 } = opts;
  const base = url.split('?')[0].replace(PUBLIC_OBJECT_PATH, RENDER_IMAGE_PATH);
  return `${base}?width=${width}&quality=${quality}`;
}
