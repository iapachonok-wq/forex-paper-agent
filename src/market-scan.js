// Список сигналов по правилу: фоновая проверка активов по кругу, риск-страж и исходы.
// Только записывает сигналы в журнал. Счёт, позиции и заявки валютного агента не трогает.
import {ASSETS} from './markets.js';
import {loadMarket, rulesFor} from './market-data.js';
import {analyze} from './market-rules.js';

// Риск-страж и закрытие по времени — как в crypto-signal-bot.
export const GUARD = {cooldown_hours: 4, max_signals_per_day: 6, max_open_same_direction: 2, expire_bars: 48};
// Лимит процессора Cloudflare Free — 10 мс на запуск, поэтому за раз только два актива
// и не больше двух пропущенных свечей на актив.
export const PER_RUN = 2, BACKFILL = 3;
const M15 = 900000, H1 = 3600000, H4 = 14400000;

export function initialScanState() { return {pointer: 0, day: '', count: 0, last: {}, seen: {}, board: {}, runs: 0, lastRun: 0, lastError: null}; }

// Свечи 15м, которые ещё не проверялись правилом (по времени открытия).
export function pending(d15, seen) {
  const fresh = d15.filter(b => b.t > (seen ?? -Infinity));
  return seen == null ? fresh.slice(-1) : fresh.slice(-BACKFILL);
}
// История на момент закрытия свечи bar: только свечи, уже закрытые к этому времени.
export function sliceAt(m, bar) {
  const end = bar.t + M15;
  return {d15: m.d15.filter(b => b.t <= bar.t), d1h: m.d1h.filter(b => b.t + H1 <= end), d4h: m.d4h.filter(b => b.t + H4 <= end)};
}
export function guard(sig, group, st, open, now) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (st.day !== today) { st.day = today; st.count = 0; }
  const last = st.last[sig.asset];
  if (last && now - last < GUARD.cooldown_hours * H1) return 'пауза по активу';
  if (st.count >= GUARD.max_signals_per_day) return 'дневной лимит сигналов';
  if (open.filter(o => o.grp === group && o.dir === sig.dir).length >= GUARD.max_open_same_direction)
    return `уже ${GUARD.max_open_same_direction} открытых сигнала в эту сторону (${group === 'crypto' ? 'монеты ходят вместе' : group === 'fx' ? 'валюты к доллару ходят вместе' : 'активы группы ходят вместе'})`;
  return null;
}
// Исход открытого сигнала по свечам после него. Стоп проверяется первым, как в bot.py.
// r — результат в рисках за вычетом комиссии за вход и выход, gross — без комиссии.
export function settle(o, d15) {
  const after = d15.filter(b => b.t > o.t), risk = Math.abs(o.entry - o.stop), fee = (o.cost || 0) / risk;
  const done = (outcome, gross, at) => ({outcome, r: gross - fee, gross, at});
  for (const b of after) {
    if (o.dir > 0 ? b.l <= o.stop : b.h >= o.stop) return done('стоп', -1, b.t + M15);
    if (o.dir > 0 ? b.h >= o.tp1 : b.l <= o.tp1) return done('цель', o.rr, b.t + M15);
  }
  if (after.length >= GUARD.expire_bars) return done('время', (after.at(-1).c - o.entry) * o.dir / risk, after.at(-1).t + M15);
  return null;
}

