// Раздел «Рынки»: криптовалюты, металлы и индексы США. Только анализ, без сделок.
export const FUTURES = 'https://fapi.binance.com';
export const SPOT_MIRROR = 'https://data-api.binance.vision';
export const SPOT_MAIN = 'https://api.binance.com';
export const YAHOO = 'https://query1.finance.yahoo.com';
export const KUCOIN = 'https://api.kucoin.com';
export const KRAKEN = 'https://api.kraken.com';
export const COINBASE = 'https://api.exchange.coinbase.com';
export const OKX = 'https://www.okx.com';
export const BYBIT = 'https://api.bybit.com';
export const GATE = 'https://api.gateio.ws';
export const MEXC = 'https://api.mexc.com';
export const HOSTS = [FUTURES, SPOT_MIRROR, SPOT_MAIN, YAHOO, KUCOIN, KRAKEN, COINBASE, OKX, BYBIT, GATE, MEXC];

const COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'TRX', 'AVAX', 'LINK', 'TON', 'LTC'];
const YAHOO_CRYPTO = {TON: 'TON11419-USD'};
export const ASSETS = [
  ...COINS.map(c => ({id: c, name: c + '/USDT', group: 'crypto', binance: c + 'USDT', yahoo: [YAHOO_CRYPTO[c] || c + '-USD']})),
  // Металлы и валюты к USDT: бессрочные фьючерсы Bybit (с объёмом), запасной источник — Yahoo.
  {id: 'XAU', name: 'Золото XAU/USDT', group: 'metal', binance: 'XAUUSDT', oanda: 'XAU_USD', yahoo: ['GC=F'], note: 'фьючерс COMEX'},
  {id: 'XAG', name: 'Серебро XAG/USDT', group: 'metal', binance: 'XAGUSDT', oanda: 'XAG_USD', yahoo: ['SI=F'], note: 'фьючерс COMEX'},
  {id: 'EUR', name: 'EUR/USDT', group: 'fx', binance: 'EURUSDUSDT', oanda: 'EUR_USD', yahoo: ['EURUSD=X'], note: 'EUR/USD'},
  {id: 'GBP', name: 'GBP/USDT', group: 'fx', binance: 'GBPUSDUSDT', oanda: 'GBP_USD', yahoo: ['GBPUSD=X'], note: 'GBP/USD'},
  // Этих валют к USDT на доступных биржах нет: форекс-брокер OANDA (если сохранён профиль), иначе Yahoo без объёма.
  {id: 'JPY', name: 'USD/JPY', group: 'fx', oanda: 'USD_JPY', yahoo: ['JPY=X'], note: 'USD/JPY', chain: ['oanda', 'yahoo']},
  {id: 'AUD', name: 'AUD/USD', group: 'fx', oanda: 'AUD_USD', yahoo: ['AUDUSD=X'], note: 'AUD/USD', chain: ['oanda', 'yahoo']},
  {id: 'CHF', name: 'USD/CHF', group: 'fx', oanda: 'USD_CHF', yahoo: ['CHF=X'], note: 'USD/CHF', chain: ['oanda', 'yahoo']},
  {id: 'CAD', name: 'USD/CAD', group: 'fx', oanda: 'USD_CAD', yahoo: ['CAD=X'], note: 'USD/CAD', chain: ['oanda', 'yahoo']},
  {id: 'NZD', name: 'NZD/USD', group: 'fx', oanda: 'NZD_USD', yahoo: ['NZDUSD=X'], note: 'NZD/USD', chain: ['oanda', 'yahoo']},
  {id: 'SPX', name: 'S&P 500', group: 'index', oanda: 'SPX500_USD', yahoo: ['ES=F', '^GSPC'], note: 'фьючерс E-mini CME'},
  {id: 'NDX', name: 'Nasdaq 100', group: 'index', oanda: 'NAS100_USD', yahoo: ['NQ=F', '^NDX'], note: 'фьючерс E-mini CME'},
];
// Порядок источников: первый ответивший с достаточной историей используется для анализа.
// OANDA используется, только если на вкладке «Демо-счета» сохранён профиль OANDA Practice; иначе пропускается.
export const CHAINS = {crypto: ['bybit', 'gate', 'mexc', 'kraken', 'yahoo'], metal: ['bybit', 'oanda', 'yahoo'], fx: ['bybit', 'oanda', 'yahoo'], index: ['oanda', 'yahoo']};
export const chainFor = asset => asset.chain || CHAINS[asset.group];
// Оценка комиссии за одну сторону сделки, % (тейкер, без скидок). Для металлов и индексов —
// фьючерсы CME/COMEX, где комиссия брокера мала относительно цены; это ориентир, не тариф брокера.
// У OANDA комиссии нет, издержка — спред; здесь его типичная оценка в процентах на сторону.
export const FEES = {bybit: 0.055, gate: 0.1, mexc: 0.05, kraken: 0.4, oanda: {fx: 0.01, metal: 0.03, index: 0.01}, yahoo: {crypto: 0.1, metal: 0.01, index: 0.01, fx: 0.01}};
export const feeFor = (asset, source) => typeof FEES[source] === 'number' ? FEES[source] : FEES[source][asset.group];
export const SOURCE_LABELS = {bybit: 'Bybit, бессрочные фьючерсы', gate: 'Gate, спот', mexc: 'MEXC, спот', kraken: 'Kraken, спот к USD', oanda: 'OANDA Practice, средняя цена, тиковый объём', yahoo: 'Yahoo Finance'};
export const OANDA = 'https://api-fxpractice.oanda.com';

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

