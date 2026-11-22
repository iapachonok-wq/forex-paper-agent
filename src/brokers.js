export const PRACTICE='https://api-fxpractice.oanda.com';
export function validateProfile(p){if(p.provider!=='oanda_practice'||!/^\d{3}-\d{3}-\d+-\d{3}$/.test(p.accountId||'')||typeof p.token!=='string'||p.token.length<10||p.token.length>1024||/[\r\n]/.test(p.token))throw Error('Укажите OANDA Practice Account ID и API-токен');return {provider:p.provider,label:String(p.label||'OANDA Practice').slice(0,80),accountId:p.accountId,token:p.token.trim()};}
export async function inspectPractice(p,request=fetch){
 p=validateProfile(p);
 async function get(path){const r=await request(PRACTICE+'/v3/accounts/'+encodeURIComponent(p.accountId)+path,{headers:{Authorization:'Bearer '+p.token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('OANDA Practice HTTP '+r.status);return r.json();}
 const summary=await get('/summary');
 const [positions,orders,trades]=await Promise.all([get('/openPositions'),get('/pendingOrders'),get('/openTrades')]);
 const a=summary.account;return {checkedAt:Date.now(),account:{id:a.id,currency:a.currency,balance:a.balance,NAV:a.NAV,unrealizedPL:a.unrealizedPL,marginAvailable:a.marginAvailable},positions:positions.positions,orders:orders.orders,trades:trades.trades,execution:'monitoring_only'};
}
