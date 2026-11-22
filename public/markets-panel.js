// Вкладка «Рынки». Только чтение данных и анализ, сделок здесь нет.
const SIDE_COLOR={long:'#00e676',short:'#ff1744'};
const sideClass=dir=>dir>0?'sideLong':'sideShort';
const SOURCE_NAMES={binance_futures:'Фьючерсы Binance (fapi.binance.com)',binance_spot:'Спот Binance (api.binance.com)',binance_spot_mirror:'Спот Binance, открытое зеркало (data-api.binance.vision)',yahoo:'Yahoo Finance',kucoin:'KuCoin',kraken:'Kraken',coinbase:'Coinbase Exchange',okx:'OKX',bybit:'Bybit',gate:'Gate',mexc:'MEXC'};
function ageText(ms){if(!ms)return '—';const m=Math.round((Date.now()-ms)/60000);return m<1?'только что':m<120?m+' мин назад':Math.round(m/60)+' ч назад';}
// Тот же формат, что в разборе и в bot.py: пробел между тысячами, точка в дробной части.
const fmtPrice=x=>!Number.isFinite(x)?'—':x>=1000?x.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g,' '):x>=1?x.toFixed(3):x.toFixed(5);
let marketsLoaded=false,marketsBusy=false;
// Полоска готовности: цвет по направлению тренда (зелёный — лонг, красный — шорт, серый — тренда нет).
function scoreMeter(score,dir,wide=false){const box=node('div',undefined,'meter'+(wide?' meterWide':'')),bar=node('span',undefined,dir>0?'meterLong':dir<0?'meterShort':'meterNone');bar.style.width=Math.max(0,Math.min(100,score))+'%';box.append(bar);const wrap=node('div',undefined,'meterWrap');wrap.append(box,node('b',score+' %'+(dir?(dir>0?' · лонг':' · шорт'):''),dir>0?'sideLong':dir<0?'sideShort':''));return wrap;}
async function loadMarkets(){
 if(marketsBusy||byId('app').hidden)return;marketsBusy=true;const b=byId('marketsRefresh');b.disabled=true;
 try{
  const {assets}=await api('markets/assets');const table=node('table'),head=node('tr');for(const h of ['Актив','Готовность','Цена','Состояние','Причина или сетап','Данные'])head.append(node('th',h));table.append(head);byId('marketsBoard').replaceChildren(table);
  const rows={},scores={};for(const a of assets){const tr=node('tr'),name=node('td'),open=node('button',a.name,'linkButton');open.type='button';open.title='Открыть график и разбор';open.onclick=()=>openAsset(a.id);name.append(open);tr.append(name,node('td','…'),node('td','…'),node('td','ждёт'),node('td',''),node('td',''));rows[a.id]=tr;table.append(tr);}
  // Чем выше готовность, тем выше строка. Неизвестные — внизу, в исходном порядке.
  const resort=()=>{const order=[...assets].sort((x,y)=>(scores[y.id]??-1)-(scores[x.id]??-1));for(const a of order)table.append(rows[a.id]);};
  let done=0,signals=0;
  // По одному активу за запрос: так каждый вызов укладывается в лимит процессора Cloudflare.
  for(const a of assets){
   byId('marketsStatus').textContent='Загружаем '+a.name+' ('+(done+1)+' из '+assets.length+')…';const tds=rows[a.id].children,cells=[tds[0],tds[2],tds[3],tds[4],tds[5]];
   try{const r=await api('markets/analysis?id='+encodeURIComponent(a.id));const s=r.signal;
    scores[a.id]=r.score;tds[1].replaceChildren(scoreMeter(r.score,r.scoreDir));resort();
    cells[1].textContent=fmtPrice(r.price);cells[2].textContent=s?'сигнал · '+s.side:'сетапа нет';if(s)cells[2].className=sideClass(s.dir)+' sideText';
    cells[3].textContent=s?`вход ${fmtPrice(s.entry)} · стоп ${fmtPrice(s.stop)} (${s.risk_pct_price.toFixed(2)} %) · цель ${fmtPrice(s.tp1)} (1 : ${s.rr.toFixed(1)}, с комиссией 1 : ${s.rr_net.toFixed(2)})`+(s.warnings.length?' · '+s.warnings.join('; '):''):r.reasons.at(-1);
    cells[4].textContent=r.sourceName+(r.volume?'':' · без объёма')+' · свеча до '+localTime(r.closedAt)+(r.stale?' · данные старые, рынок закрыт или источник отстаёт':'')+(r.fallbacks.length?' · запасной источник':'');
    if(s){signals++;rows[a.id].className='signalRow';}
   }catch(e){const c=rows[a.id].children;c[1].textContent='—';c[3].textContent='нет данных';c[4].textContent=e.message;}
   done++;
  }
  marketsLoaded=true;byId('marketsStatus').textContent='Обновлено: '+localTime(Date.now())+' (Нью-Йорк). Сигналов: '+signals+'. Готовность — доля выполненных условий правила, не вероятность прибыли. Время свечей — Нью-Йорк.';
  // Открытая карточка актива перерисовывается на свежих данных при каждом обновлении.
  if(currentAsset&&!byId('marketDetail').hidden)openAsset(currentAsset,true);
 }catch(e){byId('marketsStatus').textContent='Не удалось загрузить: '+e.message;}finally{marketsBusy=false;b.disabled=false;}
}
byId('marketsRefresh').onclick=loadMarkets;