// Каждый читатель возвращает последнюю свечу: время открытия (мс), цену закрытия и объём.
const candle = (t, c, v) => Number.isFinite(t) && Number.isFinite(c) ? {lastTime: t, price: c, volume: v} : {ok: false, error: 'неожиданный формат'};
const newest = (rows, timeOf) => Array.isArray(rows) && rows.length ? rows.reduce((a, b) => timeOf(b) > timeOf(a) ? b : a) : null;
export const READERS = {
  binance: rows => { const x = newest(rows, r => Number(r[0])); return x ? candle(Number(x[0]), Number(x[4]), Number(x[5])) : {ok: false, error: 'пустой ответ'}; },
  yahoo: j => {
    const x = j.chart?.result?.[0];
    if (!x?.timestamp?.length) return {ok: false, error: 'нет свечей'};
    const q = x.indicators.quote[0], i = x.timestamp.length - 1;
    return candle(x.timestamp[i] * 1000, x.meta.regularMarketPrice, q.volume?.[i] ?? null);
  },
  kucoin: j => { const x = newest(j.data, r => Number(r[0])); return x ? candle(Number(x[0]) * 1000, Number(x[2]), Number(x[5])) : {ok: false, error: j.msg || 'пустой ответ'}; },
  kraken: j => { const rows = Object.entries(j.result || {}).find(([k]) => k !== 'last')?.[1]; const x = newest(rows, r => Number(r[0])); return x ? candle(Number(x[0]) * 1000, Number(x[4]), Number(x[6])) : {ok: false, error: (j.error || []).join(', ') || 'пустой ответ'}; },
  coinbase: rows => { const x = newest(rows, r => Number(r[0])); return x ? candle(Number(x[0]) * 1000, Number(x[4]), Number(x[5])) : {ok: false, error: 'пустой ответ'}; },
  okx: j => { const x = newest(j.data, r => Number(r[0])); return x ? candle(Number(x[0]), Number(x[4]), Number(x[5])) : {ok: false, error: j.msg || 'пустой ответ'}; },
  bybit: j => { const x = newest(j.result?.list, r => Number(r[0])); return x ? candle(Number(x[0]), Number(x[4]), Number(x[5])) : {ok: false, error: j.retMsg || 'пустой ответ'}; },
  gate: rows => { const x = newest(rows, r => Number(r[0])); return x ? candle(Number(x[0]) * 1000, Number(x[2]), Number(x[6])) : {ok: false, error: 'пустой ответ'}; },
};

