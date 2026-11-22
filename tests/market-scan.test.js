import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {scanStep,initialScanState,guard,settle,pending,sliceAt,GUARD,PER_RUN} from '../src/market-scan.js';
import {ASSETS} from '../src/markets.js';
const ref=JSON.parse(readFileSync(new URL('./market-rules-reference.json',import.meta.url),'utf8'));
const bars=rows=>rows.map(([t,o,h,l,c,v])=>({t,o,h,l,c,v}));
const sigCase=ref.cases.find(c=>c.signal?.side==='ЛОНГ'),m={source:'bybit',d15:bars(sigCase.d15),d1h:bars(sigCase.d1h),d4h:bars(sigCase.d4h),extra:sigCase.extra};
test('scanner records rule signals once, rotates assets and never re-checks a candle',async()=>{
 const st=initialScanState(),open=[],now=m.d15.at(-1).t+900000+60000;
 const a=await scanStep(st,open,async()=>m,now);
 assert.deepEqual(a.picked,ASSETS.slice(0,PER_RUN).map(x=>x.id));assert.equal(a.inserts.length,PER_RUN);assert.equal(st.count,PER_RUN);
 const s=a.inserts[0];assert.equal(s.entry,sigCase.signal.entry);assert.equal(s.stop,sigCase.signal.stop);assert.equal(s.signal.side,'ЛОНГ');assert.equal(st.board.BTC.state,'сигнал');
 st.pointer=0;const b=await scanStep(st,open,async()=>m,now+60000);assert.equal(b.inserts.length,0,'same candle is not signalled twice');
 const c=await scanStep(st,open,async()=>{throw Error('HTTP 403');},now);assert.equal(st.board[c.picked[0]].state,'нет данных');
});
test('risk guard: cooldown per asset, daily limit, open signals in one direction per group',()=>{
 const st=initialScanState(),t=Date.UTC(2026,10,20,12);
 st.last.BTC=t-3600000;assert.equal(guard({asset:'BTC',dir:1},'crypto',st,[],t),'пауза по активу');
 st.count=GUARD.max_signals_per_day;st.day='2026-11-20';assert.equal(guard({asset:'ETH',dir:1},'crypto',st,[],t),'дневной лимит сигналов');
 assert.equal(guard({asset:'ETH',dir:1},'crypto',st,[],t+86400000),null,'new UTC day resets the limit');
 const open=[{grp:'crypto',dir:1},{grp:'crypto',dir:1}];
 assert.match(guard({asset:'SOL',dir:1},'crypto',st,open,t+86400000),/открытых сигнала/);
 assert.equal(guard({asset:'SOL',dir:-1},'crypto',st,open,t+86400000),null);assert.equal(guard({asset:'XAU',dir:1},'metal',st,open,t+86400000),null);
});
test('outcome: stop checked first, then target, then time after 48 candles',()=>{
 const o={t:0,dir:1,entry:100,stop:99,tp1:102,rr:2};const bar=(i,l,h,c=100)=>({t:i*900000,o:100,h,l,c,v:1});
 assert.deepEqual(settle(o,[bar(1,98.5,102.5)]),{outcome:'стоп',r:-1,at:1800000});
 assert.equal(settle(o,[bar(1,99.5,102.5)]).outcome,'цель');assert.equal(settle(o,[bar(0,90,110),bar(1,99.5,101)]),null,'signal candle itself is ignored');
 const flat=Array.from({length:48},(_,i)=>bar(i+1,99.5,101,100.5));const r=settle(o,flat);assert.equal(r.outcome,'время');assert(Math.abs(r.r-0.5)<1e-12);
 const s={...o,dir:-1,entry:100,stop:101,tp1:98};assert.equal(settle(s,[bar(1,97.9,100.5)]).outcome,'цель');
});
test('only new candles are checked and history is cut at the candle close',()=>{
 assert.equal(pending(m.d15,undefined).length,1);assert.equal(pending(m.d15,m.d15.at(-1).t).length,0);assert.equal(pending(m.d15,m.d15.at(-10).t).length,2);
 const bar=m.d15.at(-5),h=sliceAt(m,bar),end=bar.t+900000;
 assert.equal(h.d15.at(-1).t,bar.t);assert(h.d1h.every(b=>b.t+3600000<=end));assert(h.d4h.every(b=>b.t+14400000<=end));
});
