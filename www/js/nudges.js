/*
 * nudges.js — the local-notification planner. Pure planning (computeNudges) + a thin scheduler
 * (rescheduleAll). Works in the browser, in Capacitor, and in Node for unit tests.
 *
 * Everything is worked out on the device from mood timestamps. Nothing is sent anywhere.
 *
 * Types (at most ONE notification per calendar day, never in quiet hours):
 *   pattern   Stormy/Heavy logged at a similar weekday + hour (±1h) on ≥3 of the last 5 occurrences
 *             of that weekday → nudge 35 min before that time on the next occurrences (next 14 days).
 *   dayAfter  A soft morning check-in the day after a Stormy log (1 hour after quiet hours end).
 *   daily     The check-in: at the person's usual logging time once ~10+ timed logs show one,
 *             otherwise at their wind-down time ("evening"). Sent for the next 3 days after each open.
 *   away      If the app isn't opened: day 3, day 7, day 14 after the last open, then nothing.
 * Priority on a single day: pattern > dayAfter > daily > away.
 *
 * Lock-screen copy is deliberately vague: it never names a mood, a day pattern or an entry.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AONudges = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 864e5;
  var TYPE_CODE = { pattern: 1, dayAfter: 2, daily: 3, away: 4 };
  var TITLE = 'Anxiously Okay';
  var ACTION_TYPE = 'AO_MOOD';
  var DEFAULTS = { enabled: true, evening: true, pattern: true, away: true, windDown: '22:00', quietStart: null, quietEnd: '08:00' };

  var COPY = {
    pattern: [
      function (part) { return 'Thinking of you this ' + part + '. Want to check in?'; },
      function () { return 'A quiet moment is here when you want it.'; },
      function () { return 'Here if you\'d like a minute for yourself.'; }
    ],
    evening: ['How was today? Take a minute to log it.', 'End of the day. Anything you want to put down?', 'Before you rest, how did today feel?'],
    morning: ['Morning. How are you feeling today?', 'A new day. Want to check in?', 'How are you starting today?'],
    afternoon: ['How\'s your day going? Take a minute to log it.', 'A small pause. How are you right now?', 'Halfway through the day. Want to check in?'],
    dayAfter: ['Good morning. How are you feeling today?', 'A gentle check-in for today. How are you?', 'New day. Take a moment for yourself if you\'d like.'],
    away: { 3: 'How are you today? One tap is all it takes.', 7: 'No pressure. Just checking in.', 14: 'Whenever you\'re ready, I\'m here.' }
  };

  /* ---------- time helpers (always the device's local clock) ---------- */
  function toMin(hhmm) { var p = String(hhmm || '').split(':'); var h = parseInt(p[0], 10), m = parseInt(p[1], 10); return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m); }
  function fmtMin(m) { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function startOfDay(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function addDays(dayStart, n) { var d = new Date(dayStart); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  /* local wall-clock time on a given day; DST-safe because it is built from calendar fields */
  function at(dayStart, minutes) { var d = new Date(dayStart); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(minutes / 60), minutes % 60).getTime(); }
  function minOfDay(ms) { var d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }
  function sameDay(a, b) { return startOfDay(a) === startOfDay(b); }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function dayOfYear(ms) { var d = new Date(ms); return Math.floor((startOfDay(ms) - new Date(d.getFullYear(), 0, 1).getTime()) / DAY + 0.5); }
  function partOfDay(min) { return min < 720 ? 'morning' : min < 1020 ? 'afternoon' : 'evening'; }

  function settingsOf(s) { var o = {}; for (var k in DEFAULTS) o[k] = (s && s[k] !== undefined && s[k] !== null) ? s[k] : DEFAULTS[k]; o.quietStart = (s && s.quietStart) || fmtMin(toMin(o.windDown) + 30); return o; }
  function inQuiet(min, st) {
    var a = toMin(st.quietStart), b = toMin(st.quietEnd);
    if (a === b) return false;
    return a < b ? (min >= a && min < b) : (min >= a || min < b);
  }

  /* ---------- detection ---------- */
  /* Usual logging time: ≥10 timed logs and ≥60% of them within a 2-hour window. */
  function usualTime(logs) {
    var mins = logs.map(function (l) { return minOfDay(l.ts); });
    if (mins.length < 10) return null;
    var best = null;
    mins.forEach(function (c) {
      var hits = mins.filter(function (m) { return Math.abs(m - c) <= 60; });
      if (!best || hits.length > best.length) best = hits;
    });
    if (best.length / mins.length < 0.6) return null;
    return Math.round(best.reduce(function (a, b) { return a + b; }, 0) / best.length);
  }

  /* weekday (0=Sun) → {minutes, count}: heavy (Stormy/Heavy) logs within ±60 min on ≥3 of the last 5 occurrences */
  function detectPatterns(logs, now) {
    var today = startOfDay(now), out = {};
    var heavy = logs.filter(function (l) { return l.mood <= 2; });
    for (var wd = 0; wd < 7; wd++) {
      var back = (new Date(today).getDay() - wd + 7) % 7 || 7;      // most recent occurrence strictly before today
      var occ = [];
      for (var k = 0; k < 5; k++) occ.push(addDays(today, -(back + 7 * k)));
      var byDate = occ.map(function (d) { return heavy.filter(function (l) { return sameDay(l.ts, d); }).map(function (l) { return minOfDay(l.ts); }); });
      var best = null;
      byDate.forEach(function (arr) {
        arr.forEach(function (c) {
          var matched = [];
          byDate.forEach(function (a2) {
            var near = a2.filter(function (m) { return Math.abs(m - c) <= 60; });
            if (near.length) matched.push(near.reduce(function (x, y) { return Math.abs(x - c) <= Math.abs(y - c) ? x : y; }));
          });
          if (matched.length >= 3 && (!best || matched.length > best.matched.length || (matched.length === best.matched.length && c < best.c))) best = { c: c, matched: matched };
        });
      });
      if (best) out[wd] = { minutes: Math.round(best.matched.reduce(function (a, b) { return a + b; }, 0) / best.matched.length), count: best.matched.length };
    }
    return out;
  }

  /* ---------- planning ---------- */
  /*
   * input: { now, logs:[{ts,mood}], settings, suppressed:{type:true}, lastOpen, days=14, maxPending=60 }
   * returns [{id, at, type, title, body, actionTypeId, extra}] sorted by time, ≤1 per day, none in quiet hours
   */
  function computeNudges(input) {
    var now = input.now, st = settingsOf(input.settings), sup = input.suppressed || {};
    var days = input.days == null ? 14 : input.days, cap = input.maxPending == null ? 60 : input.maxPending;
    var logs = (input.logs || []).filter(function (l) { return l && l.ts > 0 && l.ts <= now && l.mood >= 1 && l.mood <= 5; });
    if (st.enabled === false) return [];
    var today = startOfDay(now), openDay = startOfDay(input.lastOpen || now);
    var usual = usualTime(logs);
    if (usual != null && inQuiet(usual, st)) usual = null;
    var dailyMin = usual != null ? usual : toMin(st.windDown);
    var dailyKind = usual != null ? 'usual' : 'evening';
    var patterns = st.pattern && !sup.pattern ? detectPatterns(logs, now) : {};
    var loggedToday = logs.some(function (l) { return sameDay(l.ts, now); });
    var lastStormy = logs.filter(function (l) { return l.mood === 1; }).sort(function (a, b) { return b.ts - a.ts; })[0];
    var morningMin = toMin(st.quietEnd) + 60;

    var out = [];
    for (var d = 0; d <= days; d++) {
      var day = addDays(today, d), wd = new Date(day).getDay(), cands = [];
      if (patterns[wd] && d <= 13) cands.push({ type: 'pattern', min: patterns[wd].minutes - 35, extra: { weekday: wd, minutes: patterns[wd].minutes } });
      if (st.evening && !sup.dayAfter && lastStormy && addDays(startOfDay(lastStormy.ts), 1) === day) cands.push({ type: 'dayAfter', min: morningMin });
      var sinceOpen = Math.round((day - openDay) / DAY);
      if (st.evening && !sup.daily && sinceOpen >= 0 && sinceOpen <= 2 && !(d === 0 && loggedToday)) cands.push({ type: 'daily', min: dailyMin, extra: { kind: dailyKind } });
      if (st.away && !sup.away && (sinceOpen === 3 || sinceOpen === 7 || sinceOpen === 14)) cands.push({ type: 'away', min: dailyMin, extra: { day: sinceOpen } });
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c.min < 0 || c.min >= 1440 || inQuiet(c.min, st)) continue;
        var t = at(day, c.min);
        if (t <= now + 60000) continue;
        out.push(build(c, t));
        break;                                            // one per day
      }
    }
    return out.sort(function (a, b) { return a.at - b.at; }).slice(0, cap);
  }

  function build(c, t) {
    var code = TYPE_CODE[c.type], v = (dayOfYear(t) + code) % 3, body, min = minOfDay(t);
    if (c.type === 'pattern') body = COPY.pattern[v](partOfDay(min));
    else if (c.type === 'dayAfter') body = COPY.dayAfter[v];
    else if (c.type === 'away') body = COPY.away[c.extra.day];
    else body = (c.extra.kind === 'usual' ? (min < 720 ? COPY.morning : min < 1020 ? COPY.afternoon : COPY.evening) : COPY.evening)[v];
    var extra = { type: c.type, variant: v };
    if (c.extra) for (var k in c.extra) extra[k] = c.extra[k];
    return { id: ymd(t) * 10 + code, at: t, type: c.type, title: TITLE, body: body, actionTypeId: ACTION_TYPE, extra: extra };
  }

  /* ---------- ignored / dismissed tracking ---------- */
  /* Past scheduled nudges the person never acted on count as ignored. 3 in a row stops that type. */
  function reconcile(state, now) {
    state.ignored = state.ignored || {}; state.acted = state.acted || []; state.log = state.log || [];
    var keep = [];
    state.log.forEach(function (n) {
      if (n.at > now) { keep.push(n); return; }
      if (state.acted.indexOf(n.id) >= 0) state.ignored[n.type] = 0;
      else state.ignored[n.type] = (state.ignored[n.type] || 0) + 1;
    });
    state.log = keep; state.acted = [];
    var sup = {};
    Object.keys(state.ignored).forEach(function (t) { if (state.ignored[t] >= 3) sup[t] = true; });
    return sup;
  }

  /*
   * adapter: { notify (AOPlatform.notify), now(), state() → mutable nudge state, logs() → [{ts,mood}], persist() }
   * Cancels everything we scheduled (test nudges, id < 1000, are left alone) and plans the next 14 days.
   */
  var running = null, again = false;
  function rescheduleAll(adapter) {
    if (running) { again = true; return running; }
    running = (function run() {
      var now = adapter.now(), st = adapter.state();
      var sup = reconcile(st, now);
      return adapter.notify.permission().then(function (perm) {
        return adapter.notify.pending().then(function (p) {
          var ours = p.filter(function (n) { return n.id >= 1000; }).map(function (n) { return n.id; });
          return adapter.notify.cancel(ours);
        }).then(function () {
          if (perm !== 'granted' || st.enabled === false) { st.log = []; adapter.persist(); return []; }
          var list = computeNudges({ now: now, logs: adapter.logs(), settings: st, suppressed: sup, lastOpen: now });
          return adapter.notify.schedule(list).then(function () {
            st.log = list.map(function (n) { return { id: n.id, type: n.type, at: n.at }; });
            st.lastPlanned = now; adapter.persist();
            return list;
          });
        });
      });
    })().then(function (r) {
      running = null;
      if (again) { again = false; return rescheduleAll(adapter); }
      return r;
    }, function (e) { running = null; again = false; throw e; });
    return running;
  }

  return {
    DEFAULTS: DEFAULTS, TYPE_CODE: TYPE_CODE, ACTION_TYPE: ACTION_TYPE, COPY: COPY,
    computeNudges: computeNudges, detectPatterns: detectPatterns, usualTime: usualTime,
    reconcile: reconcile, rescheduleAll: rescheduleAll, settingsOf: settingsOf, inQuiet: inQuiet,
    toMin: toMin, fmtMin: fmtMin, startOfDay: startOfDay
  };
});
