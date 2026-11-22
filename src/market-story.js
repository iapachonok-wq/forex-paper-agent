// Разбор словами и данные для графика. Всё считает код по тем же формулам, что и правило; ИИ не участвует.
import {features, divergence, fmt, ema, rsi, vwapDaily, RULES} from './market-rules.js';

const pct = (a, b) => (a / b - 1) * 100;
const signedPct = x => (x >= 0 ? '+' : '') + x.toFixed(2) + ' %';

// Проверка каждого условия правила отдельно, чтобы показать, чего не хватает.
export function checklist(d15, f, d, cfg = RULES) {
  const recent = d15.slice(-3), touch = d > 0 ? Math.min(...recent.map(b => b.l)) : Math.max(...recent.map(b => b.h));
  const cands = [['EMA50 (1ч)', f.e50.at(-1)], ['VWAP', f.vw.at(-1)], ...(d > 0 ? f.supports : f.resists).map(x => ['уровень ' + fmt(x), x])];
  const near = cands.filter(([, x]) => Math.abs(touch - x) <= f.zone && (d > 0 ? x <= f.price : x >= f.price));
  const candle = d > 0 ? f.last.c > f.last.o && f.last.c > f.prev.h : f.last.c < f.last.o && f.last.c < f.prev.l;
  const volRatio = f.last.v / f.volAvg, volOk = f.last.v > cfg.volume_mult * f.volAvg, divOk = divergence(d15, f.r15, d);
  return {touch, cands, near, candle, volRatio, volOk, divOk};
}

