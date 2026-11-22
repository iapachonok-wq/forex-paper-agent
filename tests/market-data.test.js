import test from 'node:test';import assert from 'node:assert/strict';
import {loadMarket,analyzeAsset,findAsset,toFourHours} from '../src/market-data.js';
import {BYBIT,GATE,YAHOO} from '../src/markets.js';
// BYBIT используется и в проверке металлов и валют ниже.
const now=Date.UTC(2026,10,20,12,7);
// Ровный рост: тренд вверх, но без отката, значит сетапа нет.
function series(n,stepMs,end){return Array.from({length:n},(_,i)=>{const t=end-(n-i)*stepMs,c=100+i*0.05;return {t,o:c-0.02,h:c+0.05,l:c-0.05,c,v:10};});}
const step={15:900000,60:3600000,240:14400000};
const bybitRows=(iv,n)=>series(n,step[iv],Math.floor(now/step[iv])*step[iv]+step[iv]).reverse().map(b=>[String(b.t),String(b.o),String(b.h),String(b.l),String(b.c),String(b.v),'0']);
test('Bybit rows are reversed, the open candle dropped, funding and OI read',async()=>{
 const m=await loadMarket(findAsset('BTC'),async url=>{
  if(url.includes('/kline')){const iv=new URL(url).searchParams.get('interval');return {ok:true,json:async()=>({retCode:0,result:{list:bybitRows(+iv,{15:500,60:500,240:300}[iv])}})};}
  if(url.includes('/tickers'))return {ok:true,json:async()=>({retCode:0,result:{list:[{fundingRate:'0.0001'}]}})};
  if(url.includes('/open-interest'))return {ok:true,json:async()=>({retCode:0,result:{list:[{timestamp:'2',openInterest:'110'},{timestamp:'1',openInterest:'100'}]}})};
  throw Error('unexpected '+url);},now);
 assert.equal(m.source,'bybit');assert(m.d15.every((b,i)=>!i||b.t>m.d15[i-1].t));assert(m.d15.at(-1).t+900000<=now);assert.equal(m.d15.length,499);
 assert(Math.abs(m.extra.funding_pct-0.01)<1e-12);assert(Math.abs(m.extra.oi_change_pct-10)<1e-9);
});
test('blocked exchange falls back to the next source and reports it',async()=>{
 const urls=[];
 const r=await analyzeAsset(findAsset('ETH'),async url=>{urls.push(url);
  if(url.startsWith(BYBIT))return {ok:false,status:403};
  if(url.startsWith(GATE)){const tf=new URL(url).searchParams.get('interval'),ms={'15m':900000,'1h':3600000,'4h':14400000}[tf];return {ok:true,json:async()=>series(500,ms,Math.floor(now/ms)*ms+ms).map(b=>[String(b.t/1000),'0',String(b.c),String(b.h),String(b.l),String(b.o),String(b.v),'true'])};}
  throw Error('unexpected '+url);},now);
 assert.equal(r.source,'gate');assert.equal(r.fallbacks[0].source,'bybit');assert.match(r.fallbacks[0].error,/403/);
 assert.equal(r.signal,null);assert.equal(r.reasons.length,2);assert.match(r.reasons[1],/не в зоне/);assert.equal(r.volume,true);assert.equal(r.stale,false);
 assert(!urls.some(u=>u.includes('/tickers')),'funding only from Bybit');
});
test('metals use Yahoo; 4h candles built from hours; no source means a clear error',async()=>{
 const four=toFourHours([{t:0,o:1,h:2,l:0.5,c:1.5,v:1},{t:3600000,o:1.5,h:3,l:1,c:2,v:2},{t:14400000,o:2,h:2,l:2,c:2,v:1}]);
 assert.deepEqual(four,[{t:0,o:1,h:3,l:0.5,c:2,v:3},{t:14400000,o:2,h:2,l:2,c:2,v:1}]);
 const seen=[];await assert.rejects(analyzeAsset(findAsset('XAU'),async url=>{seen.push(url);return {ok:false,status:404};},now),/Нет данных: Bybit, бессрочные фьючерсы — HTTP 404; Yahoo Finance — HTTP 404/);
 assert(seen.some(u=>u.startsWith(BYBIT)&&u.includes('symbol=XAUUSDT')));assert(seen.some(u=>u.startsWith(YAHOO)&&u.includes('GC%3DF')));
 const fx=[];await assert.rejects(analyzeAsset(findAsset('EUR'),async url=>{fx.push(url);return {ok:false,status:404};},now));assert(fx.some(u=>u.includes('symbol=EURUSDUSDT')));assert(fx.some(u=>u.includes('EURUSD%3DX')));
 const jpy=[];await assert.rejects(analyzeAsset(findAsset('JPY'),async url=>{jpy.push(url);return {ok:false,status:404};},now));assert(jpy.every(u=>u.startsWith(YAHOO)&&u.includes('JPY%3DX')),'JPY has no USDT market, Yahoo only');
});
