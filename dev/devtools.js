/*
 * Developer tools — copied into www/js/ ONLY for `npm run build:dev` and `npm run build:beta`.
 * `npm run build:release` deletes it, so release builds contain no developer panel at all.
 *   dev  : a small 🛠 button is always visible
 *   beta : hidden until the version number in Me is tapped 7 times
 * Seeded entries are flagged {seed:true} so "Clear all test data" removes only those.
 */
(function () {
  'use strict';
  var App = window.AOApp, N = window.AONudges, P = window.AOPlatform;
  if (!App || !N || !P) return;
  var DAY = 864e5, H = 36e5;
  var MOODS = ['', 'Stormy', 'Heavy', 'Steady', 'Lifted', 'Radiant'];

  function $(id) { return document.getElementById(id); }
  function fmt(ms) { return new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function now() { return App.now(); }
  function seed(list) { list.forEach(function (x) { App.logMood(x.mood, x.ts, { seed: true }); }); return App.saveNow().then(App.reschedule).then(function () { App.draw(); render(); }); }
  function lastWeekday(wd, k, h, m) { var d = new Date(now()), back = ((d.getDay() - wd + 7) % 7) || 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back - 7 * k, h, m || 0).getTime(); }

  var PRESETS = {
    sundays: { label: '3 Heavy Sundays around 5pm', run: function () { return seed([[16, 50], [17, 0], [17, 10]].map(function (t, k) { return { mood: 2, ts: lastWeekday(0, k, t[0], t[1]) }; })); } },
    away8: { label: 'No logs for 8 days', run: function () {
      /* the newest real or seeded log becomes 8 days old by moving the clock forward */
      var logs = App.moodLogs(), last = logs.length ? Math.max.apply(null, logs.map(function (l) { return l.ts; })) : Date.now();
      App.setOffset(Math.max(0, last + 8 * DAY - Date.now()));
      return App.reschedule().then(function () { App.draw(); render(); });
    } },
    mornings: { label: 'Logs every morning at 8am for 2 weeks', run: function () {
      var out = []; for (var i = 1; i <= 14; i++) { var d = new Date(now()); out.push({ mood: 3 + (i % 2), ts: new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 8, (i * 7) % 20).getTime() }); }
      return seed(out);
    } },
    stormy: { label: 'Stormy yesterday', run: function () { var d = new Date(now()); return seed([{ mood: 1, ts: new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 20, 0).getTime() }]); } }
  };

  function testNudge(type) {
    var bodies = { pattern: N.COPY.pattern[0]('evening'), daily: N.COPY.evening[0], dayAfter: N.COPY.dayAfter[0], away: N.COPY.away[3] };
    var extra = { type: type, test: true };
    if (type === 'pattern') { extra.weekday = new Date().getDay(); extra.minutes = 17 * 60; }
    return P.notify.permission().then(function (perm) { return perm === 'granted' ? perm : P.notify.request(); }).then(function (perm) {
      if (perm !== 'granted') { status('Notifications are not allowed for this app yet.'); return; }
      var id = 100 + Math.floor(Math.random() * 800);       // < 1000: rescheduleAll leaves test nudges alone
      return P.notify.schedule([{ id: id, at: Date.now() + 10000, title: 'Anxiously Okay', body: bodies[type], actionTypeId: N.ACTION_TYPE, extra: extra }])
        .then(function () { status('Test ' + type + ' nudge in 10 seconds. Lock the phone or leave the app to see it.'); });
    });
  }

  function clearSeeded() {
    var S = App.state(), n = 0;
    Object.keys(S.moodHist).forEach(function (k) {
      var arr = Array.isArray(S.moodHist[k]) ? S.moodHist[k] : null; if (!arr) return;
      var kept = arr.filter(function (e) { if (e && e.seed) { n++; return false; } return true; });
      if (kept.length) S.moodHist[k] = kept; else delete S.moodHist[k];
    });
    App.setOffset(0);
    return App.saveNow().then(App.reschedule).then(function () { App.draw(); status('Removed ' + n + ' seeded entr' + (n === 1 ? 'y' : 'ies') + ' and reset time travel.'); render(); });
  }

  var lastStatus = '';
  function status(t) { lastStatus = t; var el = $('aod-status'); if (el) el.textContent = t; }

  function render() {
    var box = $('aod-box'); if (!box) return;
    var S = App.state(), off = App.offset(), seeded = 0;
    Object.keys(S.moodHist).forEach(function (k) { (Array.isArray(S.moodHist[k]) ? S.moodHist[k] : []).forEach(function (e) { if (e && e.seed) seeded++; }); });
    var preview = N.computeNudges({ now: now(), logs: App.moodLogs(), settings: S.nudge, suppressed: {}, lastOpen: now() });
    var btn = 'style="padding:8px 10px;border-radius:10px;border:1px solid var(--bdr);background:var(--bg);color:var(--text);font-size:12px;cursor:pointer;margin:0 6px 6px 0"';
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-size:15px;font-weight:600;color:var(--text)">Developer tools</div><button id="aod-x" style="background:none;border:none;font-size:22px;color:var(--t2);cursor:pointer">×</button></div>' +
      '<div style="font-size:11px;color:var(--t3);margin-bottom:10px">' + (window.AO_BUILD ? AO_BUILD.flavor : '?') + ' build · ' + seeded + ' seeded entries · clock ' + (off ? 'moved to ' + fmt(now()) : 'real time') + '</div>' +
      '<div style="font-size:11px;font-weight:500;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin:6px 0">Test nudge in 10 seconds</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:8px"><select id="aod-type" style="flex:1;padding:8px;border-radius:10px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"><option value="pattern">Pattern</option><option value="daily">Evening check-in</option><option value="dayAfter">Day after a rough day</option><option value="away">Away (day 3)</option></select><button id="aod-fire" ' + btn + '>Fire</button></div>' +
      '<div style="font-size:11px;font-weight:500;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin:6px 0">Seed history</div><div>' +
      Object.keys(PRESETS).map(function (k) { return '<button data-aod-seed="' + k + '" ' + btn + '>' + PRESETS[k].label + '</button>'; }).join('') + '</div>' +
      '<div style="font-size:11px;font-weight:500;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin:6px 0">Time travel</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><input id="aod-d" type="number" value="' + Math.floor(off / DAY) + '" style="width:64px;padding:7px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"><span style="font-size:12px;color:var(--t2)">days</span><input id="aod-h" type="number" value="' + Math.round((off % DAY) / H) + '" style="width:64px;padding:7px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"><span style="font-size:12px;color:var(--t2)">hours</span><button id="aod-tt" ' + btn + '>Apply</button></div>' +
      '<div style="font-size:11px;font-weight:500;color:var(--t2);text-transform:uppercase;letter-spacing:.05em;margin:6px 0">Scheduled</div>' +
      '<button id="aod-pending" ' + btn + '>Show pending notifications</button><div id="aod-list" style="font-size:12px;color:var(--text);margin-bottom:8px"></div>' +
      '<div style="font-size:11px;color:var(--t2);margin-bottom:4px">Planner preview (' + preview.length + ')</div>' +
      '<div style="font-size:11px;color:var(--t2);max-height:120px;overflow:auto;border:.5px solid var(--bdr);border-radius:8px;padding:6px;margin-bottom:8px">' +
      (preview.map(function (n) { return fmt(n.at) + ' · ' + n.type + (n.extra && n.extra.kind ? ' (' + n.extra.kind + ')' : ''); }).join('<br>') || 'Nothing planned') + '</div>' +
      '<button id="aod-clear" ' + btn.replace('var(--text)', 'var(--sost)') + '>Clear all test data</button>' +
      '<div id="aod-status" style="font-size:12px;color:var(--gt);margin-top:6px;min-height:16px">' + lastStatus + '</div>';
    $('aod-x').onclick = close;
    $('aod-fire').onclick = function () { testNudge($('aod-type').value); };
    document.querySelectorAll('[data-aod-seed]').forEach(function (b) { b.onclick = function () { PRESETS[b.dataset.aodSeed].run().then(function () { status('Seeded: ' + PRESETS[b.dataset.aodSeed].label); }); }; });
    $('aod-tt').onclick = function () { App.setOffset((parseFloat($('aod-d').value) || 0) * DAY + (parseFloat($('aod-h').value) || 0) * H); App.reschedule().then(render); };
    $('aod-pending').onclick = function () {
      P.notify.pending().then(function (list) {
        list.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
        $('aod-list').innerHTML = list.length ? list.map(function (n) { return (n.at ? fmt(n.at) : '—') + ' · ' + ((n.extra && n.extra.type) || '?') + (n.id < 1000 ? ' (test)' : ''); }).join('<br>') : 'Nothing pending' + (P.isNative() ? '' : ' (browser: only while this page is open)');
      });
    };
    $('aod-clear').onclick = clearSeeded;
  }

  function open() {
    if ($('aod-ov')) return;
    var ov = document.createElement('div'); ov.id = 'aod-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center';
    ov.innerHTML = '<div id="aod-box" style="background:var(--bg,#fffbf5);width:100%;max-width:420px;max-height:88vh;overflow:auto;border-radius:20px 20px 0 0;padding:16px;font-family:\'DM Sans\',sans-serif"></div>';
    ov.onclick = function (e) { if (e.target === ov) close(); };
    /* lives on <body> so app redraws never remove it; borrow the app's colour tokens */
    var sh = document.querySelector('.shell');
    if (sh) { var cs = getComputedStyle(sh); ['--bg', '--bg2', '--text', '--t2', '--t3', '--bdr', '--gt', '--sost'].forEach(function (v) { ov.style.setProperty(v, cs.getPropertyValue(v)); }); }
    document.body.appendChild(ov);
    render();
  }
  function close() { var ov = $('aod-ov'); if (ov) ov.remove(); }

  window.AODev = { open: open, close: close, presets: PRESETS, clearSeeded: clearSeeded, testNudge: testNudge };

  if (window.AO_BUILD && AO_BUILD.isDevBuild) {
    var b = document.createElement('button');
    b.textContent = '🛠'; b.title = 'Developer tools'; b.setAttribute('aria-label', 'Developer tools');
    b.style.cssText = 'position:fixed;left:8px;bottom:84px;z-index:8000;width:34px;height:34px;border-radius:50%;border:1px solid #d0bea8;background:#fffbf5;font-size:16px;opacity:.75;cursor:pointer';
    b.onclick = open; document.body.appendChild(b);
  }
})();
