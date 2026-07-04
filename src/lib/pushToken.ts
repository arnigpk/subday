import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

/**
 * Единая логика device-токена push-уведомлений.
 *
 * Ключевая идея «настоящего» тумблера Push: если пользователь ЯВНО выключил
 * уведомления (opt-out), мы удаляем его токен из device_tokens — сервер просто
 * перестаёт слать пуши на это устройство (менять edge-функции не нужно). Пока
 * opt-out активен, токен не сохраняется повторно, даже если сработает register().
 */

const OPT_OUT_KEY = 'subday_push_opt_out';
const DEVICE_TOKEN_KEY = 'subday_device_token';

export function isPushOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPushOptedOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignore */
  }
}

/** Сохраняет токен в БД. Игнорируется, если пользователь выключил push. */
export async function saveDeviceToken(token: string, platform: string): Promise<void> {
  if (isPushOptedOut()) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let oldToken: string | null = null;
    try { oldToken = localStorage.getItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }

    // RPC (SECURITY DEFINER): перепривязывает токен к текущему аккаунту при смене
    // владельца устройства и удаляет прежний токен этого устройства при ротации —
    // одно устройство никогда не получает пуш дважды.
    const { error } = await (supabase as any).rpc('register_device_token', {
      _token: token,
      _platform: platform,
      _old_token: oldToken && oldToken !== token ? oldToken : null,
    });
    if (error) {
      // Фолбэк на прямой upsert (если RPC ещё не задеплоена)
      await (supabase.from('device_tokens') as any).upsert(
        { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' },
      );
    }
    try { localStorage.setItem(DEVICE_TOKEN_KEY, token); } catch { /* ignore */ }
  } catch (err) {
    console.error('[pushToken] Failed to save device token:', err);
  }
}

/**
 * Удаляет токен ЭТОГО устройства. Если локально токен неизвестен — удаляем токены
 * только ТЕКУЩЕЙ платформы (android/ios/web), но НИКОГДА не все токены пользователя:
 * выключение пуша на iPhone не должно отключать пуши на Android (и наоборот).
 */
export async function deleteThisDeviceToken(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    let token = '';
    try { token = localStorage.getItem(DEVICE_TOKEN_KEY) || ''; } catch { /* ignore */ }
    if (token) {
      await supabase.from('device_tokens').delete().eq('user_id', user.id).eq('token', token);
    } else {
      const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
      await supabase.from('device_tokens').delete().eq('user_id', user.id).eq('platform', platform);
    }
    try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
  } catch (err) {
    console.error('[pushToken] Failed to delete device token:', err);
  }
}
