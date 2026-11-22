// Порт правила «тренд + зона + сигнал» из crypto-signal-bot/bot.py.
// Свечи: [{t (мс, открытие), o, h, l, c, v}], только закрытые, по возрастанию времени.
// Числа и риск считает только код; модель сюда не вмешивается.
export const RULES = {account_usd: 1000, risk_pct: 1.0, min_rr: 1.5, max_stop_pct: 2.0, volume_mult: 1.2, zone_atr: 0.6, funding_warn_pct: 0.05};

// pandas ewm(adjust=False): первое значение без сглаживания, ведущие NaN пропускаются.
function ewm(values, alpha) {
  const out = new Array(values.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isNaN(prev)) prev = x;
    else if (!Number.isNaN(x)) prev = alpha * x + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}
export const ema = (values, n) => ewm(values, 2 / (n + 1));
export function rsi(close, n = 14) {
  const d = close.map((x, i) => i ? x - close[i - 1] : NaN);
  const up = ewm(d.map(x => Number.isNaN(x) ? NaN : Math.max(x, 0)), 1 / n);
  const dn = ewm(d.map(x => Number.isNaN(x) ? NaN : Math.max(-x, 0)), 1 / n);
  return up.map((u, i) => dn[i] === 0 || Number.isNaN(dn[i]) ? NaN : 100 - 100 / (1 + u / dn[i]));
}
export function atr(bars, n = 14) {
  const tr = bars.map((b, i) => i ? Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)) : b.h - b.l);
  return ewm(tr, 1 / n);
}
// VWAP с обнулением в начале суток UTC.
export function vwapDaily(bars) {
  let day = null, pv = 0, vol = 0;
  return bars.map(b => {
    const d = Math.floor(b.t / 86400000);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    pv += (b.h + b.l + b.c) / 3 * b.v; vol += b.v;
    return vol === 0 ? NaN : pv / vol;
  });
}
export function pivots(bars, w = 3) {
  const hi = [], lo = [];
  for (let i = w; i < bars.length - w; i++) {
    const win = bars.slice(i - w, i + w + 1);
    if (bars[i].h === Math.max(...win.map(b => b.h))) hi.push([i, bars[i].h]);
    if (bars[i].l === Math.min(...win.map(b => b.l))) lo.push([i, bars[i].l]);
  }
  return {hi, lo};
}
export function mergeLevels(values, tol) {
  const out = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const last = out.at(-1);
    if (last && Math.abs(v - last[0]) <= tol) out[out.length - 1] = [(last[0] * last[1] + v) / (last[1] + 1), last[1] + 1];
    else out.push([v, 1]);
  }
  return out.map(x => x[0]);
}
export function divergence(bars, r, direction, look = 40, w = 3) {
  const part = bars.slice(-look), rp = r.slice(-look);
  const {hi, lo} = pivots(part, w);
  const pts = direction > 0 ? lo : hi;
  if (pts.length < 2) return false;
  const [[i1, p1], [i2, p2]] = pts.slice(-2);
  return direction > 0 ? p2 < p1 && rp[i2] > rp[i1] : p2 > p1 && rp[i2] < rp[i1];
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const fixed = (x, n) => x.toFixed(n);
const signed = (x, n) => (x >= 0 ? '+' : '') + x.toFixed(n);
export function fmt(x) {
  if (x >= 1000) return x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return x >= 1 ? x.toFixed(3) : x.toFixed(5);
}
const pad = n => String(n).padStart(2, '0');
const stamp = t => { const d = new Date(t); return pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()); };
const iso = t => new Date(t).toISOString().replace('.000Z', '+00:00');

// Общие расчёты, которые нужны и правилу, и графику, и разбору словами.
export function features(d15, d1h, d4h, cfg = RULES) {
  const c1h = d1h.map(b => b.c), e50 = ema(c1h, 50), e200 = ema(c1h, 200), e50_4h = ema(d4h.map(b => b.c), 50);
  const a1h = atr(d1h).at(-1), a15 = atr(d15).at(-1), r15 = rsi(d15.map(b => b.c)), vw = vwapDaily(d15);
  const last = d15.at(-1), prev = d15.at(-2), price = last.c;
  const volAvg = d15.length >= 20 ? mean(d15.slice(-20).map(b => b.v)) : NaN;
  const {hi, lo} = pivots(d1h.slice(-240), 3), tol = 0.5 * a1h;
  const supports = mergeLevels(lo.map(x => x[1]).filter(p => p < price), tol);
  const resists = mergeLevels(hi.map(x => x[1]).filter(p => p > price), tol);
  const up = price > e200.at(-1) && e50.at(-1) > e200.at(-1) && d4h.at(-1).c > e50_4h.at(-1);
  const down = price < e200.at(-1) && e50.at(-1) < e200.at(-1) && d4h.at(-1).c < e50_4h.at(-1);
  return {e50, e200, e50_4h, a1h, a15, r15, vw, last, prev, price, volAvg, supports, resists, up, down, zone: cfg.zone_atr * a1h};
}

