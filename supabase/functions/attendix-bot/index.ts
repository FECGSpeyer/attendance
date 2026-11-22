// supabase/functions/attendix-bot/index.ts
// Deploy: supabase functions deploy attendix-bot --no-verify-jwt
// Telegram webhook for @attendix_bot.
//
// The app links an account via https://t.me/attendix_bot?start=<userId>
// (notifications.page.ts → connectTelegram). Telegram then posts
// "/start <userId>" here and we store the chat id in notifications.telegram_chat_id.
//
// Rebuilt on 23.10.2026: the deployed source could not be downloaded from
// Supabase Cloud anymore.
//
// Optional secret TELEGRAM_WEBHOOK_SECRET: when set, requests must carry the
// same value in X-Telegram-Bot-Api-Secret-Token (pass it as secret_token to setWebhook).
//
// Termin card in Telegram groups (22.11.2026, table telegram_cards, supabase/sql/telegram_cards.sql):
// POST { action: 'card_link', attendanceId }  (app, with the user's JWT) → { url }:
//      https://t.me/<bot>?startgroup=c<attendanceId>_<signature>. Telegram lets the leader pick a
//      group, adds the bot and posts "/start@<bot> c…" there; the bot then posts the card.
// Card buttons: "Zusagen" (callback p:<key>) signs in right away, "Später" / "Absagen" open the
//      Mini App (t.me/<bot>/<app>?startapp=<key>-l|x) to give a reason, "Aktualisieren" (r:<key>).
// GET                                          the Mini App page (miniapp.ts).
// POST { action: 'webapp_load' | 'webapp_submit', initData, … }   Mini App calls, signed by Telegram.
// A Telegram user is a person when an account with notifications.telegram_chat_id = their
// Telegram id has a person in the Termin's tenant (the normal Telegram link in the app).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Lang, normalizeLang, t } from '../_shared/i18n.ts';
import { applySelfStatus, LoadedAttendance, reasonsOf, SelfStatus } from '../_shared/self-status.ts';
import {
  BOT_USERNAME,
  CardRow,
  cardTitle,
  cardWhen,
  loadCardAttendance,
  personsForTelegramUser,
  renderCard,
} from './card.ts';
import { MINIAPP_HTML } from './miniapp.ts';
import { cardSignature, randomKey, tg, verifyCardSignature, verifyInitData } from './telegram.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_START_RE = /^\/start(?:@\w+)?\s+c(\d{1,15})_([A-Za-z0-9_-]{16})$/;
// Roles that manage a Termin in the app (Role in src/app/utilities/constants.ts).
const MANAGER_ROLES = [1, 4, 5, 8, 9];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function reply(token: string, chatId: number, text: string): Promise<void> {
  await tg(token, 'sendMessage', { chat_id: chatId, text });
}

// ---------------------------------------------------------------------------
// Account link (private chat)

async function handleLink(token: string, chatId: number, text: string, lang: Lang): Promise<void> {
  const userId = text.split(/\s+/)[1] ?? '';
  if (!UUID_RE.test(userId)) {
    await reply(token, chatId, t(lang, 'bot.welcome'));
    return;
  }
  const { data, error } = await supabase
    .from('notifications')
    .update({ telegram_chat_id: String(chatId) })
    .eq('id', userId)
    .select('id, language');

  if (error) {
    console.error('Failed to store chat id:', error);
    await reply(token, chatId, t(lang, 'bot.failed'));
  } else if (!data?.length) {
    await reply(token, chatId, t(lang, 'bot.notFound'));
  } else {
    if (data[0].language) lang = normalizeLang(data[0].language);
    await reply(token, chatId, t(lang, 'bot.linked'));
  }
}

// ---------------------------------------------------------------------------
// Card

