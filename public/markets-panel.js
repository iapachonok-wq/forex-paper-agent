// Вкладка «Рынки». Только чтение данных и анализ, сделок здесь нет.
const SOURCE_NAMES={binance_futures:'Фьючерсы Binance (fapi.binance.com)',binance_spot:'Спот Binance (api.binance.com)',binance_spot_mirror:'Спот Binance, открытое зеркало (data-api.binance.vision)',yahoo:'Yahoo Finance'};
function ageText(ms){if(!ms)return '—';const m=Math.round((Date.now()-ms)/60000);return m<1?'только что':m<120?m+' мин назад':Math.round(m/60)+' ч назад';}
byId('probeSources').onclick=async()=>{
 const b=byId('probeSources');b.disabled=true;byId('probeStatus').textContent='Проверяем источники из Cloudflare…';byId('probeResult').replaceChildren();
 try{
  const d=await api('markets/sources');const table=node('table');const head=node('tr');for(const h of ['Источник','Инструмент','Ответ','Последняя свеча','Цена','Объём'])head.append(node('th',h));table.append(head);
  for(const r of d.results){const tr=node('tr');tr.append(node('td',SOURCE_NAMES[r.source]||r.source),node('td',r.symbol),node('td',r.ok?'да · '+r.ms+' мс':'нет'+(r.status?' · HTTP '+r.status:'')+(r.error?' · '+r.error:'')),node('td',r.lastTime?localTime(r.lastTime)+' ('+ageText(r.lastTime)+')':'—'),node('td',Number.isFinite(r.price)?String(r.price):'—'),node('td',r.volume==null?'—':String(r.volume)));table.append(tr);}
  byId('probeResult').append(table);const ok=d.results.filter(r=>r.ok).length;byId('probeStatus').textContent='Проверено: '+localTime(d.checkedAt)+' (Нью-Йорк). Ответили '+ok+' из '+d.results.length+'.';
 }catch(e){byId('probeStatus').textContent='Проверка не удалась: '+e.message;}finally{b.disabled=false;}
};
