import '../public/market-clock.js';
import cfg from './config.js';
export function initial(){return {cash:10000,positions:{},entries:{},peak:10000,trades:[],halted:false,lastAnalysis:{},prices:{},usage:0,month:'',enabled:false,lastWatch:0,lastError:null};}
export function equity(s,prices){return s.cash+Object.entries(s.positions).reduce((a,[k,q])=>a+q*(prices[k]??0),0);}
export function closedMarket(now=Date.now()){return globalThis.FxSchedule.closed(now);}
export function check(p,s,prices,now=Date.now()){
 const no=reason=>({approved:false,reason}); const unit=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
 if(s.halted)return no('Стоп по просадке');
 if(!p||!['BUY','SELL','HOLD'].includes(p.action)||!cfg.symbols.includes(p.symbol))return no('Некорректное решение');
 if(p.action==='HOLD')return no('Ожидание');
 if(p.injection_suspected!==false||!unit(p.confidence)||!unit(p.size_fraction))return no('Некорректные параметры');
 if(p.confidence<cfg.risk.min_confidence)return no('Недостаточная уверенность');
 if(!cfg.symbols.every(k=>Number.isFinite(prices[k])&&prices[k]>0))return no('Нет котировки');
 if(s.trades.filter(t=>now-t.ts<86400000).length>=cfg.risk.max_trades_per_day)return no('Дневной лимит');
 if(s.trades.some(t=>t.symbol===p.symbol&&now-t.ts<cfg.risk.cooldown_minutes*60000))return no('Пауза между сделками');
 const eq=equity(s,prices),held=(s.positions[p.symbol]||0)*prices[p.symbol],cap=eq*cfg.risk.max_trade_fraction;
 if(!Number.isFinite(eq)||eq<=0||!Number.isFinite(s.cash))return no('Счёт некорректен');
 const amount=p.action==='BUY'?Math.min(p.size_fraction*eq,cap,cfg.risk.max_position_fraction*eq-held,cfg.risk.max_total_exposure_fraction*eq-(eq-s.cash),s.cash*.99):Math.min(p.size_fraction*held,held,cap);
 return amount>=10?{approved:true,side:p.action,amount,reason:'Разрешено'}:no('Нет позиции или достигнут лимит');
}
export function execute(s,symbol,side,amount,price,now=Date.now()){
 if(!['BUY','SELL'].includes(side)||![amount,price].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid fill');
 const fill=price*(side==='BUY'?1+cfg.slippage_rate:1-cfg.slippage_rate);let qty,fee;
 if(side==='BUY'){fee=amount*cfg.fee_rate;if(amount+fee>s.cash)throw Error('No cash');qty=amount/fill;
 const old=s.positions[symbol]||0;s.entries[symbol]=((s.entries[symbol]||0)*old+fill*qty)/(old+qty);s.positions[symbol]=old+qty;s.cash-=amount+fee;
 }else{qty=Math.min(s.positions[symbol]||0,amount/fill);if(qty<=0)throw Error('No position');fee=qty*fill*cfg.fee_rate;s.cash+=qty*fill-fee;s.positions[symbol]-=qty;if(s.positions[symbol]<1e-8){delete s.positions[symbol];delete s.entries[symbol];}}
 const trade={ts:now,symbol,side,qty,price:fill,fee};s.trades.push(trade);return trade;
}
export function watch(s,prices,now=Date.now()){
 const eq=equity(s,prices);s.peak=Math.max(s.peak,eq);if(eq<=s.peak*(1-cfg.risk.max_drawdown_fraction))s.halted=true;
 const trades=[];for(const [symbol,q] of Object.entries(s.positions)){if(s.halted||prices[symbol]<=s.entries[symbol]*(1-cfg.watchdog.stop_loss_fraction))trades.push(execute(s,symbol,'SELL',q*prices[symbol],prices[symbol],now));}return trades;
}
export function scenario(name){const s=initial();const prices={EURUSD:1.1,GBPUSD:1.25};const steps=[];const now=1700000000000;
 const proposal={symbol:'EURUSD',action:'BUY',size_fraction:.1,confidence:.8,injection_suspected:false};
 if(name==='hold')proposal.action='HOLD';else if(name==='injection')proposal.injection_suspected=true;else if(!['roundtrip','stop'].includes(name))throw Error('Unknown scenario');
 const v=check(proposal,s,prices,now);steps.push({step:'Предложение → риск-менеджер',...v});if(v.approved)steps.push({step:'Бумажная покупка',...execute(s,'EURUSD',v.side,v.amount,prices.EURUSD,now)});
 if(name==='roundtrip'){prices.EURUSD=1.122;const sell=check({...proposal,action:'SELL',size_fraction:1},s,prices,now+7200000);steps.push({step:'Проверка продажи',...sell});if(sell.approved)steps.push({step:'Бумажная продажа',...execute(s,'EURUSD',sell.side,sell.amount,prices.EURUSD,now+7200000)});}
 if(name==='stop'){prices.EURUSD=1.07;steps.push(...watch(s,prices,now+300000).map(t=>({step:'Выход по стопу с гэпом',...t})));}
 return {name,synthetic:true,steps,equity:equity(s,prices),pnl:equity(s,prices)-10000,paidCalls:0};}
const sma=(a,n)=>{a=a.slice(-n);return a.reduce((x,y)=>x+y,0)/a.length;};
const ema=(a,n)=>{const k=2/(n+1),o=[a[0]];for(const x of a.slice(1))o.push(x*k+o.at(-1)*(1-k));return o;};
export function summarize(b){if(b.length<50)throw Error('Недостаточно свечей');const c=b.map(x=>x.c),last=c.at(-1),pct=(a,z)=>(a/z-1)*100;
 let g=0,l=0;for(let i=1;i<c.length;i++){const d=c[i]-c[i-1];if(i<=14){g+=Math.max(0,d)/14;l+=Math.max(0,-d)/14;}else{g=(g*13+Math.max(0,d))/14;l=(l*13+Math.max(0,-d))/14;}}
 const fast=ema(c,12),slow=ema(c,26),line=fast.map((x,i)=>x-slow[i]),sig=ema(line,9).at(-1);let atr=0;
 for(let i=1;i<b.length;i++){const tr=Math.max(b[i].h-b[i].l,Math.abs(b[i].h-b[i-1].c),Math.abs(b[i].l-b[i-1].c));atr=i<=14?atr+tr/14:(atr*13+tr)/14;}
 return {last_price:last,bars:b.length,return_1_bar_pct:pct(last,c.at(-2)),return_10_bars_pct:pct(last,c.at(-11)),price_vs_sma20_pct:pct(last,sma(c,20)),price_vs_sma50_pct:pct(last,sma(c,50)),sma20_vs_sma50_pct:pct(sma(c,20),sma(c,50)),rsi_14:l===0?(g?100:50):100-100/(1+g/l),macd_pct:line.at(-1)/last*100,macd_signal_pct:sig/last*100,macd_hist_pct:(line.at(-1)-sig)/last*100,atr_14_pct:atr/last*100,volume_vs_avg20:null,dist_to_50bar_high_pct:pct(Math.max(...b.slice(-50).map(x=>x.h)),last),dist_to_50bar_low_pct:pct(Math.min(...b.slice(-50).map(x=>x.l)),last)};
}
export function aggregate(b,seconds){const out=[];for(const x of b){const t=Math.floor(x.t/seconds)*seconds,prev=out.at(-1);if(prev?.t===t){prev.h=Math.max(prev.h,x.h);prev.l=Math.min(prev.l,x.l);prev.c=x.c;}else out.push({...x,t});}return out;}
