// Shared FCM helpers for Supabase edge functions.
//
// Goals:
// - Tolerantly parse the FCM_SERVICE_ACCOUNT secret (handles wrapping quotes,
//   BOM, base64-encoded JSON, escaped \n in private_key).
// - Build the OAuth2 JWT for Google's token endpoint in a single, well-tested
//   place instead of duplicating the logic in every push function.
// - Return safe diagnostic info that can be logged WITHOUT leaking secrets,
//   so we can tell whether a failure is "key is broken" vs "code path is broken".

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  // Other fields exist (token_uri, etc.) but we don't need them.
  [key: string]: unknown;
}

export interface FcmDiagnostics {
  has_secret: boolean;
  parsed: boolean;
  has_project_id: boolean;
  has_client_email: boolean;
  has_private_key: boolean;
  client_email_domain: string | null;
  project_id: string | null;
  private_key_length: number;
  private_key_has_pem_markers: boolean;
  private_key_was_escaped: boolean;
  raw_starts_with: string;
}

export interface ParsedFcmSecret {
  serviceAccount: FcmServiceAccount | null;
  diagnostics: FcmDiagnostics;
  parseError: string | null;
}

export function parseFcmServiceAccount(rawSecret: string | undefined | null): ParsedFcmSecret {
  const diagnostics: FcmDiagnostics = {
    has_secret: !!rawSecret,
    parsed: false,
    has_project_id: false,
    has_client_email: false,
    has_private_key: false,
    client_email_domain: null,
    project_id: null,
    private_key_length: 0,
    private_key_has_pem_markers: false,
    private_key_was_escaped: false,
    raw_starts_with: '',
  };

  if (!rawSecret) {
    return { serviceAccount: null, diagnostics, parseError: 'FCM_SERVICE_ACCOUNT is not set' };
  }

  let raw = rawSecret.trim().replace(/^\uFEFF/, '');
  diagnostics.raw_starts_with = raw.slice(0, 1);

  // Strip wrapping quotes if user pasted the whole JSON quoted.
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }

  // If it doesn't look like JSON, try base64 decode.
  if (!raw.startsWith('{')) {
    try {
      const decoded = atob(raw.replace(/\s+/g, ''));
      if (decoded.trim().startsWith('{')) raw = decoded.trim();
    } catch (_) {
      // fall through
    }
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      serviceAccount: null,
      diagnostics,
      parseError: `FCM_SERVICE_ACCOUNT is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  diagnostics.parsed = true;
  diagnostics.has_project_id = typeof parsed?.project_id === 'string' && parsed.project_id.length > 0;
  diagnostics.has_client_email = typeof parsed?.client_email === 'string' && parsed.client_email.length > 0;
  diagnostics.has_private_key = typeof parsed?.private_key === 'string' && parsed.private_key.length > 0;
  diagnostics.project_id = diagnostics.has_project_id ? String(parsed.project_id) : null;
  if (diagnostics.has_client_email) {
    const at = String(parsed.client_email).split('@');
    diagnostics.client_email_domain = at.length === 2 ? at[1] : null;
  }
  if (diagnostics.has_private_key) {
    const pk: string = String(parsed.private_key);
    diagnostics.private_key_length = pk.length;
    diagnostics.private_key_was_escaped = pk.includes('\\n');
    diagnostics.private_key_has_pem_markers =
      pk.includes('-----BEGIN PRIVATE KEY-----') &&
      pk.includes('-----END PRIVATE KEY-----');
  }

  if (!diagnostics.has_project_id || !diagnostics.has_client_email || !diagnostics.has_private_key) {
    return {
      serviceAccount: null,
      diagnostics,
      parseError: 'FCM_SERVICE_ACCOUNT is missing project_id / client_email / private_key',
    };
  }

  return { serviceAccount: parsed as FcmServiceAccount, diagnostics, parseError: null };
}

function b64urlEncode(input: string | Uint8Array): string {
  const bin = typeof input === 'string'
    ? input
    : String.fromCharCode(...input);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function getFcmAccessToken(serviceAccount: FcmServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const headerB64 = b64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadB64 = b64urlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  // Normalize private_key: handle escaped \n and stray \r.
  const normalizedKey = String(serviceAccount.private_key)
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '');

  const pemContents = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  let binaryKey: Uint8Array;
  try {
    binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  } catch (_e) {
    throw new Error('FCM private_key is malformed (base64 decode failed). Re-paste the service account JSON.');
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey.buffer.slice(binaryKey.byteOffset, binaryKey.byteOffset + binaryKey.byteLength) as ArrayBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch (e) {
    throw new Error(
      `FCM private_key import failed: ${e instanceof Error ? e.message : String(e)}. ` +
      `Verify the JSON was pasted as plain text without modifications.`,
    );
  }

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signingInput);
  const signatureB64 = b64urlEncode(new Uint8Array(signature));

  const jwt = `${headerB64}.${payloadB64}.${signatureB64}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    const err = tokenData?.error || 'unknown';
    const desc = tokenData?.error_description || JSON.stringify(tokenData);
    throw new Error(`Google OAuth rejected the FCM key (${err}): ${desc}`);
  }
  return tokenData.access_token as string;
}

export interface FcmMessageOptions {
  title: string;
  body: string;
  data?: Record<string, string>;
  androidChannelId?: string;
}

export async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  opts: FcmMessageOptions,
): Promise<{ ok: boolean; status: number; error?: any }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: opts.title, body: opts.body },
          ...(opts.data ? { data: opts.data } : {}),
          // ВНИМАНИЕ: проверенный payload. Нестандартные поля
          // (default_sound/default_vibrate_timings/notification_priority)
          // ранее приводили к отклонению payload в FCM — их НЕ добавлять.
          // Вибрацию/heads-up на Android даёт сам канал (importance 5 + vibration).
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channel_id: opts.androidChannelId || 'default',
            },
          },
          // iOS: aps.sound = звук + вибрация (без него пуш приходит молча).
          // Минимальный валидный блок — проверен живым тестом на Android
          // (не ломает доставку).
          apns: {
            payload: {
              aps: { sound: 'default' },
            },
          },
        },
      }),
    },
  );
  if (res.ok) {
    await res.text();
    return { ok: true, status: res.status };
  }
  const err = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, error: err };
}

export function isInvalidFcmTokenError(err: any): boolean {
  if (!err) return false;
  if (err?.error?.code === 404) return true;
  const details = err?.error?.details;
  if (Array.isArray(details) && details.some((d: any) => d?.errorCode === 'UNREGISTERED')) {
    return true;
  }
  return false;
}
