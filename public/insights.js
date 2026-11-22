const byId=id=>document.getElementById(id);
const localTime=t=>new Date(t).toLocaleString('ru-RU',{timeZone:'America/New_York'});
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function explainDecision(e){
 const p=e.body.proposal||{},r=p.reasoning||'',out=[];
 if(/расходятся|но.*нисходящ/i.test(r))out.push('На разных масштабах графика нет единого направления: общая картина и движение последних часов различаются.');
 if(/нисход|медвеж|паден|давлен/i.test(r))out.push('Агент видит признаки снижения. Покупка сейчас означала бы ставку на восстановление, которое может не наступить.');
 if(/перепродан|RSI\s*(?:22|23|24|25|26|27|28|29)/i.test(r))out.push('Недавние продажи были сильными — это называют перепроданностью. Это не обещает отскока: цена может снижаться дальше.');
 if(/разворота.*нет|разворот.*пока|против.*тренда|против.*импульса/i.test(r))out.push('По оценке агента, подтверждения смены направления пока недостаточно.');
 if(/позиции нет|продавать нечего|SELL неприменим/i.test(r))out.push('В портфеле нет купленной валюты. Этот агент не открывает шорт, поэтому продать её ради заработка на падении он не может.');
 if(/доллар|ФРС/i.test(r))out.push('Новости о долларе и ФРС используются как фон. Укрепление доллара обычно давит на EUR/USD и GBP/USD, но заголовок сам по себе не гарантирует движение.');
 if(/инструкц|манипуляц/i.test(r))out.push('Упоминание инструкций или манипуляции относится к проверке текста новостей на вмешательство в поведение AI. Это не гарантия безопасности.');
 if(!out.length)out.push('Для этой записи нет шаблонной расшифровки. Подробности сохранены в исходном объяснении ниже.');
 return out;
}
function decisionCard(e){
 const b=e.body,p=b.proposal||{},a=p.action||b.side||'—',card=node('article',undefined,'decisionCard');
 card.append(node('small',localTime(e.ts)+' (Нью-Йорк) · '+(b.symbol||p.symbol||'Пара не указана')));
 const executed=e.kind==='trade';
 card.append(node('h3',executed?'Исполнена виртуальная '+(a==='BUY'?'покупка':'продажа'):({HOLD:'Ожидание — предложение не торговать',BUY:'Предложение купить',SELL:'Предложение продать'}[a]||'Решение агента')));
 card.append(node('p',e.kind==='legacy_decision'?'Архив с ноутбука. Это не новый анализ облачного агента.':executed?'Запись об исполнении в бумажном счёте. Реальные деньги не используются.':'Решение модели. Само по себе не является подтверждением исполнения.','muted'));
 if(executed){card.append(node('p','Количество: '+b.qty+' · Цена исполнения: '+b.price+' · Комиссия: '+b.fee));return card;}
 const list=node('ul');for(const text of explainDecision(e))list.append(node('li',text));card.append(list);
 if(typeof p.confidence==='number')card.append(node('p','Самооценка уверенности модели: '+Math.round(p.confidence*100)+'%. Это не вероятность прибыли.','muted'));
 if(b.critique)card.append(node('p','Проверка критиком: '+({APPROVE:'одобрено',REDUCE:'уменьшен объём',REJECT:'отклонено'}[b.critique.verdict]||b.critique.verdict)));
 if(b.verdict)card.append(node('p','Проверка ограничений: '+(b.verdict.approved?'разрешено':'не разрешено')+(b.verdict.reason?' · '+b.verdict.reason:'')));
 const details=node('details');details.append(node('summary','Исходное объяснение агента'),node('p',p.reasoning||'Объяснение отсутствует.'));card.append(details);return card;
}
function renderReadable(events){const target=byId('readableDecisions');target.replaceChildren();const rows=events.filter(e=>['decision','legacy_decision','trade'].includes(e.kind)).slice(0,12);for(const e of rows)target.append(decisionCard(e));if(!rows.length)target.append(node('p','Решений пока нет.'));}
const terms=[
 ['Свеча','Показывает цену открытия, максимум, минимум и закрытие за выбранный интервал. Зелёная: закрытие выше открытия; красная: ниже. Тонкая линия — весь диапазон цен. Последняя свеча может быть незавершённой.'],
 ['Кружок / стрелка','Кружок с числом — количество записей решений за свечу, включая HOLD. Стрелка — исполненная виртуальная покупка ↑ или продажа ↓. Наличие решения не означает совершённую сделку.'],
 ['1h / 4h / 1d','Одна свеча содержит час, четыре часа или день. Цена может расти на одном масштабе и падать на другом.'],
 ['BUY / SELL / HOLD','Предложение купить / продать / подождать. SELL здесь продаёт ранее купленное; отдельные позиции на падение не открываются.'],
 ['RSI и перепроданность','Индикатор силы недавних повышений и снижений от 0 до 100. Ниже 30 обычно называют перепроданностью, выше 70 — перекупленностью. Это не обещание разворота.'],
 ['SMA20, SMA50','Средние цены последних 20 и 50 свечей. sma20_vs_sma50 −0,43% означает, что короткая средняя ниже длинной на 0,43%. Это описание прошлого движения.'],
 ['MACD hist','Разница между линией MACD и её сигнальной линией. Отрицательное значение указывает на слабость импульса относительно сигнальной линии, но не гарантирует падения.'],
 ['return_10_bars','Изменение цены за десять свечей выбранного масштаба. На 4h это десять четырёхчасовых свечей.'],
 ['50-барный минимум','Минимум последних 50 свечей, а не обязательно 50 дней.'],
 ['ФРС и сильный доллар','ФРС — центральный банк США. «Ястребиная» политика означает более жёсткие условия, например высокие ставки. Это может поддерживать доллар.'],
 ['Архив / legacy_decision','Решение старой локальной версии, перенесённое с ноутбука. Не новая облачная сделка.'],
 ['Источник и время','Свечи Yahoo Finance — справочные данные, возможны задержки. Время в панели показано по Нью-Йорку. Отметка решения привязана к интервалу свечи, а не к цене исполнения.']
];
for(const [title,text] of terms){const d=node('div');d.append(node('h3',title),node('p',text));byId('legendContent').append(d);}
let chartRequest=0,chartBusy=false;
async function loadChart(){
 if(byId('app').hidden)return;
 const request=++chartRequest;chartBusy=true;byId('chartStatus').textContent='Загружаем рыночные свечи…';
 try{const data=await api('chart?symbol='+encodeURIComponent(byId('chartSymbol').value)+'&timeframe='+byId('chartTimeframe').value);if(request!==chartRequest)return;drawCandles(data);}
 catch(e){if(request===chartRequest){byId('chartStatus').textContent='Не удалось загрузить график: '+e.message;byId('candleChart').replaceChildren();byId('chartDetails').textContent='График недоступен. Решения в журнале остаются доступны.';}}
 finally{if(request===chartRequest)chartBusy=false;}
}
function eventsForBar(b,events,seconds){return events.filter(e=>e.ts>=b.t*1000&&e.ts<(b.t+seconds)*1000);}
function drawCandles(data){
 const bars=data.bars,sec={'1h':3600,'4h':14400,'1d':86400}[data.timeframe],holder=byId('candleChart');holder.replaceChildren();byId('chartDetails').textContent='Наведите на свечу, выберите её клавиатурой или коснитесь.';
 if(!bars.length){byId('chartStatus').textContent='Источник не вернул свечи.';return;}
 const width=Math.max(760,bars.length*13+100),height=350,left=70,top=35,bottom=300,step=(width-left-20)/bars.length;
 let lo=Math.min(...bars.map(b=>b.l)),hi=Math.max(...bars.map(b=>b.h));const pad=(hi-lo)*.08||hi*.001;lo-=pad;hi+=pad;
 const y=p=>bottom-(p-lo)/(hi-lo)*(bottom-top),ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('aria-label','Свечной график '+data.symbol);svg.setAttribute('role','group');
 const shape=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 for(let i=0;i<=4;i++){const price=lo+(hi-lo)*i/4,yy=y(price);svg.append(shape('line',{x1:left,y1:yy,x2:width-10,y2:yy,class:'chartGrid'}),shape('text',{x:4,y:yy+4,class:'chartLabel'},price.toFixed(5)));}
 let mapped=0;
 bars.forEach((b,i)=>{const x=left+(i+.5)*step,events=eventsForBar(b,data.events,sec);mapped+=events.length;const group=shape('g',{tabindex:0,role:'button','aria-label':localTime(b.t*1000)+', закрытие '+b.c+', событий '+events.length,class:'candleGroup'});group.append(shape('rect',{x:x-step/2,y:top-25,width:step,height:bottom-top+30,fill:'transparent'}));const color=b.c>=b.o?'#55d9a2':'#ff8a88';group.append(shape('line',{x1:x,y1:y(b.h),x2:x,y2:y(b.l),stroke:color}),shape('rect',{x:x-step*.3,y:Math.min(y(b.o),y(b.c)),width:step*.6,height:Math.max(1,Math.abs(y(b.o)-y(b.c))),fill:color}));
 if(events.length){const trades=events.filter(e=>e.kind==='trade');group.append(shape('text',{x,y:20,'text-anchor':'middle',class:'chartMarker'},trades.length?trades.map(e=>e.body.side==='BUY'?'↑':'↓').join(''):String(events.length)));if(!trades.length)group.append(shape('circle',{cx:x,cy:16,r:8,fill:'none',stroke:'#e6c86b'}));}
 const select=()=>{byId('chartDetails').replaceChildren(node('h3',localTime(b.t*1000)+' (Нью-Йорк)'),node('p',`Открытие: ${b.o.toFixed(5)} · Максимум: ${b.h.toFixed(5)} · Минимум: ${b.l.toFixed(5)} · Закрытие: ${b.c.toFixed(5)}`));if(!events.length)byId('chartDetails').append(node('p','За этот интервал записей решений или сделок нет. Это не обязательно означает HOLD.'));for(const e of events)byId('chartDetails').append(decisionCard(e));};
 group.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')select();});group.addEventListener('focus',select);group.addEventListener('click',select);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});svg.append(group);
 if(i%Math.ceil(bars.length/7)===0)svg.append(shape('text',{x,y:330,'text-anchor':'middle',class:'chartLabel'},new Date(b.t*1000).toLocaleDateString('ru-RU',{timeZone:'America/New_York',day:'2-digit',month:'2-digit'})));
 });holder.append(svg);holder.scrollLeft=holder.scrollWidth;
 const old=Date.now()/1000-data.quoteTime>1800;
 byId('chartStatus').textContent=`${data.source} · ${bars.length} свечей · Последняя котировка: ${localTime(data.quoteTime*1000)} (Нью-Йорк)${old?' · Котировка старше 30 минут':''}. Отметок событий: ${mapped}. За пределами свечей: ${data.events.length-mapped}.`;
}
byId('chartSymbol').onchange=loadChart;byId('chartTimeframe').onchange=loadChart;byId('chartRefresh').onclick=loadChart;
setInterval(()=>{if(!document.hidden&&!byId('app').hidden&&location.hash==='#terminal'&&!chartBusy)loadChart();},60000);