// Возвращает {signal | null, reasons}. Логика и тексты совпадают с bot.analyze().
export function analyze(symbol, d15, d1h, d4h, cfg = RULES, extra = {}) {
  if (d15.length < 120 || d1h.length < 210 || d4h.length < 60) return {signal: null, reasons: ['мало истории']};
  const f = features(d15, d1h, d4h, cfg), {last, prev, price} = f;
  if (!(f.up || f.down)) return {signal: null, reasons: ['тренд не определён (1ч и 4ч не согласны)']};
  const d = f.up ? 1 : -1, side = d > 0 ? 'ЛОНГ' : 'ШОРТ';
  const reasons = [`Тренд ${d > 0 ? 'вверх' : 'вниз'}: цена и EMA50 ${d > 0 ? 'выше' : 'ниже'} EMA200 (1ч), 4ч подтверждает`];
  const recent = d15.slice(-3), touch = d > 0 ? Math.min(...recent.map(b => b.l)) : Math.max(...recent.map(b => b.h));
  const cands = [['EMA50 (1ч)', f.e50.at(-1)], ['VWAP', f.vw.at(-1)], ...(d > 0 ? f.supports : f.resists).map(x => ['уровень ' + fmt(x), x])];
  const near = cands.filter(([, x]) => Math.abs(touch - x) <= f.zone && (d > 0 ? x <= price : x >= price));
  if (!near.length) return {signal: null, reasons: [...reasons, 'цена не в зоне: нет отката к уровню, VWAP или EMA50']};
  const [zname, zval] = near.reduce((a, b) => Math.abs(touch - b[1]) < Math.abs(touch - a[1]) ? b : a);
  reasons.push('Зона: откат к ' + zname);
  const candle = d > 0 ? last.c > last.o && last.c > prev.h : last.c < last.o && last.c < prev.l;
  if (!candle) return {signal: null, reasons: [...reasons, 'нет разворотной свечи на 15м']};
  const volOk = last.v > cfg.volume_mult * f.volAvg, divOk = divergence(d15, f.r15, d);
  if (!(volOk || divOk)) return {signal: null, reasons: [...reasons, 'свеча есть, но нет ни объёма, ни расхождения RSI']};
  const trig = [];
  if (volOk) trig.push(`объём ${fixed(last.v / f.volAvg, 1)}x от среднего`);
  if (divOk) trig.push('расхождение RSI');
  reasons.push('Сигнал: разворотная свеча 15м, ' + trig.join(', '));
  const six = d15.slice(-6), swing = d > 0 ? Math.min(...six.map(b => b.l)) : Math.max(...six.map(b => b.h));
  const stop = swing - d * 0.5 * f.a15, entry = price, risk = (entry - stop) * d;
  if (risk <= 0) return {signal: null, reasons: [...reasons, 'стоп не строится']};
  if (risk / entry * 100 > cfg.max_stop_pct) return {signal: null, reasons: [...reasons, `стоп слишком далеко: ${fixed(risk / entry * 100, 2)} % при пределе ${fixed(cfg.max_stop_pct, 2)} %`]};
  const barriers = (d > 0 ? f.resists : [...f.supports].sort((a, b) => b - a)).filter(b => (b - entry) * d > 0);
  let tp1 = entry + d * 2 * risk;
  if (barriers.length) {
    const rrB = (barriers[0] - entry) * d / risk;
    if (rrB < cfg.min_rr) return {signal: null, reasons: [...reasons, `до ближайшего уровня ${fmt(barriers[0])} только ${fixed(Math.trunc(rrB * 100) / 100, 2)}R, меньше ${fixed(cfg.min_rr, 2)}R`]};
    if (rrB < 2) tp1 = barriers[0];
  }
  const tp2 = entry + d * 3 * risk, rr = (tp1 - entry) * d / risk;
  const warnings = [], fp = extra.funding_pct;
  if (fp != null && Math.abs(fp) >= cfg.funding_warn_pct && (fp > 0) === (d > 0)) warnings.push(`ставка финансирования ${signed(fp, 3)} %: толпа уже стоит в эту сторону`);
  const riskUsd = cfg.account_usd * cfg.risk_pct / 100;
  const signal = {
    id: `${symbol}-${stamp(last.t)}`, symbol, dir: d, side, time: iso(last.t), entry, stop, tp1, tp2, rr,
    risk_pct_price: risk / entry * 100, qty: riskUsd / risk, risk_usd: riskUsd, reasons, warnings, zone: zval,
    levels: [...f.supports.slice(-3), ...f.resists.slice(0, 3)], rsi: f.r15.at(-1), atr15: f.a15,
    funding_pct: fp ?? null, oi_change_pct: extra.oi_change_pct ?? null,
  };
  return {signal, reasons};
}
