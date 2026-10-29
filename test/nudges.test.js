/* Unit tests for the notification planner. Run: npm test */
'use strict';
process.env.TZ = 'America/New_York';            // a zone with DST, set before any Date use
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../www/js/nudges.js');

const H = 36e5, DAY = 864e5;
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const hm = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const dayKey = ms => new Date(ms).toDateString();
const base = { evening: true, pattern: true, away: true, windDown: '22:00', quietStart: null, quietEnd: '08:00' };
/* Wed 14 Oct 2026, noon */
const NOW = local(2026, 10, 14, 12, 0);
const sundaysBefore = (now, n, h, m = 0) => {
  const out = []; const d = new Date(now); let back = d.getDay() || 7;
  for (let k = 0; k < n; k++) { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back - 7 * k, h, m); out.push(s.getTime()); }
  return out;
};
const plan = (o) => N.computeNudges(Object.assign({ now: NOW, logs: [], settings: base, suppressed: {}, lastOpen: NOW }, o));

test('pattern detected: 3 Heavy Sundays around 5pm → nudge ~4:15–4:30pm next Sunday', () => {
  const logs = sundaysBefore(NOW, 3, 17).map(ts => ({ ts, mood: 2 }));
  const list = plan({ logs });
  const p = list.find(n => n.type === 'pattern');
  assert.ok(p, 'expected a pattern nudge');
  assert.equal(new Date(p.at).getDay(), 0);
  assert.ok(hm(p.at) >= 16 * 60 + 15 && hm(p.at) <= 16 * 60 + 30, 'at ' + new Date(p.at).toString());
  assert.equal(p.at, local(2026, 10, 18, 16, 25));
});

test('pattern not detected with only 2 heavy Sundays, or with scattered times', () => {
  assert.equal(plan({ logs: sundaysBefore(NOW, 2, 17).map(ts => ({ ts, mood: 2 })) }).filter(n => n.type === 'pattern').length, 0);
  const s = sundaysBefore(NOW, 3, 0);
  const scattered = [s[0] + 9 * H, s[1] + 17 * H, s[2] + 21 * H].map(ts => ({ ts, mood: 1 }));
  assert.equal(plan({ logs: scattered }).filter(n => n.type === 'pattern').length, 0);
  const steady = sundaysBefore(NOW, 3, 17).map(ts => ({ ts, mood: 3 }));
  assert.equal(plan({ logs: steady }).filter(n => n.type === 'pattern').length, 0, 'Steady days are not a pattern');
});

test('pattern within ±1 hour counts (4:30pm, 5pm, 5:45pm)', () => {
  const s = sundaysBefore(NOW, 3, 0);
  const logs = [s[0] + 16.5 * H, s[1] + 17 * H, s[2] + 17.75 * H].map(ts => ({ ts, mood: 2 }));
  assert.equal(plan({ logs }).filter(n => n.type === 'pattern').length, 2, 'two Sundays in the next 14 days');
});

test('quiet hours: nothing is scheduled inside them', () => {
  const st = Object.assign({}, base, { windDown: '22:00', quietStart: '21:00', quietEnd: '09:30' });
  const list = plan({ settings: st, logs: sundaysBefore(NOW, 3, 22).map(ts => ({ ts, mood: 1 })) });
  for (const n of list) assert.ok(!N.inQuiet(hm(n.at), N.settingsOf(st)), 'in quiet hours: ' + new Date(n.at).toString());
  assert.equal(list.filter(n => n.type === 'daily').length, 0, 'daily at 22:00 falls inside 21:00–09:30');
  assert.equal(list.filter(n => n.type === 'pattern').length, 0, 'pattern at 21:25 falls inside quiet hours');
});

test('default quiet hours start 30 minutes after wind-down and end at 8am', () => {
  const st = N.settingsOf({ windDown: '21:15' });
  assert.equal(st.quietStart, '21:45');
  assert.ok(N.inQuiet(23 * 60, st) && N.inQuiet(7 * 60, st) && !N.inQuiet(8 * 60, st) && !N.inQuiet(21 * 60 + 15, st));
});

