import {safeHeadlines} from './guard.js';
import {aggregate,summarize} from './engine.js';
export async function market(symbol,allowStale=false){
 const now=Date.now()/1000;
 async function get(interval,range){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}=X?interval=${interval}&range=${range}`,{headers:{'User-Agent':'forex-paper-agent/1.0'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Yahoo HTTP ${r.status}`);const j=await r.json(),x=j.chart?.result?.[0];if(!x)throw Error('Yahoo empty');const q=x.indicators.quote[0];const bars=x.timestamp.map((t,i)=>({t,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i]})).filter(b=>[b.o,b.h,b.l,b.c].every(v=>Number.isFinite(v)&&v>0));return {bars,quoteTime:x.meta.regularMarketTime,price:x.meta.regularMarketPrice};}
 const h=await get('60m','1mo'),d=await get('1d','6mo');
 if(!Number.isFinite(h.price)||h.price<=0||!h.quoteTime||(!allowStale&&now-h.quoteTime>1800))throw Error('Котировка устарела');
 const out={};for(const [tf,b,sec] of [['1h',h.bars,3600],['4h',aggregate(h.bars,14400),14400],['1d',d.bars,86400]]){const closed=b.filter(x=>x.t+sec<=now).slice(-100);out[tf]=summarize(closed);out[tf].live_vs_last_close_pct=(h.price/closed.at(-1).c-1)*100;out[tf].last_price=h.price;}
 return {price:h.price,quoteTime:h.quoteTime,stale:now-h.quoteTime>1800,indicators:out};
}
export async function quotes(){const out={};for(const s of ['EURUSD','GBPUSD']){const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${s}=X?interval=5m&range=5d`,{headers:{'User-Agent':'forex-paper-agent/1.0'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Yahoo '+s+' HTTP '+r.status);const x=(await r.json()).chart?.result?.[0]?.meta;if(!x||!Number.isFinite(x.regularMarketTime)||Date.now()/1000-x.regularMarketTime>1800||!Number.isFinite(x.regularMarketPrice)||x.regularMarketPrice<=0)throw Error('Котировка устарела');out[s]=x.regularMarketPrice;}return out;}
export async function headlines(){
 const urls=['https://www.fxstreet.com/rss/news','https://www.federalreserve.gov/feeds/press_monetary.xml','https://www.bankofengland.co.uk/rss/news'];const all=[];
 for(const url of urls){try{const r=await fetch(url,{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;const txt=await r.text();if(txt.length>200000)continue;const blocks=txt.match(/<item[\s>][\s\S]*?<\/item>/gi)||[];for(const block of blocks.slice(0,5)){const match=block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);if(!match)continue;const title=match[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim();if(title.length>300||/[<>]|ignore.*instruction|system prompt|api.key|wallet|transfer funds/i.test(title))continue;all.push(title);}}catch{}}
 return safeHeadlines(all);
}

export async function chartBars(symbol,timeframe){
 const interval=timeframe==='1d'?'1d':'60m',range=timeframe==='1d'?'6mo':'1mo';
 const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}=X?interval=${interval}&range=${range}`,{headers:{'User-Agent':'forex-paper-agent/1.0'},signal:AbortSignal.timeout(15000),cf:{cacheTtl:60,cacheEverything:true}});
 if(!r.ok)throw Error('Источник свечей недоступен: '+r.status);
 const x=(await r.json()).chart?.result?.[0],q=x?.indicators?.quote?.[0];
 if(!q||!x.timestamp)throw Error('Источник не вернул свечи');
 let bars=x.timestamp.map((t,i)=>({t,o:q.open[i],h:q.high[i],l:q.low[i],c:q.close[i]})).filter(b=>[b.o,b.h,b.l,b.c].every(v=>Number.isFinite(v)&&v>0));
 if(timeframe==='4h')bars=aggregate(bars,14400);
 return {bars:bars.slice(-240),quoteTime:x.meta.regularMarketTime,source:'Yahoo Finance',timeframe,symbol};
}
