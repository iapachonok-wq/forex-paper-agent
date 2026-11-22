import test from 'node:test';import assert from 'node:assert/strict';
import {ASSETS,probeSources,READERS,HOSTS,FUTURES,YAHOO,KUCOIN} from '../src/markets.js';
test('asset list covers crypto, metals and US indices',()=>{const ids=ASSETS.map(a=>a.id);for(const id of ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','TON','XAU','XAG','EUR','GBP','JPY','AUD','CHF','CAD','NZD','SPX','NDX'])assert(ids.includes(id),id);assert.equal(new Set(ids).size,ids.length);});
test('probe stays under Workers subrequest limit and only GETs known hosts',async()=>{
 const urls=[];
 const r=await probeSources(async(url,opts)=>{urls.push(url);assert.equal(opts.method,undefined);
  if(url.startsWith(FUTURES))return {ok:false,status:451};
  if(url.startsWith(YAHOO))return {ok:true,status:200,json:async()=>({chart:{result:[{timestamp:[1700000000],meta:{regularMarketPrice:2000},indicators:{quote:[{volume:[5]}]}}]}})};
  if(url.startsWith(KUCOIN)&&url.includes('TON'))throw Error('timeout');
  return {ok:true,status:200,json:async()=>[[1700000000000,'1','2','0.5','1.5','10',1700000899999]]};});
 assert(urls.length<=45,'subrequests '+urls.length);
 assert(urls.every(u=>HOSTS.some(h=>u.startsWith(h))));
 const fut=r.results.filter(x=>x.source==='binance_futures');assert(fut.length>=3&&fut.every(x=>!x.ok&&x.status===451));
 const ton=r.results.find(x=>x.symbol==='TON-USDT');assert.equal(ton.ok,false);assert.match(ton.error,/timeout/);
 const gold=r.results.find(x=>x.symbol==='GC=F');assert.equal(gold.price,2000);assert.equal(gold.lastTime,1700000000000);
});
test('readers pick the newest candle in every exchange format',()=>{
 assert.deepEqual(READERS.binance([[1000,'1','2','0','1.1','5'],[2000,'1','2','0','1.2','6']]),{lastTime:2000,price:1.2,volume:6});
 assert.deepEqual(READERS.kucoin({code:'200000',data:[['2','1','1.2','2','0','6','0'],['1','1','1.1','2','0','5','0']]}),{lastTime:2000,price:1.2,volume:6});
 assert.deepEqual(READERS.kraken({error:[],result:{XXBTZUSD:[[1,'1','2','0','1.1','1','5',3],[2,'1','2','0','1.2','1','6',3]],last:2}}),{lastTime:2000,price:1.2,volume:6});
 assert.deepEqual(READERS.coinbase([[2,0,2,1,1.2,6],[1,0,2,1,1.1,5]]),{lastTime:2000,price:1.2,volume:6});
 assert.deepEqual(READERS.okx({code:'0',data:[['2000','1','2','0','1.2','6'],['1000','1','2','0','1.1','5']]}),{lastTime:2000,price:1.2,volume:6});
 assert.deepEqual(READERS.bybit({retCode:0,result:{list:[['2000','1','2','0','1.2','6'],['1000','1','2','0','1.1','5']]}}),{lastTime:2000,price:1.2,volume:6});
 assert.deepEqual(READERS.gate([['1','5','1.1','2','0','1','5','true'],['2','6','1.2','2','0','1','6','false']]),{lastTime:2000,price:1.2,volume:6});
 assert.equal(READERS.yahoo({chart:{result:[{timestamp:[],meta:{}}]}}).ok,false);
});