async function postCard(token: string, chatId: number, attendanceId: number, sig: string, lang: Lang): Promise<void> {
  if (!(await verifyCardSignature(token, attendanceId, sig))) {
    await reply(token, chatId, t(lang, 'tgcard.invalidLink'));
    return;
  }
  const { data: att } = await supabase.from('attendance').select('id, tenantId').eq('id', attendanceId).maybeSingle();
  const loaded = att ? await loadCardAttendance(supabase, { attendance_id: att.id, tenant_id: att.tenantId }) : null;
  if (!att || !loaded) {
    await reply(token, chatId, t(lang, 'tgcard.notFound'));
    return;
  }
  const key = randomKey();
  const sent = await tg(token, 'sendMessage', { chat_id: chatId, ...(await renderCard(supabase, loaded, key)) });
  if (!sent?.message_id) { return; }
  const { error } = await supabase.from('telegram_cards').insert({
    key,
    attendance_id: att.id,
    tenant_id: att.tenantId,
    chat_id: chatId,
    message_id: sent.message_id,
  });
  if (error) { console.error('telegram_cards insert failed', error); }
}

async function cardByKey(key: string): Promise<CardRow | null> {
  if (!/^[A-Za-z0-9]{6,32}$/.test(key)) { return null; }
  const { data } = await supabase
    .from('telegram_cards')
    .select('id, key, attendance_id, tenant_id, chat_id, message_id')
    .eq('key', key)
    .maybeSingle();
  return (data as CardRow | null) ?? null;
}

async function refreshCard(token: string, card: CardRow, loaded?: LoadedAttendance | null): Promise<void> {
  const fresh = loaded ?? await loadCardAttendance(supabase, card);
  if (!fresh) { return; }
  await tg(token, 'editMessageText', {
    chat_id: card.chat_id,
    message_id: card.message_id,
    ...(await renderCard(supabase, fresh, card.key)),
  });
  await supabase.from('telegram_cards').update({ updated_at: new Date().toISOString() }).eq('id', card.id);
}

function errorText(lang: Lang, error: string): string {
  switch (error) {
    case 'deadline': return t(lang, 'tgcard.deadlineError');
    case 'past': return t(lang, 'tgcard.pastError');
    case 'not_allowed': return t(lang, 'tgcard.notAllowed');
    case 'not_invited': return t(lang, 'tgcard.notInvited');
    case 'reason_required': return t(lang, 'tgapp.reasonRequired');
    default: return t(lang, 'tgcard.failed');
  }
}

async function handleCallback(token: string, query: any): Promise<void> {
  const answer = (text: string, alert = false) =>
    tg(token, 'answerCallbackQuery', { callback_query_id: query.id, text, show_alert: alert });
  let lang = normalizeLang(query.from?.language_code);
  const [kind, key] = String(query.data ?? '').split(':');
  const card = await cardByKey(key ?? '');
  const loaded = card ? await loadCardAttendance(supabase, card) : null;
  if (!card || !loaded) {
    await answer(t(lang, 'tgcard.notFound'), true);
    return;
  }

  if (kind === 'r') {
    await refreshCard(token, card, loaded);
    await answer(t(lang, 'tgcard.refreshed'));
    return;
  }
  if (kind !== 'p') {
    await answer('');
    return;
  }

  const who = await personsForTelegramUser(supabase, Number(query.from?.id), loaded);
  if (who.lang) { lang = who.lang; }
  if (!who.linked) {
    await answer(t(lang, 'tgcard.notLinked'), true);
    return;
  }
  if (!who.persons.length) {
    await answer(t(lang, 'tgcard.notInvited'), true);
    return;
  }

  const open = who.persons.filter(p => p.status !== 1);
  if (!open.length) {
    await answer(t(lang, 'tgcard.alreadyIn'));
    return;
  }
  const done: string[] = [];
  let lastError = '';
  for (const p of open) {
    const result = await applySelfStatus(supabase, loaded, p.personId, 'present', '', 'attendix-bot');
    if (result.ok) { done.push(p.name); } else { lastError = result.error ?? 'write_failed'; }
  }
  if (done.length) {
    await refreshCard(token, card);
    await answer(who.persons.length > 1 ? t(lang, 'tgcard.signedInFor', { names: done.join(', ') }) : t(lang, 'tgcard.signedIn'));
  } else {
    await answer(errorText(lang, lastError), true);
  }
}

