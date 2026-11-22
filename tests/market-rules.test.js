import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {analyze,ema,rsi,atr,vwapDaily,fmt,RULES} from '../src/market-rules.js';
const ref=JSON.parse(readFileSync(new URL('./market-rules-reference.json',import.meta.url),'utf8'));
const bars=rows=>rows.map(([t,o,h,l,c,v])=>({t,o,h,l,c,v}));
const close=(a,b,label)=>{if(a===null||b===null)return assert.equal(a===null||Number.isNaN(a),b===null||Number.isNaN(b),label);assert(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);};
test('rule settings match the Python bot',()=>{for(const [k,v] of Object.entries(ref.cfg))assert.equal(RULES[k],v,k);});
test('indicators match pandas',()=>{
 const d15=bars(ref.indicators.d15),d1h=bars(ref.indicators.d1h),tail=a=>a.slice(-60);
 for(const [name,series] of [['ema50_1h',ema(d1h.map(b=>b.c),50)],['ema200_1h',ema(d1h.map(b=>b.c),200)],['rsi15',rsi(d15.map(b=>b.c))],['atr15',atr(d15)],['vwap15',vwapDaily(d15)]])
  tail(series).forEach((x,i)=>close(x,ref.indicators[name][i],name+'['+i+']'));
});
test('analyze() gives the same verdict, reasons and numbers as bot.py',()=>{
 const kinds=new Set();
 for(const c of ref.cases){
  const r=analyze('TESTUSDT',bars(c.d15),bars(c.d1h),bars(c.d4h),RULES,c.extra);
  assert.deepEqual(r.reasons,c.reasons,'seed '+c.seed);
  kinds.add(c.signal?c.signal.side:c.reasons.at(-1).split(' ')[0]);
  if(!c.signal){assert.equal(r.signal,null,'seed '+c.seed);continue;}
  for(const k of ['id','symbol','dir','side','time','warnings'])assert.deepEqual(r.signal[k],c.signal[k],k+' seed '+c.seed);
  for(const k of ['entry','stop','tp1','tp2','rr','risk_pct_price','qty','risk_usd','zone','rsi','atr15'])close(r.signal[k],c.signal[k],k+' seed '+c.seed);
  assert.equal(r.signal.levels.length,c.signal.levels.length);r.signal.levels.forEach((x,i)=>close(x,c.signal.levels[i],'level'));
 }
 for(const k of ['ЛОНГ','ШОРТ','стоп','цена','тренд','нет'])assert(kinds.has(k),'нет случая '+k);
});
test('commission lowers net RR, can reject a signal, and shrinks position size',()=>{
 const c=ref.cases.find(x=>x.signal),args=['TESTUSDT',bars(c.d15),bars(c.d1h),bars(c.d4h)];
 const base=analyze(...args,RULES,c.extra).signal,fee={...RULES,fee_pct:0.055},s=analyze(...args,fee,c.extra).signal;
 if(s){assert(s.rr_net<s.rr);assert(Math.abs(s.cost-s.entry*0.0011)<1e-9);assert(s.qty<base.qty);assert.equal(s.stop,base.stop);}
 const huge=analyze(...args,{...RULES,fee_pct:5},c.extra);assert.equal(huge.signal,null);assert.match(huge.reasons.at(-1),/^с учётом комиссии 5\.000 % за сторону/);
});
test('short history is rejected',()=>{const b=[{t:0,o:1,h:1,l:1,c:1,v:1}];assert.deepEqual(analyze('X',b,b,b).reasons,['мало истории']);});
test('price format matches Python fmt',()=>{assert.equal(fmt(105281.64),'105 281.6');assert.equal(fmt(2.5),'2.500');assert.equal(fmt(0.123456),'0.12346');});