// Журнал сигналов по правилу, который ведёт облачный сканер.
async function loadSignals(){
 if(byId('app').hidden)return;
 try{
  const d=await api('markets/signals'),sc=d.scan,tiles=[['Открытых сигналов',String(d.open)],['Сигналов сегодня',d.today+' из '+d.guard.max_signals_per_day]];
  if(d.stats)tiles.push(['Закрыто',String(d.stats.n)],['В плюс',Math.round(100*d.stats.wins/d.stats.n)+' %'],['Итог',(d.stats.sum>=0?'+':'')+d.stats.sum.toFixed(1)+' R'],['Цель / стоп / время',d.stats.target+' / '+d.stats.stop+' / '+d.stats.time]);else tiles.push(['Закрыто','0']);
  byId('signalsTiles').replaceChildren(...tiles.map(([k,v])=>{const a=node('article');a.append(node('small',k),node('strong',v));return a;}));
  byId('signalsStatus').textContent=(sc.lastRun?'Последний проход сканера: '+localTime(sc.lastRun)+' (Нью-Йорк), всего проходов '+sc.runs+'.':'Сканер ещё не запускался: первый проход в течение нескольких минут.')+(sc.lastError?' Ошибка: '+sc.lastError:'')+(d.stats&&d.stats.n<30?' Меньше 30 закрытых сигналов: статистика пока ни о чём не говорит.':'');
  const list=byId('signalsList');list.replaceChildren();
  if(!d.signals.length)list.append(node('p','Сигналов пока нет. Сюда попадают только сетапы, где сошлись тренд, зона и сигнал, и которые пропустил риск-страж.','muted'));
  for(const s of d.signals){const g=s.signal,card=node('article',undefined,'signalCard'),head=node('div',undefined,'assetHead');
   const open=node('button',s.name||s.asset,'linkButton');open.type='button';open.onclick=()=>openAsset(s.asset);
   head.append(open,node('span',g.side,'tag '+sideClass(g.dir)+'Tag'),node('span',s.status+(s.r!=null?' '+(s.r>=0?'+':'')+s.r.toFixed(2)+' R с комиссией':''),'tag'));card.append(head);
   card.append(node('div','Вход '+g.side+' '+fmtPrice(s.entry),'entryBig '+sideClass(g.dir)));
   card.append(node('p',`Свеча ${localTime(s.t)} (Нью-Йорк) · стоп ${fmtPrice(s.stop)} (${g.risk_pct_price.toFixed(2)} %) · цель ${fmtPrice(s.tp1)} (1 : ${s.rr.toFixed(1)}${g.rr_net!=null?', с комиссией 1 : '+g.rr_net.toFixed(2):''}) · цель 2 ${fmtPrice(g.tp2)}`));
   const ul=node('ul');for(const t of [...g.reasons,...g.warnings.map(w=>'⚠ '+w)])ul.append(node('li',t));card.append(ul);
   card.append(node('small','Данные: '+(SOURCE_NAMES[s.source]||s.source||'—')+(s.closedAt?' · закрыт '+localTime(s.closedAt):'')));list.append(card);}
 }catch(e){byId('signalsStatus').textContent='Не удалось загрузить сигналы: '+e.message;}
}
byId('signalsRefresh').onclick=loadSignals;
byId('signalsScan').onclick=async()=>{const b=byId('signalsScan');b.disabled=true;try{const r=await api('markets/scan',{});byId('signalsStatus').textContent='Проверено: '+r.picked.join(', ')+'. Новых сигналов: '+r.inserts.length+', закрыто: '+r.closes.length+'.';await loadSignals();}catch(e){byId('signalsStatus').textContent='Сканирование не удалось: '+e.message;}finally{b.disabled=false;}};
window.addEventListener('hashchange',()=>{if(location.hash==='#markets')loadSignals();});
setTimeout(()=>{if(location.hash==='#markets')loadSignals();},1200);
setInterval(()=>{if(!document.hidden&&location.hash==='#markets'&&!byId('app').hidden)loadSignals();},120000);