// ---------------------------------------------------------------------------
// App: link to post a card

async function handleCardLink(req: Request, body: Record<string, unknown>, token: string): Promise<Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = jwt ? await supabase.auth.getUser(jwt) : { data: null };
  const userId = auth?.user?.id;
  if (!userId) { return json({ error: 'unauthorized' }, 401); }

  const attendanceId = Number(body.attendanceId);
  if (!Number.isInteger(attendanceId)) { return json({ error: 'not_found' }, 404); }
  const { data: att } = await supabase.from('attendance').select('id, tenantId').eq('id', attendanceId).maybeSingle();
  if (!att) { return json({ error: 'not_found' }, 404); }
  const { data: tu } = await supabase
    .from('tenantUsers')
    .select('role')
    .eq('tenantId', att.tenantId)
    .eq('userId', userId)
    .maybeSingle();
  if (!tu || !MANAGER_ROLES.includes(Number(tu.role))) { return json({ error: 'forbidden' }, 403); }

  const sig = await cardSignature(token, att.id);
  return json({ url: `https://t.me/${BOT_USERNAME}?startgroup=c${att.id}_${sig}` });
}

// ---------------------------------------------------------------------------
// Mini App

function appTexts(lang: Lang): Record<string, string> {
  const keys = ['modeExcused', 'modeLate', 'reason', 'reasonPlaceholder', 'send', 'reasonRequired'];
  const texts: Record<string, string> = Object.fromEntries(keys.map(k => [k, t(lang, `tgapp.${k}`)]));
  texts.failed = t(lang, 'tgcard.failed');
  return texts;
}

async function webAppContext(token: string, body: Record<string, unknown>, fallbackLang: Lang) {
  const session = await verifyInitData(token, String(body.initData ?? ''));
  if (!session) { return { error: json({ error: 'no_session', message: t(fallbackLang, 'tgapp.openInTelegram') }) }; }
  let lang = normalizeLang(session.languageCode);
  const m = /^([A-Za-z0-9]{6,32})-([xl])$/.exec(session.startParam);
  const card = m ? await cardByKey(m[1]) : null;
  const loaded = card ? await loadCardAttendance(supabase, card) : null;
  if (!card || !loaded) { return { error: json({ error: 'not_found', message: t(lang, 'tgcard.notFound') }) }; }
  const who = await personsForTelegramUser(supabase, session.userId, loaded);
  if (who.lang) { lang = who.lang; }
  if (!who.linked) { return { error: json({ error: 'not_linked', message: t(lang, 'tgcard.notLinked') }) }; }
  if (!who.persons.length) { return { error: json({ error: 'not_invited', message: t(lang, 'tgcard.notInvited') }) }; }
  return { lang, card, loaded, persons: who.persons, mode: (m![2] === 'l' ? 'late' : 'excused') as SelfStatus };
}

async function handleWebAppLoad(token: string, body: Record<string, unknown>, fallbackLang: Lang): Promise<Response> {
  const ctx = await webAppContext(token, body, fallbackLang);
  if ('error' in ctx) { return ctx.error!; }
  const { lang, loaded, persons, mode } = ctx;
  const { rules } = loaded;
  // Signing out / coming later is blocked once a person is excused or absent (allowedActions);
  // offer what at least one of the persons may still do.
  const blocked = (s: number) => s === 2 || s === 4;
  const anyOpen = persons.some(p => !blocked(p.status));
  const allowed = {
    excused: !rules.past && rules.allowExcuse && anyOpen,
    late: !rules.past && rules.allowLate && anyOpen,
  };
  if (!allowed.excused && !allowed.late) {
    return json({ error: 'not_allowed', message: t(lang, rules.past ? 'tgcard.pastError' : 'tgapp.nothingAllowed') });
  }
  const statusText = persons
    .map(p => (persons.length > 1 ? `${p.name}: ` : '') + t(lang, `tgapp.status${p.status}`) + (p.notes ? ` (${p.notes})` : ''))
    .join(', ');
  return json({
    texts: appTexts(lang),
    title: cardTitle(loaded.a),
    when: cardWhen(lang, loaded),
    place: loaded.a.place || null,
    forText: t(lang, 'tgapp.for', { names: persons.map(p => p.name).join(', ') }),
    currentText: t(lang, 'tgapp.current', { status: statusText }),
    mode,
    allowed,
    reasons: reasonsOf(loaded.a),
  });
}