test('hard cap: never more than one notification per day', () => {
  // Stormy yesterday (day-after → today), heavy Sundays (pattern), daily, away — all competing
  const early = local(2026, 10, 14, 7, 30);           // before the 9am morning check-in
  const logs = sundaysBefore(early, 3, 17).map(ts => ({ ts, mood: 2 })).concat([{ ts: early - DAY, mood: 1 }]);
  const list = plan({ logs, now: early, lastOpen: early });
  const days = list.map(n => dayKey(n.at));
  assert.equal(new Set(days).size, days.length);
  const today = list.filter(n => dayKey(n.at) === dayKey(early));
  assert.equal(today.length, 1);
  assert.equal(today[0].type, 'dayAfter', 'the day after a Stormy log replaces that day\'s check-in');
  assert.equal(today[0].at, local(2026, 10, 14, 9, 0));
  const sunday = list.filter(n => new Date(n.at).getDay() === 0);
  assert.ok(sunday.length && sunday.every(n => n.type === 'pattern'), 'pattern wins its day');
  /* at noon the 9am slot has passed, so the day falls back to the evening check-in */
  const noon = plan({ logs: [{ ts: NOW - DAY, mood: 1 }] }).filter(n => dayKey(n.at) === dayKey(NOW));
  assert.equal(noon.length, 1); assert.equal(noon[0].type, 'daily');
});

test('day after a rough day: soft morning check-in the next day', () => {
  const list = plan({ logs: [{ ts: NOW - 2 * H, mood: 1 }] });   // Stormy this morning
  const t = list.find(n => n.type === 'dayAfter');
  assert.ok(t); assert.equal(t.at, local(2026, 10, 15, 9, 0));
});

test('evening check-in is skipped today once today is logged', () => {
  const today = plan({ logs: [{ ts: NOW - H, mood: 3 }] }).filter(n => dayKey(n.at) === dayKey(NOW));
  assert.equal(today.length, 0);
  const notLogged = plan({}).filter(n => dayKey(n.at) === dayKey(NOW));
  assert.equal(notLogged[0].type, 'daily'); assert.equal(hm(notLogged[0].at), 22 * 60);
});

test('usual logging time replaces the evening default after ~10 logs', () => {
  const logs = []; for (let i = 1; i <= 12; i++) logs.push({ ts: local(2026, 10, 14 - i, 8, (i * 7) % 30), mood: 3 });
  const d = plan({ logs }).find(n => n.type === 'daily');
  assert.equal(d.extra.kind, 'usual');
  assert.ok(Math.abs(hm(d.at) - (8 * 60 + 15)) <= 20, 'around 8am, got ' + new Date(d.at).toString());
});

test('away nudges: day 3, 7 and 14 after the last open, then stop', () => {
  const st = Object.assign({}, base, { evening: false, pattern: false });
  const list = plan({ settings: st });
  assert.deepEqual(list.map(n => Math.round((N.startOfDay(n.at) - N.startOfDay(NOW)) / DAY)), [3, 7, 14]);
  assert.deepEqual(list.map(n => n.body), [N.COPY.away[3], N.COPY.away[7], N.COPY.away[14]]);
  const all = plan({});
  assert.ok(all.every(n => n.at <= N.startOfDay(NOW) + 15 * DAY), 'nothing after day 14');
  assert.ok(all.filter(n => n.type === 'daily').length <= 3, 'daily check-ins only for 3 days after an open');
});

