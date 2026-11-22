// Small helpers for the Telegram Bot API and Mini App sign-in.

export async function tg(token: string, method: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    // "message is not modified" is expected when a refresh changes nothing.
    const description = String(data?.description ?? '');
    if (!description.includes('message is not modified')) {
      console.error(`Telegram ${method} failed:`, res.status, description);
    }
    return null;
  }
  return data.result;
}

async function hmac(key: BufferSource, text: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text));
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) { return false; }
  let diff = 0;
  for (let i = 0; i < a.length; i++) { diff |= a.charCodeAt(i) ^ b.charCodeAt(i); }
  return diff === 0;
}

/**
 * Signature for the "send card" link (startgroup parameter), so only Attendix can
 * create a card for a Termin. Keyed with the bot token, which only the server knows.
 */
export async function cardSignature(token: string, attendanceId: number): Promise<string> {
  const sig = await hmac(new TextEncoder().encode(token), `card:${attendanceId}`);
  return base64url(sig).slice(0, 16);
}

export async function verifyCardSignature(token: string, attendanceId: number, sig: string): Promise<boolean> {
  return sameText(await cardSignature(token, attendanceId), sig);
}

export interface WebAppSession {
  userId: number;
  languageCode: string | null;
  startParam: string;
}

/**
 * Checks Telegram.WebApp.initData as described in
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function verifyInitData(token: string, initData: string, maxAgeSeconds = 24 * 60 * 60): Promise<WebAppSession | null> {
  if (!initData || initData.length > 4096) { return null; }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') ?? '';
  params.delete('hash');
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), token);
  if (!sameText(hex(await hmac(secret, check)), hash)) { return null; }
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) { return null; }
  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    if (!user || typeof user.id !== 'number') { return null; }
    return { userId: user.id, languageCode: user.language_code ?? null, startParam: params.get('start_param') ?? '' };
  } catch {
    return null;
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function randomKey(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
