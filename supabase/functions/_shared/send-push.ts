// supabase/functions/_shared/send-push.ts
// Shared helper for sending FCM push notifications via Firebase Cloud Messaging v1 API

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  platform: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
  }

  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const signInput = `${header}.${claimSet}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signInput)
  );

  const jwt = `${signInput}.${arrayBufferToBase64Url(signature)}`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${await tokenResponse.text()}`);
  }

  const tokenData = await tokenResponse.json();
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
  };

  return cachedAccessToken.token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<number> {
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, user_id, token, platform')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) {
    return 0;
  }

  const accessToken = await getAccessToken();
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID') || 'app-attendix';
  let sent = 0;

  for (const deviceToken of tokens as DeviceToken[]) {
    const message: any = {
      message: {
        token: deviceToken.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
      },
    };

    if (payload.data) {
      message.message.data = payload.data;
    }

    if (deviceToken.platform === 'android') {
      message.message.android = {
        priority: 'high',
        notification: { channel_id: 'default' },
      };
    } else if (deviceToken.platform === 'ios') {
      message.message.apns = {
        payload: { aps: { sound: 'default', badge: 1 } },
      };
    }

    try {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        }
      );

      if (response.ok) {
        sent++;
      } else {
        const errorData = await response.json();
        const errorCode = errorData?.error?.details?.[0]?.errorCode;

        // Remove invalid tokens
        if (errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') {
          await supabase
            .from('device_tokens')
            .delete()
            .eq('id', deviceToken.id);
          console.log(`Removed invalid token ${deviceToken.id}`);
        } else {
          console.error(`FCM send error for token ${deviceToken.id}:`, errorData);
        }
      }
    } catch (e) {
      console.error(`Error sending push to token ${deviceToken.id}:`, e);
    }
  }

  return sent;
}