// Один шаг сканера без базы: на входе состояние и открытые сигналы, на выходе что записать.
export async function scanStep(st, open, loader, now) {
  const picked = Array.from({length: PER_RUN}, (_, i) => ASSETS[(st.pointer + i) % ASSETS.length]);
  st.pointer = (st.pointer + PER_RUN) % ASSETS.length;
  const inserts = [], closes = [];
  for (const asset of picked) {
    try {
      const m = await loader(asset);
      for (const o of open.filter(o => o.asset === asset.id && !o.closed)) {
        const s = settle(o, m.d15);
        if (s) { o.closed = true; closes.push({id: o.id, ...s}); }
      }
      let state = 'сетапа нет', why = '';
      for (const bar of pending(m.d15, st.seen[asset.id])) {
        const h = sliceAt(m, bar);
        const {signal, reasons} = analyze(asset.binance || asset.id, h.d15, h.d1h, h.d4h, rulesFor(asset, m.source), m.extra);
        why = reasons.at(-1);
        st.seen[asset.id] = bar.t;
        if (!signal) { state = 'сетапа нет'; continue; }
        const at = bar.t + M15, block = guard({asset: asset.id, dir: signal.dir}, asset.group, st, open.filter(o => !o.closed), at);
        if (block) { state = 'отклонён стражем'; why = block; continue; }
        const rec = {id: signal.id, asset: asset.id, name: asset.name, grp: asset.group, dir: signal.dir, t: bar.t, entry: signal.entry, stop: signal.stop, tp1: signal.tp1, rr: signal.rr, cost: signal.cost, source: m.source, signal};
        inserts.push(rec); open.push(rec);
        st.last[asset.id] = at; st.count++; state = 'сигнал'; why = signal.side;
      }
      st.board[asset.id] = {at: now, state, why, source: m.source, price: m.d15.at(-1).c};
    } catch (e) {
      st.board[asset.id] = {at: now, state: 'нет данных', why: String(e.message || e).slice(0, 160)};
    }
  }
  st.runs++; st.lastRun = now;
  return {inserts, closes, picked: picked.map(a => a.id)};
}

const SQL = [
  'CREATE TABLE IF NOT EXISTS market_signals (id TEXT PRIMARY KEY, asset TEXT NOT NULL, grp TEXT NOT NULL, dir INTEGER NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, r REAL, closed_ts INTEGER, body TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS market_state (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)',
];
export async function ensureTables(env) { await env.DB.batch(SQL.map(s => env.DB.prepare(s))); }
export async function readScanState(env) {
  const r = await env.DB.prepare('SELECT body FROM market_state WHERE id=1').first();
  return r ? {...initialScanState(), ...JSON.parse(r.body)} : initialScanState();
}

export async function marketScan(env, request = fetch, now = Date.now()) {
  await ensureTables(env);
  const st = await readScanState(env);
  const rows = await env.DB.prepare("SELECT body FROM market_signals WHERE status='открыт'").all();
  const open = rows.results.map(r => JSON.parse(r.body));
  try {
    const out = await scanStep(st, open, asset => loadMarket(asset, request, now), now);
    st.lastError = null;
    const ops = [env.DB.prepare('INSERT INTO market_state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').bind(JSON.stringify(st))];
    for (const s of out.inserts) {
      const {closed, ...rec} = s;
      ops.push(env.DB.prepare("INSERT OR IGNORE INTO market_signals(id,asset,grp,dir,ts,status,body) VALUES(?,?,?,?,?,'открыт',?)").bind(s.id, s.asset, s.grp, s.dir, s.t, JSON.stringify(rec)));
    }
    for (const c of out.closes) ops.push(env.DB.prepare('UPDATE market_signals SET status=?,r=?,closed_ts=? WHERE id=?').bind(c.outcome, c.r, c.at, c.id));
    await env.DB.batch(ops);
    return out;
  } catch (e) {
    st.lastError = String(e.message || e).slice(0, 180);
    await env.DB.prepare('INSERT INTO market_state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').bind(JSON.stringify(st)).run();
    throw e;
  }
}

export async function signalJournal(env) {
  await ensureTables(env);
  const st = await readScanState(env);
  const rows = await env.DB.prepare('SELECT status,r,closed_ts,body FROM market_signals ORDER BY ts DESC LIMIT 100').all();
  const all = await env.DB.prepare('SELECT status,r FROM market_signals').all();
  const closed = all.results.filter(x => x.status !== 'открыт'), n = closed.length;
  const stats = n ? {n, wins: closed.filter(x => x.r > 0).length, sum: closed.reduce((a, x) => a + x.r, 0),
    target: closed.filter(x => x.status === 'цель').length, stop: closed.filter(x => x.status === 'стоп').length, time: closed.filter(x => x.status === 'время').length} : null;
  const today = new Date().toISOString().slice(0, 10);
  return {
    signals: rows.results.map(r => ({...JSON.parse(r.body), status: r.status, r: r.r, closedAt: r.closed_ts})),
    stats, open: all.results.length - n, today: st.day === today ? st.count : 0,
    guard: GUARD, scan: {lastRun: st.lastRun, runs: st.runs, lastError: st.lastError, board: st.board, perRun: PER_RUN, assets: ASSETS.length},
  };
}
