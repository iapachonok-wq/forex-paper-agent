// Загрузка свечей 15м / 1ч / 4ч для раздела «Рынки» с запасными источниками.
import {ASSETS, chainFor, SOURCE_LABELS, BYBIT, GATE, MEXC, KRAKEN, YAHOO, feeFor} from './markets.js';
import {analyze, features, RULES} from './market-rules.js';
export const rulesFor = (asset, source) => ({...RULES, fee_pct: feeFor(asset, source)});
import {story, chartData} from './market-story.js';

const SEC = {'15m': 900, '1h': 3600, '4h': 14400};
const LIMIT = {'15m': 500, '1h': 500, '4h': 300};
const MIN = {'15m': 120, '1h': 210, '4h': 60};

async function getJson(request, url) {
  const r = await request(url, {headers: {'User-Agent': 'forex-paper-agent/1.0'}, signal: AbortSignal.timeout(10000)});
  if (!r.ok) throw Error('HTTP ' + r.status);
  return r.json();
}
const valid = b => [b.o, b.h, b.l, b.c].every(x => Number.isFinite(x) && x > 0) && Number.isFinite(b.t);
const closedOnly = (bars, tf, now) => bars.filter(b => valid(b) && b.t + SEC[tf] * 1000 <= now).sort((a, b) => a.t - b.t);

// Свечи 4ч из часовых, корзины от полуночи UTC, как resample('4h') в pandas.
export function toFourHours(hours) {
  const out = [];
  for (const b of hours) {
    const t = Math.floor(b.t / 14400000) * 14400000, prev = out.at(-1);
    if (prev?.t === t) { prev.h = Math.max(prev.h, b.h); prev.l = Math.min(prev.l, b.l); prev.c = b.c; prev.v += b.v; }
    else out.push({...b, t});
  }
  return out;
}

const SOURCES = {
  async bybit(asset, tf, request) {
    const j = await getJson(request, `${BYBIT}/v5/market/kline?category=linear&symbol=${asset.binance}&interval=${{'15m': 15, '1h': 60, '4h': 240}[tf]}&limit=${LIMIT[tf]}`);
    if (j.retCode !== 0 || !Array.isArray(j.result?.list)) throw Error(j.retMsg || 'Bybit: пустой ответ');
    return j.result.list.map(r => ({t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5]}));
  },
  async gate(asset, tf, request) {
    const rows = await getJson(request, `${GATE}/api/v4/spot/candlesticks?currency_pair=${asset.id}_USDT&interval=${tf}&limit=${LIMIT[tf]}`);
    if (!Array.isArray(rows)) throw Error('Gate: пустой ответ');
    return rows.map(r => ({t: Number(r[0]) * 1000, o: +r[5], h: +r[3], l: +r[4], c: +r[2], v: +r[6]}));
  },
  async mexc(asset, tf, request) {
    const rows = await getJson(request, `${MEXC}/api/v3/klines?symbol=${asset.binance}&interval=${{'15m': '15m', '1h': '60m', '4h': '4h'}[tf]}&limit=${LIMIT[tf]}`);
    if (!Array.isArray(rows)) throw Error('MEXC: пустой ответ');
    return rows.map(r => ({t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5]}));
  },
  async kraken(asset, tf, request) {
    const pair = (asset.id === 'BTC' ? 'XBT' : asset.id) + 'USD';
    const j = await getJson(request, `${KRAKEN}/0/public/OHLC?pair=${pair}&interval=${{'15m': 15, '1h': 60, '4h': 240}[tf]}`);
    const rows = Object.entries(j.result || {}).find(([k]) => k !== 'last')?.[1];
    if (!Array.isArray(rows)) throw Error('Kraken: ' + ((j.error || []).join(', ') || 'пустой ответ'));
    return rows.map(r => ({t: Number(r[0]) * 1000, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[6]}));
  },
  async yahoo(asset, tf, request) {
    const [interval, range, step] = tf === '15m' ? ['15m', '10d', 900000] : ['60m', '60d', 3600000];
    const j = await getJson(request, `${YAHOO}/v8/finance/chart/${encodeURIComponent(asset.yahoo[0])}?interval=${interval}&range=${range}`);
    const x = j.chart?.result?.[0], q = x?.indicators?.quote?.[0];
    if (!x?.timestamp || !q) throw Error('Yahoo: нет свечей');
    // Последняя «живая» свеча Yahoo приходит с неровным временем (например 16:59:57) — её отбрасываем.
    const bars = x.timestamp.map((t, i) => ({t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume?.[i] ?? 0})).filter(b => b.t % step === 0);
    return tf === '4h' ? toFourHours(bars.filter(valid)) : bars;
  },
};

