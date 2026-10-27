// supabase/functions/_shared/attendix-email-templates.ts
// HTML templates for Attendix account emails (new account, added to instance,
// registration approved/rejected). The layout mirrors the Supabase Auth email
// templates (e.g. "Passwort zurücksetzen") so all Attendix mails look the same.

import { Lang, t } from './i18n.ts';

const APP_URL = 'https://attendix.de/';
const BRAND_COLOR = '#438e96';

export interface EmailContent {
  subject: string;
  html: string;
}

interface LayoutParams {
  lang: Lang;
  title: string;
  preheader: string;
  heading: string;
  paragraphs: string[];        // already-escaped HTML
  bodyHtml?: string;           // trusted, already-sanitized block HTML (Mitteilungen)
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
                ${t(p.lang, 'email.buttonFallback')}<br />
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
  <html lang="${p.lang}">
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
              ${p.bodyHtml ?? ''}
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

function greeting(lang: Lang, name: string): string {
  return name ? t(lang, 'email.helloName', { name: escapeHtml(name) }) : t(lang, 'email.hello');
}

function instanceLines(lang: Lang, tenant: string, role?: string): string {
  const instance = t(lang, 'email.instance', { tenant: escapeHtml(tenant) });
  return role ? `${instance}<br />${t(lang, 'email.role', { role: escapeHtml(role) })}` : instance;
}

/** New account: link to set the initial password (no password is ever mailed). */
export function registerEmail(p: {
  name: string;
  email: string;
  setPasswordUrl: string;
  tenant: string;
  role?: string;
}, lang: Lang = 'de'): EmailContent {
  return {
    subject: t(lang, 'email.register.subject'),
    html: layout({
      lang,
      title: t(lang, 'email.register.title'),
      preheader: t(lang, 'email.addedPreheader', { tenant: p.tenant }),
      heading: t(lang, 'email.register.heading'),
      paragraphs: [
        `${greeting(lang, p.name)}<br />${t(lang, 'email.register.text', { email: escapeHtml(p.email) })}`,
        instanceLines(lang, p.tenant, p.role),
      ],
      button: { text: t(lang, 'email.register.button'), url: p.setPasswordUrl },
      footnote: t(lang, 'email.register.footnote'),
    }),
  };
}

/** Existing account was added to another instance. */
export function informEmail(p: { name: string; tenant: string; role: string }, lang: Lang = 'de'): EmailContent {
  return {
    subject: t(lang, 'email.inform.subject'),
    html: layout({
      lang,
      title: t(lang, 'email.inform.title'),
      preheader: t(lang, 'email.addedPreheader', { tenant: p.tenant }),
      heading: t(lang, 'email.inform.heading'),
      paragraphs: [
        `${greeting(lang, p.name)}<br />${t(lang, 'email.inform.text')}`,
        instanceLines(lang, p.tenant, p.role),
      ],
      button: { text: t(lang, 'email.toApp'), url: APP_URL },
    }),
  };
}

/** Self-registration was approved. */
export function approveEmail(p: { name: string; tenant: string; role: string }, lang: Lang = 'de'): EmailContent {
  return {
    subject: t(lang, 'email.approve.subject', { tenant: p.tenant }),
    html: layout({
      lang,
      title: t(lang, 'email.approve.title'),
      preheader: t(lang, 'email.approve.preheader', { tenant: p.tenant }),
      heading: t(lang, 'email.approve.heading'),
      paragraphs: [
        `${greeting(lang, p.name)}<br />${t(lang, 'email.approve.text')}`,
        instanceLines(lang, p.tenant, p.role),
      ],
      button: { text: t(lang, 'email.toApp'), url: APP_URL },
    }),
  };
}

/** Self-registration was rejected. */
export function rejectEmail(p: { name: string; tenant: string }, lang: Lang = 'de'): EmailContent {
  return {
    subject: t(lang, 'email.reject.subject', { tenant: p.tenant }),
    html: layout({
      lang,
      title: t(lang, 'email.reject.title'),
      preheader: t(lang, 'email.reject.preheader', { tenant: p.tenant }),
      heading: t(lang, 'email.reject.heading'),
      paragraphs: [
        `${greeting(lang, p.name)}<br />${t(lang, 'email.reject.text')}`,
        instanceLines(lang, p.tenant),
      ],
    }),
  };
}

/** General message (Mitteilung) from an admin/responsible to all members. */
export function messageEmail(p: {
  title: string;
  bodyHtml: string;            // from message-render.ts renderHtml(.., { email: true })
  preview: string;
  senderName: string;
  tenant: string;
  url: string;
}, lang: Lang = 'de'): EmailContent {
  const from = p.senderName
    ? t(lang, 'email.message.from', { sender: escapeHtml(p.senderName), tenant: escapeHtml(p.tenant) })
    : t(lang, 'email.message.fromTenant', { tenant: escapeHtml(p.tenant) });
  return {
    subject: p.title,
    html: layout({
      lang,
      title: `Attendix - ${p.title}`,
      preheader: p.preview,
      heading: p.title,
      paragraphs: [`<span style="font-size:13px; color:#8a9295;">${from}</span>`],
      bodyHtml: p.bodyHtml,
      button: { text: t(lang, 'email.openInApp'), url: p.url },
      footnote: t(lang, 'email.message.footnote', { tenant: escapeHtml(p.tenant) }),
    }),
  };
}
