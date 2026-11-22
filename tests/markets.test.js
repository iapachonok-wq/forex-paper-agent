import test from 'node:test';import assert from 'node:assert/strict';
import {ASSETS,probeSources,FUTURES,SPOT_MIRROR,SPOT_MAIN,YAHOO} from '../src/markets.js';
test('asset list covers crypto, metals and US indices',()=>{const ids=ASSETS.map(a=>a.id);for(const id of ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','TON','XAU','XAG','SPX','NDX'])assert(ids.includes(id),id);assert.equal(new Set(ids).size,ids.length);});
test('probe only sends GET to known market hosts and reports failures',async()=>{
 const urls=[];
 const r=await probeSources(async(url,opts)=>{urls.push(url);assert.equal(opts.method,undefined);
  if(url.startsWith(FUTURES))return {ok:false,status:451};
  if(url.startsWith(YAHOO))return {ok:true,status:200,json:async()=>({chart:{result:[{timestamp:[1700000000],meta:{regularMarketPrice:2000},indicators:{quote:[{volume:[5]}]}}]}})};
  if(url.includes('TONUSDT'))throw Error('timeout');
  return {ok:true,status:200,json:async()=>[[1700000000000,'1','2','0.5','1.5','10',1700000899999]]};});
 assert(urls.every(u=>[FUTURES,SPOT_MIRROR,SPOT_MAIN,YAHOO].some(h=>u.startsWith(h))));
 const fut=r.results.filter(x=>x.source==='binance_futures');assert(fut.length>=3&&fut.every(x=>!x.ok&&x.status===451));
 const ton=r.results.find(x=>x.symbol==='TONUSDT');assert.equal(ton.ok,false);assert.match(ton.error,/timeout/);
 const btc=r.results.find(x=>x.source==='binance_spot_mirror'&&x.symbol==='BTCUSDT');assert.equal(btc.price,1.5);assert.equal(btc.lastTime,1700000000000);
 const gold=r.results.find(x=>x.symbol==='GC=F');assert.equal(gold.price,2000);assert.equal(gold.lastTime,1700000000000);
});