// Карточка актива: график 15м и разбор словами. Всё считает код, без AI.
let detailRequest=0;
let currentAsset=null,currentTf='15m';
const TF_NAMES={'15m':'15 минут','5m':'5 минут'};
async function openAsset(id,quiet=false){
 const req=++detailRequest,host=byId('marketDetail');currentAsset=id;host.hidden=false;
 // При тихом обновлении старый график остаётся на месте, пока не придёт новый.
 if(!quiet){host.replaceChildren(node('p','Загружаем график и разбор…','muted'));host.scrollIntoView({behavior:'smooth',block:'start'});}
 try{const r=await api('markets/analysis?id='+encodeURIComponent(id)+'&detail=1&tf='+currentTf);if(req!==detailRequest)return;renderAsset(r);}
 catch(e){if(req===detailRequest)host.replaceChildren(node('p','Не удалось загрузить: '+e.message));}
}
function renderAsset(r){
 const host=byId('marketDetail'),s=r.signal,st=r.story;host.replaceChildren();
 const head=node('div',undefined,'assetHead');head.append(node('h2',r.name+' · '+TF_NAMES[r.tf]),node('span',s?'сигнал · '+s.side:'сетапа нет',s?'tag '+sideClass(s.dir)+'Tag':'tag'));
 // Переключатель таймфрейма: перерисовывает всю карточку — график, готовность и разбор.
 const tabs=node('div',undefined,'tfSwitch');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Таймфрейм');
 for(const tf of ['15m','5m']){const b=node('button',TF_NAMES[tf],tf===r.tf?'':'secondary');b.type='button';b.setAttribute('aria-pressed',String(tf===r.tf));b.onclick=()=>{if(tf===currentTf)return;currentTf=tf;openAsset(r.id,true);tabs.querySelectorAll('button').forEach(x=>x.disabled=true);};tabs.append(b);}
 head.append(tabs);host.append(head);
 if(r.tf==='5m')host.append(node('p','Правило в боте рассчитано на 15 минут. На 5 минутах те же условия срабатывают чаще и шумнее, правило на этом таймфрейме не проверено. Таблица и журнал сигналов — по 15 минутам.','muted'));
 const idea=st.idea;
 if(idea){const box=node('div',undefined,'entryBanner '+sideClass(idea.dir));box.append(node('div',(idea.signal?'Вход по сигналу: ':'Вход был бы: ')+(idea.dir>0?'ЛОНГ':'ШОРТ')+' ≈ '+fmtPrice(idea.entry),'entryBig'),node('div',`стоп ${fmtPrice(idea.stop)} · цель ${fmtPrice(idea.target)}`+(idea.signal?'':' · ориентир, сетапа пока нет'),'entrySmall'));host.append(box);}
 host.append(node('p','Данные: '+r.sourceName+(r.volume?'':' · без объёма')+(r.fee_pct?' · комиссия '+r.fee_pct+' % за сторону (оценка)':'')+' · последняя закрытая свеча до '+localTime(r.closedAt)+' (Нью-Йорк)'+(r.stale?' · данные старые: рынок закрыт или источник отстаёт':''),'muted'));
 const scroll=node('div',undefined,'chartScroll');scroll.append(drawMarketChart(r));host.append(scroll);requestAnimationFrame(()=>{scroll.scrollLeft=scroll.scrollWidth;});
 host.append(node('p','Оранжевая — EMA 50 (1ч), синяя — EMA 200 (1ч), фиолетовый пунктир — VWAP за сутки, серые точки — уровни. Внизу объём со средней за 20 и RSI 14.','muted'));
 const info=node('p','Наведите на свечу или коснитесь её, чтобы увидеть цены.','muted');info.id='marketBarInfo';host.append(info);
 if(s){const box=node('article',undefined,'marketBanner');box.append(node('h3','Сетап по правилу: '+s.side));const list=node('ul');for(const t of [`Вход ${fmtPrice(s.entry)}`,`Стоп ${fmtPrice(s.stop)} (${s.risk_pct_price.toFixed(2)} %)`,`Цель 1 ${fmtPrice(s.tp1)} (1 : ${s.rr.toFixed(1)}, с комиссией 1 : ${s.rr_net.toFixed(2)})`,`Комиссия за вход и выход ≈ ${fmtPrice(s.cost)} (${s.cost_r.toFixed(2)} R)`,`Цель 2 ${fmtPrice(s.tp2)} (1 : 3)`,`Размер при риске $${s.risk_usd} учебного счёта $1000: ${s.qty.toPrecision(4)}`,...s.reasons,...s.warnings.map(w=>'⚠ '+w)])list.append(node('li',t));box.append(list,node('small','Отмена: 15м свеча закрылась за стопом. Это разбор по правилам, не совет и не сделка: на демо-счёте ничего не исполняется.'));host.append(box);}
 const sec=(title,items)=>{host.append(node('h3',title));const ul=node('ul');for(const t of items)ul.append(node('li',t));host.append(ul);};
 const sc=node('div',undefined,'scoreBox');sc.append(node('h3','Готовность к сетапу: '+st.score+' %'),scoreMeter(st.score,st.scoreDir,true));const ul=node('ul');for(const p of st.scoreParts)ul.append(node('li',`${p.name}: ${p.got} из ${p.max}`));sc.append(ul,node('small','Сколько условий правила уже выполнено. Сигнал по правилу — 100 %. Это не вероятность прибыли: правило ещё не проверено на истории. Реальную долю сигналов в плюс покажет журнал после 30 закрытых сигналов.'));host.append(sc);
 host.append(node('p','Обновлено: '+localTime(Date.now())+' (Нью-Йорк). Карточка обновляется вместе с кнопкой «Обновить все активы».','muted'));
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
 let lo=Math.min(...bars.map(b=>b[3])),hi=Math.max(...bars.map(b=>b[2]));const marks=[...(s?[s.stop,s.tp1,s.tp2]:[]),...(r.story?.idea?[r.story.idea.entry,r.story.idea.stop,r.story.idea.target]:[])];if(marks.length){lo=Math.min(lo,...marks);hi=Math.max(hi,...marks);}const pad=(hi-lo)*.06||hi*.001;lo-=pad;hi+=pad;
 const x=i=>left+(i+.5)*step,y=p=>P[1]-(p-lo)/(hi-lo)*(P[1]-P[0]),plotRight=left+n*step;
 const clip=el('clipPath',{id:'priceClip'});clip.append(el('rect',{x:0,y:P[0],width:plotRight+30,height:P[1]-P[0]}));svg.append(clip);
 const g=el('g',{'clip-path':'url(#priceClip)'});svg.append(g);
 // Подпись шкалы пропускаем, если рядом подпись входа, стопа или цели.
 for(let i=0;i<=4;i++){const p=lo+(hi-lo)*i/4;svg.append(el('line',{x1:left,x2:plotRight,y1:y(p),y2:y(p),class:'chartGrid'}));if(!marks.some(m=>Math.abs(y(m)-y(p))<12))svg.append(el('text',{x:plotRight+6,y:y(p)+4,class:'chartLabel'},fmtPrice(p)));}
 for(const lv of c.levels)if(lv>lo&&lv<hi){g.append(el('line',{x1:left,x2:plotRight,y1:y(lv),y2:y(lv),stroke:'#8a8f99','stroke-dasharray':'2 4'}));g.append(el('text',{x:left+4,y:y(lv)-3,class:'chartLabel'},'уровень '+fmtPrice(lv)));}
 const line=(vals,attrs)=>{let d='',pen=false;vals.forEach((v,i)=>{if(v==null){pen=false;return;}d+=(pen?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1);pen=true;});if(d)g.append(el('path',{d,fill:'none',...attrs}));};
 line(c.ema200,{stroke:'#5b8cff','stroke-width':1.6});
 // Если линия EMA вне видимого диапазона цен, подписываем, где она.
 [[c.ema200,'EMA 200','#5b8cff'],[c.ema50,'EMA 50','#f7a600']].forEach(([vals,name,col],k)=>{const v=vals.at(-1);if(v!=null&&(v>hi||v<lo))svg.append(el('text',{x:left+4,y:(v>hi?P[0]+12:P[1]-6)+k*(v>hi?13:-13),fill:col,'font-size':11},name+(v>hi?' выше графика: ':' ниже графика: ')+fmtPrice(v)));});line(c.ema50,{stroke:'#f7a600','stroke-width':1.6});line(c.vwap,{stroke:'#c3a0ff','stroke-width':1.3,'stroke-dasharray':'5 4'});
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
 // Вход: ярко-зелёный для лонга, ярко-красный для шорта, крупной подписью. Стоп и цель — спокойными цветами.
 const idea=r.story?.idea;
 if(idea){const col=idea.dir>0?SIDE_COLOR.long:SIDE_COLOR.short,side=idea.dir>0?'ЛОНГ':'ШОРТ',x0=Math.max(left,x(n-1)-60),x1=plotRight+4;
  const band=(a,b,c,op)=>g.append(el('rect',{x:x0,y:Math.min(y(a),y(b)),width:x1-x0,height:Math.abs(y(a)-y(b)),fill:c,opacity:op}));band(idea.entry,idea.target,col,.16);band(idea.entry,idea.stop,'#9e9e9e',.16);
  svg.append(el('line',{x1:x0,x2:x1,y1:y(idea.stop),y2:y(idea.stop),stroke:'#ffab40','stroke-width':1.4}),el('text',{x:x1+2,y:y(idea.stop)+4,fill:'#ffab40','font-size':11,'font-weight':700},'СТОП '+fmtPrice(idea.stop)));
  svg.append(el('line',{x1:x0,x2:x1,y1:y(idea.target),y2:y(idea.target),stroke:'#40c4ff','stroke-width':1.4,'stroke-dasharray':'6 4'}),el('text',{x:x1+2,y:y(idea.target)+4,fill:'#40c4ff','font-size':11,'font-weight':700},'ЦЕЛЬ '+fmtPrice(idea.target)));
  if(s)svg.append(el('line',{x1:x0,x2:x1,y1:y(s.tp2),y2:y(s.tp2),stroke:'#40c4ff','stroke-width':1,'stroke-dasharray':'2 4'}),el('text',{x:x1+2,y:y(s.tp2)+4,fill:'#40c4ff','font-size':10},'ЦЕЛЬ 2 '+fmtPrice(s.tp2)));
  svg.append(el('line',{x1:left,x2:x1,y1:y(idea.entry),y2:y(idea.entry),stroke:col,'stroke-width':3,'stroke-dasharray':idea.signal?'none':'10 5'}));
  const tag=(idea.signal?'ВХОД ':'ВХОД БЫЛ БЫ ')+side+' '+fmtPrice(idea.entry),ty=y(idea.entry)+(idea.dir>0?-8:20);
  svg.append(el('text',{x:x0-6,y:ty,'text-anchor':'end',fill:col,'font-size':18,'font-weight':800,stroke:'#101c19','stroke-width':4,'paint-order':'stroke'},tag));}
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
