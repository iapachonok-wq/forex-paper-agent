import test from 'node:test';import assert from 'node:assert/strict';
import {loadMarket,analyzeAsset,findAsset} from '../src/market-data.js';import {OANDA} from '../src/markets.js';
const now=Date.UTC(2026,10,20,12,7),token='practice-token-123456';
const iso=ms=>new Date(ms).toISOString().replace('.000Z','.000000000Z');
function oanda(url,opts){
 assert(url.startsWith(OANDA+'/v3/instruments/'));assert.equal(opts.method,undefined,'read only');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+token);
 const q=new URL(url).searchParams,step={M15:900000,H1:3600000,H4:14400000}[q.get('granularity')],n=+q.get('count');
 assert.equal(q.get('alignmentTimezone'),'UTC');
 const end=Math.floor(now/step)*step;
 const candles=Array.from({length:n},(_,i)=>{const t=end-(n-1-i)*step,c=1.1+i*1e-4;return {time:iso(t),complete:t+step<=now,volume:40+i,mid:{o:String(c),h:String(c+2e-4),l:String(c-2e-4),c:String(c)}};});
 return {ok:true,json:async()=>({instrument:'X',granularity:q.get('granularity'),candles})};
}
test('with a saved OANDA profile, forex pairs and indices use OANDA candles with tick volume',async()=>{
 const urls=[];const m=await loadMarket(findAsset('JPY'),async(u,o)=>{urls.push(u);return oanda(u,o);},now,{oandaToken:token});
 assert.equal(m.source,'oanda');assert(urls.every(u=>u.includes('/USD_JPY/')));assert(m.d15.length>=120&&m.d15.every(b=>b.t+900000<=now));assert(m.d15[0].v>0);assert(m.d4h.every(b=>b.t%14400000===0));
 const spx=await analyzeAsset(findAsset('SPX'),async(u,o)=>oanda(u,o),now,false,{oandaToken:token});assert.equal(spx.source,'oanda');assert.equal(spx.volume,true);assert.equal(spx.fee_pct,0.01);
});
test('Bybit stays first for EUR/USDT; OANDA is the fallback; errors never echo the token',async()=>{
 const r=await analyzeAsset(findAsset('EUR'),async(u,o)=>u.includes('bybit')?{ok:false,status:403}:oanda(u,o),now,false,{oandaToken:token});
 assert.equal(r.source,'oanda');assert.equal(r.fallbacks[0].source,'bybit');
 await assert.rejects(analyzeAsset(findAsset('CHF'),async u=>({ok:false,status:401}),now,false,{oandaToken:token}),e=>!e.message.includes(token)&&/OANDA HTTP 401/.test(e.message));
});
