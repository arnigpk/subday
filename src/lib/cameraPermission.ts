import { Capacitor } from '@capacitor/core';

// Общий ключ с QR-сканером партнёра: системное разрешение одно на приложение,
// выдал один раз (в сканере или в сториз) — больше не спрашиваем нигде.
const CAMERA_GRANTED_KEY = 'qr_camera_granted';

/**
 * Запрашивает разрешение на камеру ПО ФАКТУ использования (натив).
 * Запоминает выдачу — повторно не спрашивает. На вебе всегда true
 * (браузер сам спросит при обращении к камере).
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    if (localStorage.getItem(CAMERA_GRANTED_KEY) === 'true') return true;
  } catch { /* ignore */ }
  try {
    const { Camera } = await import('@capacitor/camera');
    let status = await Camera.checkPermissions();
    if (status.camera !== 'granted') {
      status = await Camera.requestPermissions({ permissions: ['camera'] });
    }
    const ok = status.camera === 'granted';
    if (ok) {
      try { localStorage.setItem(CAMERA_GRANTED_KEY, 'true'); } catch { /* ignore */ }
    }
    return ok;
  } catch {
    // Не блокируем пользователя, если проверка не удалась — пусть система решит.
    return true;
  }
}