async function handleWebAppSubmit(token: string, body: Record<string, unknown>, fallbackLang: Lang): Promise<Response> {
  const ctx = await webAppContext(token, body, fallbackLang);
  if ('error' in ctx) { return ctx.error!; }
  const { lang, card, loaded, persons } = ctx;
  const wanted = body.status;
  if (wanted !== 'late' && wanted !== 'excused') { return json({ error: 'invalid_status', message: t(lang, 'tgcard.failed') }); }
  if (!String(body.reason ?? '').trim()) { return json({ error: 'reason_required', message: t(lang, 'tgapp.reasonRequired') }); }

  let saved = 0;
  let lastError = '';
  for (const p of persons) {
    const result = await applySelfStatus(supabase, loaded, p.personId, wanted, body.reason, 'attendix-bot');
    if (result.ok) { saved++; } else { lastError = result.error ?? 'write_failed'; }
  }
  if (!saved) { return json({ error: lastError, message: errorText(lang, lastError) }); }
  await refreshCard(token, card!);
  return json({ ok: true, message: t(lang, 'tgapp.saved') });
}

// ---------------------------------------------------------------------------

async function handleUpdate(token: string, update: any): Promise<void> {
  if (update?.callback_query) {
    await handleCallback(token, update.callback_query);
    return;
  }
  const message = update?.message;
  const chatId: number | undefined = message?.chat?.id;
  const text: string = (message?.text ?? '').trim();
  const isPrivate = message?.chat?.type === 'private';
  // Before linking only Telegram's own language setting is known.
  const lang = normalizeLang(message?.from?.language_code);
  if (!chatId) { return; }

  const card = CARD_START_RE.exec(text);
  if (card) {
    await postCard(token, chatId, Number(card[1]), card[2], lang);
    return;
  }
  // In groups the bot stays quiet (joins, other commands, replies).
  if (!isPrivate) { return; }
  if (!text.startsWith('/start')) {
    await reply(token, chatId, t(lang, 'bot.hello'));
    return;
  }
  await handleLink(token, chatId, text, lang);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method === 'GET') {
    return new Response(MINIAPP_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN not configured');
    return new Response('ok');
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  // Calls from the app and the Mini App carry an action; Telegram updates never do.
  if (typeof body?.action === 'string') {
    const fallbackLang = normalizeLang(req.headers.get('Accept-Language'));
    try {
      if (body.action === 'card_link') { return await handleCardLink(req, body, token); }
      if (body.action === 'webapp_load') { return await handleWebAppLoad(token, body, fallbackLang); }
      if (body.action === 'webapp_submit') { return await handleWebAppSubmit(token, body, fallbackLang); }
      return json({ error: 'invalid_action' }, 400);
    } catch (err) {
      console.error('attendix-bot action failed:', err);
      return json({ error: 'failed', message: t(fallbackLang, 'tgcard.failed') }, 500);
    }
  }

  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (webhookSecret && req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    await handleUpdate(token, body);
  } catch (err) {
    console.error('Error in attendix-bot:', err);
  }
  // Always answer 200, otherwise Telegram keeps retrying the update.
  return new Response('ok');
});