test('away nudges are cancelled and re-planned when the app reopens', async () => {
  const pending = new Map(); const cancelled = [];
  const notify = {
    permission: async () => 'granted',
    pending: async () => [...pending.values()],
    cancel: async ids => { ids.forEach(id => { cancelled.push(id); pending.delete(id); }); },
    schedule: async items => { items.forEach(n => pending.set(n.id, n)); }
  };
  const state = Object.assign({}, base, { evening: false, pattern: false, ignored: {}, acted: [], log: [] });
  let now = NOW;
  const adapter = { notify, now: () => now, state: () => state, logs: () => [], persist: () => {} };
  const first = await N.rescheduleAll(adapter);
  pending.set(5, { id: 5, at: NOW + 10000 });                       // a dev test nudge — must survive
  now = NOW + 2 * DAY;                                              // reopened two days later
  const second = await N.rescheduleAll(adapter);
  first.forEach(n => assert.ok(cancelled.includes(n.id), 'old away nudge cancelled'));
  assert.ok(pending.has(5), 'test nudges (id < 1000) are left alone');
  assert.deepEqual(second.map(n => Math.round((N.startOfDay(n.at) - N.startOfDay(now)) / DAY)), [3, 7, 14]);
});

test('DST change: wall-clock times stay put across the switch (America/New_York, 1 Nov 2026)', () => {
  const now = local(2026, 10, 29, 12);
  const st = Object.assign({}, base, { pattern: false });
  const list = N.computeNudges({ now, logs: [], settings: st, lastOpen: now });
  assert.ok(list.some(n => n.at > local(2026, 11, 1, 3)), 'plan spans the DST change');
  list.forEach(n => assert.equal(hm(n.at), 22 * 60, new Date(n.at).toString()));
  const logs = sundaysBefore(local(2026, 11, 3, 12), 3, 17).map(ts => ({ ts, mood: 2 }));
  const p = N.computeNudges({ now: local(2026, 11, 3, 12), logs, settings: base }).find(n => n.type === 'pattern');
  assert.equal(hm(p.at), 16 * 60 + 25);
});

test('time zone change: re-planning uses the new local clock', () => {
  const instant = Date.UTC(2026, 9, 14, 8, 0);       // the same moment, viewed from two zones
  const plans = {};
  for (const tz of ['Europe/London', 'Asia/Tokyo']) {
    process.env.TZ = tz;
    plans[tz] = N.computeNudges({ now: instant, logs: [], settings: base, lastOpen: instant });
    plans[tz].forEach(n => assert.equal(hm(n.at), 22 * 60, tz + ' ' + new Date(n.at).toString()));
  }
  assert.notEqual(plans['Europe/London'][0].at, plans['Asia/Tokyo'][0].at);
  process.env.TZ = 'America/New_York';
});

test('ignored 3 times in a row stops that type; acting resets it', () => {
  const state = { log: [1, 2, 3].map(i => ({ id: 1000 + i, type: 'daily', at: NOW - i * DAY })), acted: [], ignored: {} };
  const sup = N.reconcile(state, NOW);
  assert.equal(sup.daily, true);
  assert.equal(plan({ suppressed: sup }).filter(n => n.type === 'daily').length, 0);
  const s2 = { log: [{ id: 2001, type: 'daily', at: NOW - DAY }], acted: [2001], ignored: { daily: 2 } };
  assert.equal(N.reconcile(s2, NOW).daily, undefined); assert.equal(s2.ignored.daily, 0);
});

test('lock-screen copy is vague: never names a mood or a day', () => {
  const logs = sundaysBefore(NOW, 3, 17).map(ts => ({ ts, mood: 2 })).concat([{ ts: NOW - DAY, mood: 1 }]);
  plan({ logs }).forEach(n => {
    assert.doesNotMatch(n.body, /stormy|heavy|steady|lifted|radiant|sunday|monday|tuesday|wednesday|thursday|friday|saturday|pattern/i);
    assert.equal(n.title, 'Anxiously Okay');
  });
});

test('copy rotates through 3 variants per type', () => {
  const seen = new Set();
  for (let d = 0; d < 6; d++) {
    const now = NOW + d * DAY;
    plan({ now, lastOpen: now }).filter(n => n.type === 'daily').forEach(n => seen.add(n.body));
  }
  assert.equal(seen.size, 3);
});

test('never more than 60 pending', () => {
  assert.ok(N.computeNudges({ now: NOW, logs: [], settings: base, days: 200, maxPending: 60 }).length <= 60);
});
