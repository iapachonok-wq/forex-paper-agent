// Вкладка «Рынки». Только чтение данных и анализ, сделок здесь нет.
const SOURCE_NAMES={binance_futures:'Фьючерсы Binance (fapi.binance.com)',binance_spot:'Спот Binance (api.binance.com)',binance_spot_mirror:'Спот Binance, открытое зеркало (data-api.binance.vision)',yahoo:'Yahoo Finance',kucoin:'KuCoin',kraken:'Kraken',coinbase:'Coinbase Exchange',okx:'OKX',bybit:'Bybit',gate:'Gate',mexc:'MEXC'};
function ageText(ms){if(!ms)return '—';const m=Math.round((Date.now()-ms)/60000);return m<1?'только что':m<120?m+' мин назад':Math.round(m/60)+' ч назад';}
const fmtPrice=x=>!Number.isFinite(x)?'—':x>=1000?x.toLocaleString('ru-RU',{maximumFractionDigits:1}):x>=1?x.toFixed(3):x.toFixed(5);
let marketsLoaded=false,marketsBusy=false;
async function loadMarkets(){
 if(marketsBusy||byId('app').hidden)return;marketsBusy=true;const b=byId('marketsRefresh');b.disabled=true;
 try{
  const {assets}=await api('markets/assets');const table=node('table'),head=node('tr');for(const h of ['Актив','Цена','Состояние','Причина или сетап','Данные'])head.append(node('th',h));table.append(head);byId('marketsBoard').replaceChildren(table);
  const rows={};for(const a of assets){const tr=node('tr');tr.append(node('td',a.name),node('td','…'),node('td','ждёт'),node('td',''),node('td',''));rows[a.id]=tr;table.append(tr);}
  let done=0,signals=0;
  // По одному активу за запрос: так каждый вызов укладывается в лимит процессора Cloudflare.
  for(const a of assets){
   byId('marketsStatus').textContent='Загружаем '+a.name+' ('+(done+1)+' из '+assets.length+')…';const cells=rows[a.id].children;
   try{const r=await api('markets/analysis?id='+encodeURIComponent(a.id));const s=r.signal;
    cells[1].textContent=fmtPrice(r.price);cells[2].textContent=s?'сигнал · '+s.side:'сетапа нет';
    cells[3].textContent=s?`вход ${fmtPrice(s.entry)} · стоп ${fmtPrice(s.stop)} (${s.risk_pct_price.toFixed(2)} %) · цель ${fmtPrice(s.tp1)} (1 : ${s.rr.toFixed(1)})`+(s.warnings.length?' · '+s.warnings.join('; '):''):r.reasons.at(-1);
    cells[4].textContent=r.sourceName+(r.volume?'':' · без объёма')+' · свеча до '+localTime(r.closedAt)+(r.stale?' · данные старые, рынок закрыт или источник отстаёт':'')+(r.fallbacks.length?' · запасной источник':'');
    if(s){signals++;rows[a.id].className='signalRow';}
   }catch(e){cells[2].textContent='нет данных';cells[3].textContent=e.message;}
   done++;
  }
  marketsLoaded=true;byId('marketsStatus').textContent='Обновлено: '+localTime(Date.now())+' (Нью-Йорк). Сигналов: '+signals+'. Время свечей — Нью-Йорк.';
 }catch(e){byId('marketsStatus').textContent='Не удалось загрузить: '+e.message;}finally{marketsBusy=false;b.disabled=false;}
}
byId('marketsRefresh').onclick=loadMarkets;
window.addEventListener('hashchange',()=>{if(location.hash==='#markets'&&!marketsLoaded)loadMarkets();});
setTimeout(()=>{if(location.hash==='#markets'&&!marketsLoaded)loadMarkets();},1500);
byId('probeSources').onclick=async()=>{
 const b=byId('probeSources');b.disabled=true;byId('probeStatus').textContent='Проверяем источники из Cloudflare…';byId('probeResult').replaceChildren();
 try{
  const d=await api('markets/sources');const table=node('table');const head=node('tr');for(const h of ['Источник','Инструмент','Ответ','Последняя свеча','Цена','Объём'])head.append(node('th',h));table.append(head);
  for(const r of d.results){const tr=node('tr');tr.append(node('td',SOURCE_NAMES[r.source]||r.source),node('td',r.symbol),node('td',r.ok?'да · '+r.ms+' мс':'нет'+(r.status?' · HTTP '+r.status:'')+(r.error?' · '+r.error:'')),node('td',r.lastTime?localTime(r.lastTime)+' ('+ageText(r.lastTime)+')':'—'),node('td',Number.isFinite(r.price)?String(r.price):'—'),node('td',r.volume==null?'—':String(r.volume)));table.append(tr);}
  byId('probeResult').append(table);const ok=d.results.filter(r=>r.ok).length;byId('probeStatus').textContent='Проверено: '+localTime(d.checkedAt)+' (Нью-Йорк). Ответили '+ok+' из '+d.results.length+'.';
 }catch(e){byId('probeStatus').textContent='Проверка не удалась: '+e.message;}finally{b.disabled=false;}
};