async function bybitExtra(asset, request) {
  const out = {funding_pct: null, oi_change_pct: null};
  try {
    const j = await getJson(request, `${BYBIT}/v5/market/tickers?category=linear&symbol=${asset.binance}`);
    const f = Number(j.result?.list?.[0]?.fundingRate);
    if (Number.isFinite(f)) out.funding_pct = f * 100;
  } catch {}
  try {
    const j = await getJson(request, `${BYBIT}/v5/market/open-interest?category=linear&symbol=${asset.binance}&intervalTime=1h&limit=25`);
    const list = [...(j.result?.list || [])].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const a = Number(list[0]?.openInterest), b = Number(list.at(-1)?.openInterest);
    if (a > 0 && Number.isFinite(b)) out.oi_change_pct = (b / a - 1) * 100;
  } catch {}
  return out;
}

export async function loadMarket(asset, request = fetch, now = Date.now()) {
  const attempts = [];
  for (const source of chainFor(asset)) {
    try {
      const [d15, d1h, d4h] = await Promise.all(['15m', '1h', '4h'].map(async tf => closedOnly(await SOURCES[source](asset, tf, request), tf, now)));
      const short = [['15m', d15], ['1h', d1h], ['4h', d4h]].find(([tf, b]) => b.length < MIN[tf]);
      if (short) throw Error(`мало свечей ${short[0]}: ${short[1].length}`);
      const extra = source === 'bybit' ? await bybitExtra(asset, request) : {funding_pct: null, oi_change_pct: null};
      return {source, d15, d1h, d4h, extra, attempts};
    } catch (e) {
      attempts.push({source, error: String(e.message || e).slice(0, 120)});
    }
  }
  throw Error('Нет данных: ' + attempts.map(a => SOURCE_LABELS[a.source] + ' — ' + a.error).join('; '));
}

export function findAsset(id) { return ASSETS.find(a => a.id === id); }

// Анализ одного актива. Только чтение данных и расчёт, без записи и без сделок.
export async function analyzeAsset(asset, request = fetch, now = Date.now(), detail = false) {
  const m = await loadMarket(asset, request, now), cfg = rulesFor(asset, m.source);
  const result = analyze(asset.binance || asset.id, m.d15, m.d1h, m.d4h, cfg, m.extra);
  const last = m.d15.at(-1), closedAt = last.t + 900000;
  const volume = m.d15.some(b => b.v > 0);
  const out = {
    id: asset.id, name: asset.name, group: asset.group, source: m.source,
    sourceName: SOURCE_LABELS[m.source] + (m.source === 'yahoo' ? ' · ' + (asset.note || asset.yahoo[0]) : ''),
    volume, price: last.c, closedAt, stale: now - closedAt > 3600000,
    signal: result.signal, reasons: result.reasons, extra: m.extra, fallbacks: m.attempts, checkedAt: now, fee_pct: cfg.fee_pct,
  };
  if (detail) {
    out.story = story(asset, m.d15, m.d1h, m.d4h, result, m.extra, cfg);
    out.chart = chartData(m.d15, m.d1h, features(m.d15, m.d1h, m.d4h, cfg));
  }
  return out;
}
