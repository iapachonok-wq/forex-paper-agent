// Вкладка «Рынки». Только чтение данных и анализ, сделок здесь нет.
const SOURCE_NAMES={binance_futures:'Фьючерсы Binance (fapi.binance.com)',binance_spot:'Спот Binance (api.binance.com)',binance_spot_mirror:'Спот Binance, открытое зеркало (data-api.binance.vision)',yahoo:'Yahoo Finance',kucoin:'KuCoin',kraken:'Kraken',coinbase:'Coinbase Exchange',okx:'OKX',bybit:'Bybit',gate:'Gate',mexc:'MEXC'};
function ageText(ms){if(!ms)return '—';const m=Math.round((Date.now()-ms)/60000);return m<1?'только что':m<120?m+' мин назад':Math.round(m/60)+' ч назад';}
const fmtPrice=x=>!Number.isFinite(x)?'—':x>=1000?x.toLocaleString('ru-RU',{maximumFractionDigits:1}):x>=1?x.toFixed(3):x.toFixed(5);
let marketsLoaded=false,marketsBusy=false;
async function loadMarkets(){
 if(marketsBusy||byId('app').hidden)return;marketsBusy=true;const b=byId('marketsRefresh');b.disabled=true;
 try{
  const {assets}=await api('markets/assets');const table=node('table'),head=node('tr');for(const h of ['Актив','Цена','Состояние','Причина или сетап','Данные'])head.append(node('th',h));table.append(head);byId('marketsBoard').replaceChildren(table);
  const rows={};for(const a of assets){const tr=node('tr'),name=node('td'),open=node('button',a.name,'linkButton');open.type='button';open.title='Открыть график и разбор';open.onclick=()=>openAsset(a.id);name.append(open);tr.append(name,node('td','…'),node('td','ждёт'),node('td',''),node('td',''));rows[a.id]=tr;table.append(tr);}
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

// Карточка актива: график 15м и разбор словами. Всё считает код, без AI.
let detailRequest=0;
async function openAsset(id){
 const req=++detailRequest,host=byId('marketDetail');host.hidden=false;host.replaceChildren(node('p','Загружаем график и разбор…','muted'));host.scrollIntoView({behavior:'smooth',block:'start'});
 try{const r=await api('markets/analysis?id='+encodeURIComponent(id)+'&detail=1');if(req!==detailRequest)return;renderAsset(r);}
 catch(e){if(req===detailRequest)host.replaceChildren(node('p','Не удалось загрузить: '+e.message));}
}
function renderAsset(r){
 const host=byId('marketDetail'),s=r.signal,st=r.story;host.replaceChildren();
 const head=node('div',undefined,'assetHead');head.append(node('h2',r.name+' · 15 минут'),node('span',s?'сигнал · '+s.side:'сетапа нет',s?'tag tagSignal':'tag'));host.append(head);
 host.append(node('p','Данные: '+r.sourceName+(r.volume?'':' · без объёма')+' · последняя закрытая свеча до '+localTime(r.closedAt)+' (Нью-Йорк)'+(r.stale?' · данные старые: рынок закрыт или источник отстаёт':''),'muted'));
 const scroll=node('div',undefined,'chartScroll');scroll.append(drawMarketChart(r));host.append(scroll);
 host.append(node('p','Оранжевая — EMA 50 (1ч), синяя — EMA 200 (1ч), фиолетовый пунктир — VWAP за сутки, серые точки — уровни. Внизу объём со средней за 20 и RSI 14.','muted'));
 const info=node('p','Наведите на свечу или коснитесь её, чтобы увидеть цены.','muted');info.id='marketBarInfo';host.append(info);
 if(s){const box=node('article',undefined,'marketBanner');box.append(node('h3','Сетап по правилу: '+s.side));const list=node('ul');for(const t of [`Вход ${fmtPrice(s.entry)}`,`Стоп ${fmtPrice(s.stop)} (${s.risk_pct_price.toFixed(2)} %)`,`Цель 1 ${fmtPrice(s.tp1)} (1 : ${s.rr.toFixed(1)})`,`Цель 2 ${fmtPrice(s.tp2)} (1 : 3)`,`Размер при риске $${s.risk_usd} учебного счёта $1000: ${s.qty.toPrecision(4)}`,...s.reasons,...s.warnings.map(w=>'⚠ '+w)])list.append(node('li',t));box.append(list,node('small','Отмена: 15м свеча закрылась за стопом. Это разбор по правилам, не совет и не сделка: на демо-счёте ничего не исполняется.'));host.append(box);}
 const sec=(title,items)=>{host.append(node('h3',title));const ul=node('ul');for(const t of items)ul.append(node('li',t));host.append(ul);};
 sec('Тренд',[st.trend]);
 sec('Ближайшие уровни',st.levels.length?st.levels.map(l=>`${l.kind} ${fmtPrice(l.price)} (${l.pct>=0?'+':''}${l.pct.toFixed(2)} %)`):['Уровней по часовому графику за 240 свечей не найдено.']);
 sec('Фон',st.context);
 sec('Сценарии',[st.up,st.down]);
 sec('Где был бы вход и стоп',[st.plan]);
 const checks=node('ul','', 'checks');for(const c of st.checks)checks.append(node('li',(c.ok?'✓ ':'✗ ')+c.text,c.ok?'ok':'no'));host.append(node('h3','Условия правила'),checks);
 if(st.missing.length)sec('Чего не хватает до сетапа',st.missing);
 host.append(node('p','Уровни — развороты часового графика за последние 240 часов. Это разбор по правилам, а не прогноз и не совет.','muted'));
}
function drawMarketChart(r){
 const c=r.chart,bars=c.bars,n=bars.length,ns='http://www.w3.org/2000/svg',s=r.signal;
 const left=10,right=96,step=9,width=Math.max(760,left+n*step+right),height=480,P=[20,300],V=[318,378],R=[396,466];
 const el=(tag,a,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(a))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
 const svg=el('svg',{viewBox:`0 0 ${width} ${height}`,width,height,role:'img','aria-label':'График '+r.name+', свечи 15 минут'});
 let lo=Math.min(...bars.map(b=>b[3])),hi=Math.max(...bars.map(b=>b[2]));if(s){lo=Math.min(lo,s.stop,s.tp1,s.tp2);hi=Math.max(hi,s.stop,s.tp1,s.tp2);}const pad=(hi-lo)*.06||hi*.001;lo-=pad;hi+=pad;
 const x=i=>left+(i+.5)*step,y=p=>P[1]-(p-lo)/(hi-lo)*(P[1]-P[0]),plotRight=left+n*step;
 const clip=el('clipPath',{id:'priceClip'});clip.append(el('rect',{x:0,y:P[0],width:plotRight+30,height:P[1]-P[0]}));svg.append(clip);
 const g=el('g',{'clip-path':'url(#priceClip)'});svg.append(g);
 for(let i=0;i<=4;i++){const p=lo+(hi-lo)*i/4;svg.append(el('line',{x1:left,x2:plotRight,y1:y(p),y2:y(p),class:'chartGrid'}),el('text',{x:plotRight+6,y:y(p)+4,class:'chartLabel'},fmtPrice(p)));}
 for(const lv of c.levels)if(lv>lo&&lv<hi){g.append(el('line',{x1:left,x2:plotRight,y1:y(lv),y2:y(lv),stroke:'#8a8f99','stroke-dasharray':'2 4'}));g.append(el('text',{x:left+4,y:y(lv)-3,class:'chartLabel'},'уровень '+fmtPrice(lv)));}
 const line=(vals,attrs)=>{let d='',pen=false;vals.forEach((v,i)=>{if(v==null){pen=false;return;}d+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);pen=true;});if(d)g.append(el('path',{d,fill:'none',...attrs}));};
 line(c.ema200,{stroke:'#5b8cff','stroke-width':1.6});line(c.ema50,{stroke:'#f7a600','stroke-width':1.6});line(c.vwap,{stroke:'#c3a0ff','stroke-width':1.3,'stroke-dasharray':'5 4'});
 const vmax=Math.max(...bars.map(b=>b[5]),...c.volAvg.filter(v=>v!=null),1),vy=v=>V[1]-v/vmax*(V[1]-V[0]),ry=v=>R[1]-(v-0)/100*(R[1]-R[0]);
 svg.append(el('line',{x1:left,x2:plotRight,y1:ry(70),y2:ry(70),class:'chartGrid'}),el('line',{x1:left,x2:plotRight,y1:ry(30),y2:ry(30),class:'chartGrid'}),el('text',{x:plotRight+6,y:ry(70)+4,class:'chartLabel'},'RSI 70'),el('text',{x:plotRight+6,y:ry(30)+4,class:'chartLabel'},'RSI 30'),el('text',{x:plotRight+6,y:V[0]+10,class:'chartLabel'},'объём'));
 bars.forEach((b,i)=>{const [t,o,h,l,cl,v]=b,col=cl>=o?'#26a69a':'#ef5350',grp=el('g',{class:'candleGroup',tabindex:0});
  grp.append(el('rect',{x:x(i)-step/2,y:P[0],width:step,height:R[1]-P[0],fill:'transparent'}),el('line',{x1:x(i),x2:x(i),y1:y(h),y2:y(l),stroke:col}),el('rect',{x:x(i)-step*.35,y:Math.min(y(o),y(cl)),width:step*.7,height:Math.max(1,Math.abs(y(o)-y(cl))),fill:col}),el('rect',{x:x(i)-step*.35,y:vy(v),width:step*.7,height:Math.max(0,V[1]-vy(v)),fill:col,opacity:.6}));
  const show=()=>{byId('marketBarInfo').textContent=`${localTime(t)} (Нью-Йорк) · откр. ${fmtPrice(o)} · макс. ${fmtPrice(h)} · мин. ${fmtPrice(l)} · закр. ${fmtPrice(cl)} · объём ${v.toPrecision(4)}${c.rsi[i]!=null?' · RSI '+c.rsi[i].toFixed(0):''}`;};
  grp.addEventListener('pointerenter',show);grp.addEventListener('focus',show);grp.addEventListener('click',show);svg.append(grp);
  if(i%16===0)svg.append(el('text',{x:x(i),y:height-2,'text-anchor':'middle',class:'chartLabel'},new Date(t).toLocaleString('ru-RU',{timeZone:'America/New_York',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})));
 });
 let dv='',pen=false;c.volAvg.forEach((v,i)=>{if(v==null){pen=false;return;}dv+=(pen?'L':'M')+x(i).toFixed(1)+' '+vy(v).toFixed(1);pen=true;});if(dv)svg.append(el('path',{d:dv,fill:'none',stroke:'#f7a600','stroke-width':1}));
 let dr='';pen=false;c.rsi.forEach((v,i)=>{if(v==null){pen=false;return;}dr+=(pen?'L':'M')+x(i).toFixed(1)+' '+ry(v).toFixed(1);pen=true;});if(dr)svg.append(el('path',{d:dr,fill:'none',stroke:'#c3a0ff','stroke-width':1.3}));
 if(s){const x0=x(n-1),x1=plotRight+4;const band=(a,b,col)=>g.append(el('rect',{x:x0,y:Math.min(y(a),y(b)),width:x1-x0,height:Math.abs(y(a)-y(b)),fill:col,opacity:.18}));band(s.entry,s.tp1,'#26a69a');band(s.entry,s.stop,'#ef5350');
  for(const [v,name,col] of [[s.entry,'ВХОД','#e8eef0'],[s.stop,'СТОП','#ef5350'],[s.tp1,'ЦЕЛЬ 1','#26a69a'],[s.tp2,'ЦЕЛЬ 2','#26a69a']]){svg.append(el('line',{x1:x0-40,x2:x1,y1:y(v),y2:y(v),stroke:col,'stroke-width':1.4,'stroke-dasharray':name==='ЦЕЛЬ 2'?'5 4':'none'}),el('text',{x:x1+2,y:y(v)+4,fill:col,'font-size':10,'font-weight':700},name+' '+fmtPrice(v)));}}
 return svg;
}
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