// Проверка, какие источники отвечают из Cloudflare. Ничего не сохраняет.
export async function probeSources(request = fetch) {
  const jobs = [];
  const add = (source, symbol, url, read) => jobs.push(timed(request, url, read).then(r => ({source, symbol, ...r})));
  add('binance_futures', 'ping', FUTURES + '/fapi/v1/ping', () => ({}));
  for (const s of ['BTCUSDT', 'XAUUSDT', 'XAGUSDT']) add('binance_futures', s, `${FUTURES}/fapi/v1/klines?symbol=${s}&interval=15m&limit=2`, READERS.binance);
  add('binance_spot', 'BTCUSDT', `${SPOT_MAIN}/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2`, READERS.binance);
  add('binance_spot_mirror', 'BTCUSDT', `${SPOT_MIRROR}/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2`, READERS.binance);
  for (const s of ['BTC-USDT', 'BNB-USDT', 'TON-USDT']) add('kucoin', s, `${KUCOIN}/api/v1/market/candles?type=15min&symbol=${s}`, READERS.kucoin);
  for (const s of ['XBTUSD', 'TONUSD']) add('kraken', s, `${KRAKEN}/0/public/OHLC?pair=${s}&interval=15`, READERS.kraken);
  add('coinbase', 'BTC-USD', `${COINBASE}/products/BTC-USD/candles?granularity=900`, READERS.coinbase);
  add('okx', 'BTC-USDT', `${OKX}/api/v5/market/candles?instId=BTC-USDT&bar=15m&limit=2`, READERS.okx);
  add('bybit', 'BTCUSDT', `${BYBIT}/v5/market/kline?category=spot&symbol=BTCUSDT&interval=15&limit=2`, READERS.bybit);
  add('gate', 'BTC_USDT', `${GATE}/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=15m&limit=2`, READERS.gate);
  add('mexc', 'BTCUSDT', `${MEXC}/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2`, READERS.binance);
  for (const a of ASSETS) for (const y of a.yahoo) add('yahoo', y, `${YAHOO}/v8/finance/chart/${encodeURIComponent(y)}?interval=15m&range=5d`, READERS.yahoo);
  return {checkedAt: Date.now(), results: await Promise.all(jobs)};
}

// Какие валюты и металлы торгуются к USDT на биржах, доступных из Cloudflare. Отдельный вызов,
// чтобы не превысить лимит подзапросов основной проверки.
export const FIAT_BASES = ['XAU', 'XAG', 'EUR', 'GBP', 'JPY', 'AUD', 'CHF', 'CAD', 'NZD'];
export async function probeFiat(request = fetch) {
  const jobs = [], re = new RegExp('^(' + FIAT_BASES.join('|') + ')');
  const add = (source, symbol, url, read) => jobs.push(timed(request, url, read).then(r => ({source, symbol, ...r})));
  // Без токена OANDA отвечает 401 — значит, сервер из Cloudflare доступен.
  add('oanda', 'EUR_USD без токена', `${OANDA}/v3/instruments/EUR_USD/candles?count=2&granularity=M15`, () => ({}));
  for (const cat of ['linear', 'spot']) add('bybit', 'тикеры ' + cat, `${BYBIT}/v5/market/tickers?category=${cat}`, j => ({symbols: (j.result?.list || []).map(x => x.symbol).filter(s => re.test(s)).sort().join(' ') || 'нет'}));
  for (const b of FIAT_BASES) {
    add('mexc', b + 'USDT', `${MEXC}/api/v3/ticker/24hr?symbol=${b}USDT`, j => ({price: Number(j.lastPrice), volume: Number(j.quoteVolume)}));
    add('gate', b + '_USDT', `${GATE}/api/v4/spot/tickers?currency_pair=${b}_USDT`, j => ({price: Number(j[0]?.last), volume: Number(j[0]?.quote_volume)}));
  }
  return {checkedAt: Date.now(), results: await Promise.all(jobs)};
}
