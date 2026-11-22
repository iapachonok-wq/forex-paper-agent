import cfg from './config.js';
import {check,execute,equity,closedMarket} from './engine.js';
export function expire(s,now=Date.now()){s.pending??=[];for(const p of s.pending)if(p.status==='pending'&&p.expires<=now)p.status='expired';s.pending=s.pending.filter(p=>p.status==='pending'||now-p.created<86400000);}
export function enqueue(s,proposal,verdict,price,protective=false,now=Date.now()){
 expire(s,now);
 const existing=s.pending.find(p=>p.status==='pending'&&p.proposal.symbol===proposal.symbol);
 if(existing){if(!protective||existing.protective)return null;existing.status='superseded';}
 const p={id:crypto.randomUUID(),created:now,expires:now+15*60000,status:'pending',proposal,amount:verdict.amount,price,protective};s.pending.push(p);return p;
}
export function queueProtection(s,prices,now=Date.now()){
 expire(s,now);const eq=equity(s,prices);s.peak=Math.max(s.peak,eq);if(eq<=s.peak*(1-cfg.risk.max_drawdown_fraction))s.halted=true;
 const added=[];for(const [symbol,qty] of Object.entries(s.positions)){if(qty>0&&(s.halted||prices[symbol]<=s.entries[symbol]*(1-cfg.watchdog.stop_loss_fraction))){const p=enqueue(s,{symbol,action:'SELL',reasoning:s.halted?'Защитный выход: предельная просадка':'Защитный выход: стоп-лосс'},{amount:qty*prices[symbol]},prices[symbol],true,now);if(p)added.push(p);}}return added;
}
export function resolve(s,id,action,prices,now=Date.now()){
 expire(s,now);const p=s.pending.find(p=>p.id===id);if(!p)throw Error('Заявка не найдена');
 if(p.status!=='pending')return {id,status:p.status,trade:p.trade||null};
 if(action==='reject'){p.status='rejected';return {id,status:p.status};}
 if(action!=='approve')throw Error('Неизвестное действие');
 if(!s.enabled)throw Error('Агент на паузе');if(closedMarket(now))throw Error('Рынок закрыт');
 if(!cfg.symbols.every(k=>Number.isFinite(prices[k])&&prices[k]>0))throw Error('Нет свежих котировок');
 if(Math.abs(prices[p.proposal.symbol]/p.price-1)>.005){p.status='invalidated';return {id,status:p.status,reason:'Цена изменилась более чем на 0,5%; дождитесь нового предложения'};}
 const v=p.protective?{approved:p.proposal.action==='SELL'&&(s.positions[p.proposal.symbol]||0)>0,side:'SELL',amount:(s.positions[p.proposal.symbol]||0)*prices[p.proposal.symbol]}:check(p.proposal,s,prices,now);
 if(!v.approved){p.status='invalidated';return {id,status:p.status,reason:v.reason||'Позиции больше нет'};}
 const amount=p.protective?v.amount:Math.min(p.amount,v.amount);
 const trade=execute(s,p.proposal.symbol,v.side,amount,prices[p.proposal.symbol],now);trade.approvalId=id;p.trade=trade;p.status='approved';s.prices=prices;return {id,status:p.status,trade};
}