export function story(asset, d15, d1h, d4h, result, extra = {}, cfg = RULES) {
  const f = features(d15, d1h, d4h, cfg), price = f.price, e50 = f.e50.at(-1), e200 = f.e200.at(-1), vw = f.vw.at(-1), r = f.r15.at(-1);
  const out = {trend: '', levels: [], context: [], up: '', down: '', plan: '', checks: [], missing: []};
  const d = f.up ? 1 : f.down ? -1 : 0;

  // Тренд
  const c4 = d4h.at(-1).c, e4 = f.e50_4h.at(-1);
  if (d) out.trend = `${d > 0 ? 'Вверх' : 'Вниз'}: цена ${fmt(price)} ${d > 0 ? 'выше' : 'ниже'} EMA200 (1ч) ${fmt(e200)}, EMA50 ${fmt(e50)} ${d > 0 ? 'выше' : 'ниже'} EMA200, закрытие 4ч ${d > 0 ? 'выше' : 'ниже'} EMA50 (4ч) ${fmt(e4)}.`;
  else {
    const parts = [`цена ${price > e200 ? 'выше' : 'ниже'} EMA200 (1ч) ${fmt(e200)}`, `EMA50 ${fmt(e50)} ${e50 > e200 ? 'выше' : 'ниже'} EMA200`, `закрытие 4ч ${c4 > e4 ? 'выше' : 'ниже'} EMA50 (4ч) ${fmt(e4)}`];
    out.trend = 'Не определён: ' + parts.join(', ') + '. Признаки смотрят в разные стороны, правило ждёт согласия 1ч и 4ч.';
  }

  // Уровни: ближайшие три снизу и сверху, по разворотам часового графика за 240 свечей.
  for (const x of [...f.supports].reverse().slice(0, 3)) out.levels.push({kind: 'поддержка', price: x, pct: pct(x, price)});
  for (const x of f.resists.slice(0, 3)) out.levels.push({kind: 'сопротивление', price: x, pct: pct(x, price)});
  out.context.push(`VWAP за сутки ${Number.isFinite(vw) ? fmt(vw) + ' (' + signedPct(pct(vw, price)) + ' от цены)' : 'не считается: у источника нет объёма'}.`);
  out.context.push(`EMA50 (1ч) ${fmt(e50)} (${signedPct(pct(e50, price))}).`);
  out.context.push(`RSI 14 на 15м: ${Number.isFinite(r) ? r.toFixed(0) + (r >= 70 ? ', перекупленность' : r <= 30 ? ', перепроданность' : ', нейтрально') : 'нет данных'}.`);
  out.context.push(`Типичный ход часовой свечи (ATR 1ч): ${fmt(f.a1h)} (${(f.a1h / price * 100).toFixed(2)} %).`);
  if (Number.isFinite(f.volAvg) && f.volAvg > 0) out.context.push(`Объём последней 15м свечи: ${(f.last.v / f.volAvg).toFixed(1)}× от среднего за 20.`);
  if (extra.funding_pct != null) out.context.push(`Ставка финансирования ${(extra.funding_pct >= 0 ? '+' : '') + extra.funding_pct.toFixed(4)} %${Math.abs(extra.funding_pct) >= cfg.funding_warn_pct ? ': заметный перекос толпы' : ''}.`);
  if (extra.oi_change_pct != null) out.context.push(`Открытый интерес за 24 ч: ${signedPct(extra.oi_change_pct)}.`);

  // Сценарии
  const r1 = f.resists[0], r2 = f.resists[1], s1 = f.supports.at(-1), s2 = f.supports.at(-2);
  out.up = r1 ? `Вверх: закрытие 15м свечи выше ${fmt(r1)} (${signedPct(pct(r1, price))}) открывает путь к ${r2 ? fmt(r2) : 'следующей зоне'}${r2 ? ' (' + signedPct(pct(r2, price)) + ')' : ''}.` : `Вверх: близких сопротивлений нет, ориентир — 2 ATR (1ч): ${fmt(price + 2 * f.a1h)}.`;
  out.down = s1 ? `Вниз: закрытие 15м свечи ниже ${fmt(s1)} (${signedPct(pct(s1, price))}) открывает путь к ${s2 ? fmt(s2) : 'следующей зоне'}${s2 ? ' (' + signedPct(pct(s2, price)) + ')' : ''}.` : `Вниз: близких поддержек нет, ориентир — 2 ATR (1ч): ${fmt(price - 2 * f.a1h)}.`;
  if (d > 0) out.down += ' Это против тренда: шорт правило не рассматривает.';
  if (d < 0) out.up += ' Это против тренда: лонг правило не рассматривает.';

  // Что именно не выполнено
  if (!d) {
    out.checks.push({ok: false, text: 'Тренд: 1ч и 4ч не согласны.'});
    out.missing.push('Согласия трендов: цена и EMA50 по одну сторону от EMA200 на 1ч, и 4ч в ту же сторону.');
    out.plan = 'Сетапа нет, пока нет тренда. Вход и стоп не рассчитываются.';
  } else {
    const c = checklist(d15, f, d, cfg);
    out.checks.push({ok: true, text: `Тренд ${d > 0 ? 'вверх' : 'вниз'}.`});
    out.checks.push({ok: c.near.length > 0, text: c.near.length ? `Зона: цена у ${c.near.map(x => x[0]).join(', ')}.` : `Зона: последние три свечи не дошли до EMA50, VWAP или уровня ближе чем на ${fmt(f.zone)} (0,6 ATR 1ч).`});
    out.checks.push({ok: c.candle, text: c.candle ? 'Разворотная свеча 15м есть.' : `Разворотной свечи нет: нужна ${d > 0 ? 'зелёная свеча с закрытием выше максимума' : 'красная свеча с закрытием ниже минимума'} предыдущей.`});
    out.checks.push({ok: c.volOk || c.divOk, text: c.volOk ? `Объём ${c.volRatio.toFixed(1)}× от среднего (нужно больше ${cfg.volume_mult}×).` : c.divOk ? 'Расхождение RSI с ценой есть.' : `Нет подтверждения: объём ${Number.isFinite(c.volRatio) ? c.volRatio.toFixed(1) + '×' : 'нет данных'} при нужных ${cfg.volume_mult}×, расхождения RSI нет.`});
    for (const x of out.checks) if (!x.ok) out.missing.push(x.text);
    // Где был бы вход: ближайшая зона по ходу тренда, которая не дальше цены.
    const zones = c.cands.filter(([, x]) => Number.isFinite(x) && (d > 0 ? x <= price : x >= price)).sort((a, b) => d > 0 ? b[1] - a[1] : a[1] - b[1]);
    const [zname, z] = zones[0] || [];
    if (result.signal) out.plan = `Сетап есть: вход ${fmt(result.signal.entry)}, стоп ${fmt(result.signal.stop)}, цель ${fmt(result.signal.tp1)}.`;
    else if (!zones.length) out.plan = `Зоны для отката ${d > 0 ? 'ниже' : 'выше'} цены нет. Ждать отката к EMA50 (1ч) или уровню.`;
    else {
      const stop = z - d * 0.5 * f.a15, risk = Math.abs(z - stop), stopPct = risk / z * 100;
      const barrier = (d > 0 ? f.resists : [...f.supports].sort((a, b) => b - a)).find(b => (b - z) * d > 0);
      const rr = barrier ? Math.abs(barrier - z) / risk : null;
      out.plan = `Вход рассматривать у ${zname} ≈ ${fmt(z)} (${signedPct(pct(z, price))}) после разворотной свечи 15м с объёмом или расхождением RSI. Стоп — за экстремумом отката, ориентир ${fmt(stop)} (${stopPct.toFixed(2)} % от входа)${stopPct > cfg.max_stop_pct ? ': шире предела 2 %, сигнал не пройдёт' : ''}. ` +
        (barrier ? `До ${d > 0 ? 'сопротивления' : 'поддержки'} ${fmt(barrier)} ≈ ${rr.toFixed(1)} R${rr < cfg.min_rr ? ': меньше 1,5 R, сигнал не пройдёт' : ''}.` : `Ближайших ${d > 0 ? 'сопротивлений' : 'поддержек'} нет, цель была бы 2 R.`) +
        ' Точный стоп зависит от свечей отката.';
    }
  }
  if (!d15.some(b => b.v > 0)) out.missing.push('У источника нет объёма: условие по объёму не выполнится, остаётся расхождение RSI.');
  return out;
}

// Данные для графика: последние 110 свечей 15м и индикаторы на них.
export function chartData(d15, d1h, f, bars = 110) {
  const e50 = ema(d1h.map(b => b.c), 50), e200 = ema(d1h.map(b => b.c), 200), vw = vwapDaily(d15), r = rsi(d15.map(b => b.c));
  const start = Math.max(0, d15.length - bars), part = d15.slice(start);
  let j = -1;
  const hourly = part.map(b => { while (j + 1 < d1h.length && d1h[j + 1].t <= b.t) j++; return j < 0 ? [null, null] : [e50[j], e200[j]]; });
  const num = x => Number.isFinite(x) ? +x.toPrecision(8) : null;
  return {
    bars: part.map(b => [b.t, b.o, b.h, b.l, b.c, b.v]),
    ema50: hourly.map(x => num(x[0])), ema200: hourly.map(x => num(x[1])),
    // Разрыв линии VWAP на смене суток, как в bot.py.
    vwap: part.map((b, i) => i && Math.floor(b.t / 86400000) !== Math.floor(part[i - 1].t / 86400000) ? null : num(vw[start + i])),
    rsi: part.map((b, i) => num(r[start + i])),
    volAvg: part.map((b, i) => { const k = start + i; return k >= 19 ? num(d15.slice(k - 19, k + 1).reduce((a, x) => a + x.v, 0) / 20) : null; }),
    levels: [...f.supports.slice(-3), ...f.resists.slice(0, 3)].map(num),
  };
}
