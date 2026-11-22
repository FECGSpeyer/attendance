// Telegram Mini App "termin": sign out or report coming later with a reason.
// Opened from the card via https://t.me/<bot>/<app>?startapp=<card key>-x|l and served by
// GET on this function. All texts come from the server (server-texts.ts, tgapp.*).

export const MINIAPP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Attendix</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root {
    --bg: var(--tg-theme-bg-color, #ffffff);
    --text: var(--tg-theme-text-color, #1c1c1e);
    --hint: var(--tg-theme-hint-color, #8e8e93);
    /* Attendix primary (src/theme/variables.scss), not Telegram's button blue. */
    --accent: #438e96;
    --accent-text: #ffffff;
    --card: var(--tg-theme-secondary-bg-color, #f2f2f7);
    --danger: var(--tg-theme-destructive-text-color, #d93025);
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .hint { color: var(--hint); font-size: 14px; }
  .box { background: var(--card); border-radius: 12px; padding: 12px 14px; margin: 14px 0; }
  .seg { display: flex; gap: 8px; margin: 14px 0; }
  .seg button { flex: 1; padding: 10px; border-radius: 10px; border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: 15px; }
  .seg button.on { background: var(--accent); color: var(--accent-text); }
  label { display: block; font-weight: 600; margin: 14px 0 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chips button { border: none; border-radius: 16px; padding: 6px 12px; background: var(--card); color: var(--text); font-size: 14px; }
  .chips button.on { background: var(--accent); color: var(--accent-text); }
  textarea { width: 100%; min-height: 80px; border-radius: 10px; border: 1px solid var(--hint); background: var(--bg); color: var(--text); padding: 10px; font: inherit; }
  .send { width: 100%; margin-top: 16px; padding: 14px; border: none; border-radius: 12px; background: var(--accent); color: var(--accent-text); font-size: 16px; font-weight: 600; }
  .send:disabled { opacity: .5; }
  .error { color: var(--danger); margin-top: 10px; }
  .counts { white-space: pre-line; font-size: 14px; }
  .done { text-align: center; font-size: 18px; margin-top: 40px; }
</style>
</head>
<body>
<div id="app" class="hint">…</div>
<script>
(function () {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor('#438e96'); } catch (e) {}
  }
  var initData = (tg && tg.initData) || '';
  var api = location.origin + location.pathname;
  var app = document.getElementById('app');
  var state = null, mode = null, busy = false;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) { e.textContent = text; }
    return e;
  }
  function call(body) {
    return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function message(text, cls) {
    app.className = '';
    app.innerHTML = '';
    app.appendChild(el('div', { class: cls || 'done' }, text));
  }

  function render() {
    var T = state.texts;
    app.className = '';
    app.innerHTML = '';
    app.appendChild(el('h1', {}, state.title));
    app.appendChild(el('div', { class: 'hint' }, state.when + (state.place ? ' · ' + state.place : '')));
    var box = el('div', { class: 'box' });
    box.appendChild(el('div', {}, state.forText));
    box.appendChild(el('div', { class: 'hint' }, state.currentText));
    app.appendChild(box);
    if (state.countsText) {
      app.appendChild(el('div', { class: 'box counts' }, state.countsText));
    }

    var seg = el('div', { class: 'seg' });
    [['excused', T.modeExcused], ['late', T.modeLate]].forEach(function (m) {
      if (!state.allowed[m[0]]) { return; }
      var b = el('button', { type: 'button', class: mode === m[0] ? 'on' : '' }, m[1]);
      b.onclick = function () { mode = m[0]; render(); };
      seg.appendChild(b);
    });
    app.appendChild(seg);

    app.appendChild(el('label', { for: 'reason' }, T.reason));
    var chips = el('div', { class: 'chips' });
    var ta = el('textarea', { id: 'reason', maxlength: '300', placeholder: T.reasonPlaceholder });
    ta.value = state.reason || '';
    ta.oninput = function () { state.reason = ta.value; };
    (mode === 'late' ? state.reasons.late : state.reasons.absence).forEach(function (r) {
      var c = el('button', { type: 'button', class: state.reason === r ? 'on' : '' }, r);
      c.onclick = function () { state.reason = r; render(); };
      chips.appendChild(c);
    });
    app.appendChild(chips);
    app.appendChild(ta);

    var err = el('div', { class: 'error' }, state.error || '');
    var send = el('button', { type: 'button', class: 'send' }, T.send);
    send.disabled = busy;
    send.onclick = submit;
    app.appendChild(send);
    app.appendChild(err);
  }

  function submit() {
    if (busy) { return; }
    if (!(state.reason || '').trim()) { state.error = state.texts.reasonRequired; render(); return; }
    busy = true; state.error = ''; render();
    call({ action: 'webapp_submit', initData: initData, status: mode, reason: state.reason })
      .then(function (res) {
        busy = false;
        if (res.ok) {
          if (tg && tg.HapticFeedback) { try { tg.HapticFeedback.notificationOccurred('success'); } catch (e) {} }
          message(res.message);
          setTimeout(function () { if (tg) { tg.close(); } }, 1500);
        } else {
          state.error = res.message || ''; render();
        }
      })
      .catch(function () { busy = false; state.error = state.texts.failed; render(); });
  }

  call({ action: 'webapp_load', initData: initData })
    .then(function (res) {
      if (res.error) { message(res.message || res.error, 'done'); return; }
      state = res;
      mode = state.allowed[state.mode] ? state.mode : (state.allowed.excused ? 'excused' : 'late');
      render();
    })
    .catch(function () { message('⚠️'); });
})();
</script>
</body>
</html>
`;
