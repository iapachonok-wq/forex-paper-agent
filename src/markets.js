// Раздел «Рынки»: криптовалюты, металлы и индексы США. Только анализ, без сделок.
export const FUTURES = 'https://fapi.binance.com';
export const SPOT_MIRROR = 'https://data-api.binance.vision';
export const SPOT_MAIN = 'https://api.binance.com';
export const YAHOO = 'https://query1.finance.yahoo.com';

const COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK', 'TON', 'LTC'];
export const ASSETS = [
  ...COINS.map(c => ({id: c, name: c + '/USDT', group: 'crypto', binance: c + 'USDT'})),
  {id: 'XAU', name: 'Золото XAU/USD', group: 'metal', binance: 'XAUUSDT', yahoo: ['GC=F', 'XAUUSD=X']},
  {id: 'XAG', name: 'Серебро XAG/USD', group: 'metal', binance: 'XAGUSDT', yahoo: ['SI=F', 'XAGUSD=X']},
  {id: 'SPX', name: 'S&P 500', group: 'index', yahoo: ['^GSPC', 'ES=F']},
  {id: 'NDX', name: 'Nasdaq 100', group: 'index', yahoo: ['^NDX', 'NQ=F']},
];

async function timed(request, url, read) {
  const started = Date.now();
  try {
    const r = await request(url, {headers: {'User-Agent': 'forex-paper-agent/1.0'}, signal: AbortSignal.timeout(8000)});
    const ms = Date.now() - started;
    if (!r.ok) return {ok: false, status: r.status, ms};
    return {ok: true, status: r.status, ms, ...read(await r.json())};
  } catch (e) {
    return {ok: false, status: 0, ms: Date.now() - started, error: String(e.message || e).slice(0, 120)};
  }
}

// Binance klines: [openTime, o, h, l, c, v, closeTime, ...]
const binanceRead = rows => {
  const last = Array.isArray(rows) ? rows.at(-1) : null;
  if (!last) return {ok: false, error: 'пустой ответ'};
  return {lastTime: Number(last[0]), price: Number(last[4]), volume: Number(last[5])};
};
const yahooRead = j => {
  const x = j.chart?.result?.[0];
  if (!x?.timestamp?.length) return {ok: false, error: 'нет свечей'};
  const q = x.indicators.quote[0], i = x.timestamp.length - 1;
  return {lastTime: x.timestamp[i] * 1000, price: x.meta.regularMarketPrice, volume: q.volume?.[i] ?? null};
};

// Проверка, какие источники отвечают из Cloudflare. Ничего не сохраняет.
export async function probeSources(request = fetch) {
  const jobs = [];
  const add = (source, symbol, url, read) => jobs.push(timed(request, url, read).then(r => ({source, symbol, ...r})));
  add('binance_futures', 'ping', FUTURES + '/fapi/v1/ping', () => ({}));
  for (const s of ['BTCUSDT', 'XAUUSDT', 'XAGUSDT']) add('binance_futures', s, `${FUTURES}/fapi/v1/klines?symbol=${s}&interval=15m&limit=2`, binanceRead);
  add('binance_spot', 'BTCUSDT', `${SPOT_MAIN}/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2`, binanceRead);
  for (const a of ASSETS.filter(a => a.group === 'crypto')) add('binance_spot_mirror', a.binance, `${SPOT_MIRROR}/api/v3/klines?symbol=${a.binance}&interval=15m&limit=2`, binanceRead);
  for (const a of ASSETS) for (const y of a.yahoo || []) add('yahoo', y, `${YAHOO}/v8/finance/chart/${encodeURIComponent(y)}?interval=15m&range=1d`, yahooRead);
  return {checkedAt: Date.now(), results: await Promise.all(jobs)};
}
