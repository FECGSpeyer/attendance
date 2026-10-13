// supabase/functions/_shared/attendix-email-templates.ts
// HTML templates for Attendix account emails (new account, added to instance,
// registration approved/rejected). The layout mirrors the Supabase Auth email
// templates (e.g. "Passwort zurücksetzen") so all Attendix mails look the same.

const APP_URL = 'https://attendix.de/';
const BRAND_COLOR = '#438e96';

export interface EmailContent {
  subject: string;
  html: string;
}

interface LayoutParams {
  title: string;
  preheader: string;
  heading: string;
  paragraphs: string[];        // already-escaped HTML
  button?: { text: string; url: string };
  footnote?: string;           // already-escaped HTML
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(p: LayoutParams): string {
  const paragraphs = p.paragraphs
    .map((text) => `<p style="margin:0 0 20px 0; font-size:15px; line-height:1.6; color:#4a4a4a;">${text}</p>`)
    .join('\n              ');

  const button = p.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
                <td align="center" style="padding:4px 0 20px 0;">
                  <a href="${escapeHtml(p.button.url)}" style="display:inline-block; background-color:${BRAND_COLOR}; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:14px 32px; border-radius:8px;">${escapeHtml(p.button.text)}</a>
                </td>
              </tr></table>
              <p style="margin:0; font-size:13px; line-height:1.6; color:#8a9295;">
                Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br />
                <a href="${escapeHtml(p.button.url)}" style="color:${BRAND_COLOR}; word-break:break-all;">${escapeHtml(p.button.url)}</a>
              </p>`
    : '';

  const footnote = p.footnote
    ? `<tr><td style="padding:16px 32px 32px 32px;">
              <p style="margin:0; font-size:13px; line-height:1.6; color:#8a9295;">
                ${p.footnote}
              </p>
            </td></tr>`
    : `<tr><td style="padding:0 0 24px 0;"></td></tr>`;

  return `<!DOCTYPE html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="color-scheme" content="light dark" />
      <title>${escapeHtml(p.title)}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f2f4f5; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#2b2b2b;">
      <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
        ${escapeHtml(p.preheader)}
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f5; padding:24px 0;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
            <tr><td align="center" style="background-color:${BRAND_COLOR}; padding:28px 24px;">
              <img src="https://www.attendix.de/assets/icon/favicon.png" alt="Attendix" width="48" height="48" style="display:block; margin:0 auto 12px auto; border-radius:10px;" />
              <span style="font-size:24px; font-weight:700; color:#ffffff; letter-spacing:0.5px;">Attendix</span>
            </td></tr>
            <tr><td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 16px 0; font-size:20px; font-weight:600; color:#2b2b2b;">${escapeHtml(p.heading)}</h1>
              ${paragraphs}
              ${button}
            </td></tr>
            ${footnote}
            <tr><td align="center" style="background-color:#f2f4f5; padding:20px 32px;">
              <p style="margin:0; font-size:12px; color:#8a9295;">© Attendix · <a href="${APP_URL}" style="color:${BRAND_COLOR}; text-decoration:none;">attendix.de</a></p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;
}

function greeting(name: string): string {
  return name ? `Hallo ${escapeHtml(name)},` : 'Hallo,';
}

/** New account: link to set the initial password (no password is ever mailed). */
export function registerEmail(p: { name: string; email: string; setPasswordUrl: string }): EmailContent {
  return {
    subject: 'Dein Zugang zur Attendix-App',
    html: layout({
      title: 'Attendix - Dein Zugang',
      preheader: 'Für dich wurde ein Attendix-Account angelegt.',
      heading: 'Willkommen bei Attendix',
      paragraphs: [
        `${greeting(p.name)}<br />für dich wurde ein Attendix-Account mit der E-Mail-Adresse <strong>${escapeHtml(p.email)}</strong> angelegt. Klicke auf den Button, um dein Passwort festzulegen und dich anzumelden.`,
      ],
      button: { text: 'Passwort festlegen', url: p.setPasswordUrl },
      footnote: 'Dieser Link ist aus Sicherheitsgründen nur begrenzte Zeit gültig. Ist er abgelaufen, kannst du auf der Anmeldeseite über „Passwort vergessen“ jederzeit einen neuen Link anfordern.',
    }),
  };
}

/** Existing account was added to another instance. */
export function informEmail(p: { name: string; tenant: string; role: string }): EmailContent {
  return {
    subject: 'Du wurdest zu einer Attendix-Instanz hinzugefügt',
    html: layout({
      title: 'Attendix - Neue Instanz',
      preheader: `Du wurdest zur Instanz ${p.tenant} hinzugefügt.`,
      heading: 'Neue Instanz',
      paragraphs: [
        `${greeting(p.name)}<br />du wurdest zu einer Attendix-Instanz hinzugefügt. Du kannst die Instanz einfach im Tab „Mehr“ wechseln.`,
        `Instanz: <strong>${escapeHtml(p.tenant)}</strong><br />Rolle: <strong>${escapeHtml(p.role)}</strong>`,
      ],
      button: { text: 'Zur App', url: APP_URL },
    }),
  };
}

/** Self-registration was approved. */
export function approveEmail(p: { name: string; tenant: string; role: string }): EmailContent {
  return {
    subject: `Deine Registrierung bei der Attendix Instanz '${p.tenant}' wurde genehmigt`,
    html: layout({
      title: 'Attendix - Registrierung genehmigt',
      preheader: `Deine Registrierung bei ${p.tenant} wurde genehmigt.`,
      heading: 'Registrierung genehmigt',
      paragraphs: [
        `${greeting(p.name)}<br />deine Registrierung wurde genehmigt! Logge dich jetzt ein, um Zugriff zur Instanz zu erhalten.`,
        `Instanz: <strong>${escapeHtml(p.tenant)}</strong><br />Rolle: <strong>${escapeHtml(p.role)}</strong>`,
      ],
      button: { text: 'Zur App', url: APP_URL },
    }),
  };
}

/** Self-registration was rejected. */
export function rejectEmail(p: { name: string; tenant: string }): EmailContent {
  return {
    subject: `Deine Registrierung bei der Attendix Instanz '${p.tenant}' wurde abgelehnt!`,
    html: layout({
      title: 'Attendix - Registrierung abgelehnt',
      preheader: `Deine Registrierung bei ${p.tenant} wurde abgelehnt.`,
      heading: 'Registrierung abgelehnt',
      paragraphs: [
        `${greeting(p.name)}<br />deine Registrierung wurde leider abgelehnt. Bitte kontaktiere den Administrator für weitere Informationen. Dein Account bei Attendix bleibt bestehen.`,
        `Instanz: <strong>${escapeHtml(p.tenant)}</strong>`,
      ],
    }),
  };
}
