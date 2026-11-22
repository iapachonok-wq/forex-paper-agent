import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {analyze} from '../src/market-rules.js';import {story,chartData} from '../src/market-story.js';import {features} from '../src/market-rules.js';
import {loadMarket,findAsset} from '../src/market-data.js';import {KRAKEN,YAHOO} from '../src/markets.js';
const ref=JSON.parse(readFileSync(new URL('./market-rules-reference.json',import.meta.url),'utf8'));
const bars=rows=>rows.map(([t,o,h,l,c,v])=>({t,o,h,l,c,v}));
test('checklist agrees with the rule verdict for every reference case',()=>{
 for(const c of ref.cases){
  const d15=bars(c.d15),d1h=bars(c.d1h),d4h=bars(c.d4h),res=analyze('T',d15,d1h,d4h,undefined,c.extra),st=story({id:'T'},d15,d1h,d4h,res,c.extra);
  assert(st.trend&&st.up&&st.down&&st.plan,'seed '+c.seed);
  const last=c.reasons.at(-1);
  if(last.startsWith('тренд не'))assert.match(st.trend,/^Не определён/);
  else assert.equal(st.checks[0].ok,true);
  if(last.startsWith('цена не в зоне'))assert.equal(st.checks[1].ok,false,'zone seed '+c.seed);
  if(last.startsWith('нет разворотной'))assert.deepEqual(st.checks.slice(1,3).map(x=>x.ok),[true,false],'candle seed '+c.seed);
  if(last.startsWith('свеча есть'))assert.deepEqual(st.checks.map(x=>x.ok),[true,true,true,false],'confirm seed '+c.seed);
  if(c.signal){assert(st.checks.every(x=>x.ok),'signal seed '+c.seed);assert.match(st.plan,/^Сетап есть/);assert.equal(st.missing.length,0);}
  if(c.signal?.side==='ЛОНГ')assert.match(st.down,/против тренда/);
  // Готовность: сигнал — 100 %, без сигнала — до 95 %, без тренда — не выше 15 %.
  assert(st.score>=0&&st.score<=100);assert.equal(st.scoreParts.reduce((a,p)=>a+p.max,0)<=100,true);
  if(c.signal)assert.equal(st.score,100);else assert(st.score<=95);
  if(last.startsWith('тренд не'))assert(st.score<=15,'no trend seed '+c.seed);
  if(last.startsWith('свеча есть'))assert(st.score>=75,'only confirmation missing seed '+c.seed+' '+st.score);
  const ch=chartData(d15,d1h,features(d15,d1h,d4h));
  assert.equal(ch.bars.length,110);for(const k of ['ema50','ema200','vwap','rsi','volAvg'])assert.equal(ch[k].length,110,k);
  assert(ch.levels.every(Number.isFinite));
 }
});
test('Kraken fills the gap for TON; unaligned live Yahoo candle is dropped',async()=>{
 const now=Date.UTC(2026,10,20,12,7),rows=(sec,n)=>Array.from({length:n},(_,i)=>{const t=(Math.floor(now/1000/sec)-n+1+i)*sec,c=1+i*0.001;return [t,String(c),String(c+.002),String(c-.002),String(c),String(c),'5',3];});
 const m=await loadMarket(findAsset('TON'),async url=>{if(!url.startsWith(KRAKEN))return {ok:false,status:400};const iv=+new URL(url).searchParams.get('interval');return {ok:true,json:async()=>({error:[],result:{TONUSD:rows(iv*60,600),last:1}})};},now);
 assert.equal(m.source,'kraken');assert.deepEqual(m.attempts.map(a=>a.source),['bybit','gate','mexc']);assert(m.d15.at(-1).t+900000<=now);assert.equal(m.d15[0].v,5);
 const ts=Array.from({length:300},(_,i)=>Math.floor(now/900000-300+i)*900);ts.push(Math.floor(now/1000)-3);
 const q={open:ts.map(()=>2),high:ts.map(()=>2.1),low:ts.map(()=>1.9),close:ts.map(()=>2),volume:ts.map(()=>1)};
 const h=Array.from({length:600},(_,i)=>Math.floor(now/3600000-600+i)*3600);
 const y=await loadMarket(findAsset('XAU'),async url=>{assert(url.startsWith(YAHOO));const t=url.includes('interval=15m')?ts:h;return {ok:true,json:async()=>({chart:{result:[{timestamp:t,indicators:{quote:[{open:t.map(()=>2),high:t.map(()=>2.1),low:t.map(()=>1.9),close:t.map(()=>2),volume:t.map(()=>1)}]}}]}})};},now);
 assert(y.d15.every(b=>b.t%900000===0));assert(y.d4h.every(b=>b.t%14400000===0));
});
