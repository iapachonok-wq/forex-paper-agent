const $=id=>document.getElementById(id);let keys=[];
async function api(path,body){const r=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Panel':'1'},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();if(!r.ok){if(r.status===401)showLogin();throw Error(j.error||'Ошибка запроса');}return j;}
function notice(s){$('notice').textContent=s;}function showLogin(){document.querySelectorAll('#brokerProfiles input').forEach(x=>{x.value='';x.hidden=true;});$('login').hidden=false;$('app').hidden=true;$('logout').hidden=true;}
function route(){const name=['overview','terminal','markets','shadow','brokers','prediction','keys','scenarios'].includes(location.hash.slice(1))?location.hash.slice(1):'overview';for(const id of ['overview','terminal','markets','shadow','brokers','prediction','keys','scenarios'])$(id).hidden=id!==name;document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+name));}
function keyStatus(){const k=keys.find(k=>k.name===$('provider').value);$('keyStatus').textContent=!k?'Ключ ещё не задан':k.disabled?'Отключён':k.expires?'Сохранён, использовать до '+k.expires:'Сохранён без локального срока';$('expires').value=k?.expires||'';$('keyValue').value='';}
async function refresh(statusOnly=false){try{const j=await api('status');$('login').hidden=true;$('app').hidden=false;$('logout').hidden=false;$('equity').textContent=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD'}).format(j.equity);$('trades').textContent=j.state.trades.length;$('cost').textContent='$'+j.state.usage.toFixed(3);$('status').textContent=j.state.halted?'Остановлен по просадке':j.state.enabled?(j.state.marketClosed?'Расписание включено · рынок закрыт':'Облачный анализ включён'):'Облачный анализ на паузе';$('heartbeat').textContent=j.state.lastWatch?'Последняя проверка: '+new Date(j.state.lastWatch).toLocaleString('ru-RU',{timeZone:'America/New_York'})+' (Нью-Йорк)':'Первый цикл ещё не выполнялся';$('error').textContent=j.state.lastError||'';$('events').replaceChildren();for(const e of j.events){const d=document.createElement('div');d.className='event';d.textContent=new Date(e.ts).toLocaleString('ru-RU',{timeZone:'America/New_York'})+' · '+e.kind+' · '+(e.body.proposal?.reasoning||e.body.message||JSON.stringify(e.body));$('events').append(d);}renderApprovals(j.state);renderTerminal(j);renderReadable(j.events);if(!statusOnly){keys=(await api('keys')).keys;keyStatus();}route();if(location.hash==='#shadow')loadShadow();}catch(e){notice(e.message);$('terminalFresh').textContent='Не удалось обновить. Показаны последние полученные данные.';}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{await api('login',{password:$('password').value});$('password').value='';notice('');await refresh();loadChart();}catch(e){notice(e.message);}};
$('logout').onclick=async()=>{await api('logout',{});showLogin();};
$('keyForm').onsubmit=async e=>{e.preventDefault();try{await api('keys',{name:$('provider').value,value:$('keyValue').value,expires:$('expires').value});keys=(await api('keys')).keys;keyStatus();notice('Настройки ключа сохранены.');}catch(e){notice(e.message);}};
$('provider').onchange=keyStatus;
$('disableKey').onclick=async()=>{if(!confirm('Отключить выбранный ключ?'))return;try{await api('keys',{name:$('provider').value,disable:true});keys=(await api('keys')).keys;keyStatus();notice('Ключ отключён.');}catch(e){notice(e.message);}};
for(const [id,enabled] of [['enable',true],['pause',false]])$(id).onclick=async()=>{try{await api('control',{enabled});await refresh();}catch(e){notice(e.message);}};
for(const b of document.querySelectorAll('[data-scenario]'))b.onclick=async()=>{b.disabled=true;try{const r=await api('scenario',{name:b.dataset.scenario});$('result').hidden=false;$('resultTitle').textContent='Сценарий выполнен';$('resultPnl').textContent='Тестовый капитал: $'+r.equity.toFixed(2)+' · результат: $'+r.pnl.toFixed(2)+' · платных запросов: 0';$('steps').replaceChildren();for(const step of r.steps){const p=document.createElement('pre');p.textContent=JSON.stringify(step,null,2);$('steps').append(p);}notice('Основной счёт не изменён.');}catch(e){notice(e.message);}finally{b.disabled=false;}};
$('checkData').onclick=async()=>{const b=$('checkData');b.disabled=true;try{const r=await api('check-data',{symbol:'EURUSD'});$('dataResult').textContent=JSON.stringify(r,null,2);}catch(e){notice(e.message);}finally{b.disabled=false;}};
window.addEventListener('hashchange',()=>{route();if(location.hash==='#terminal')loadChart();});refresh().then(()=>{if(!$('app').hidden)loadChart();});

$('verifyKey').onclick=async()=>{try{const r=await api('check-key',{});notice('Anthropic доступен: '+r.model);}catch(e){notice(e.message);}};

function renderTerminal(j){
 const s=j.state, date=t=>t?new Date(t).toLocaleString('ru-RU',{timeZone:'America/New_York'})+' (Нью-Йорк)':'ещё нет';
 const age=s.lastWatch?(Date.now()-s.lastWatch)/60000:null;
 const lines=[
 'ВАЛЮТНЫЙ АГЕНТ / CLOUDFLARE / PAPER',
 'Режим: С ПОДТВЕРЖДЕНИЕМ — виртуальные сделки',
 'Расписание: '+(s.enabled?'включено':'пауза')+' | Защитная остановка: '+(s.halted?'да':'нет'),
 'Рынок: '+(s.marketClosed?'закрыт, анализ AI пропускается':'последний цикл не помечен как закрытый'),
 'Последняя проверка: '+date(s.lastWatch),
 ...(age===null?['Проверок ещё не было.']:age>15?['ВНИМАНИЕ: последняя проверка более 15 минут назад.']:[]),
 'Капитал: $'+j.equity.toFixed(2)+' | Свободно: $'+s.cash.toFixed(2),
 'Сделок: '+s.trades.length+' | Пары: '+j.symbols.join(', '),
 'Позиции: '+JSON.stringify(s.positions),
 'API за '+s.month+': ~$'+s.usage.toFixed(3)+' / лимит $90',
 '', 'АВТОМАТИЧЕСКИЙ ЦИКЛ',
 '01 Каждые 5 минут: проверка рынка, котировок и защитных ограничений.',
 '02 На открытом рынке раз в 4 часа для каждой пары: свечи 1h/4h/1d, индикаторы, новости. По одной паре за запуск.',
 '03 Аналитик Opus 5.5 предлагает BUY / SELL / HOLD.',
 '04 Код проверяет риски; критик Opus проверяет допустимое предложение без новостей и рассуждений аналитика.',
 '05 Предложение → ваше подтверждение → свежие цены и лимиты → виртуальная сделка.',
 '', 'ЛИМИТЫ',
 'Сделка ≤20% капитала; позиция ≤50%; общий объём ≤80%.',
 'До 4 обычных сделок за 24 часа; пауза 60 минут на пару; уверенность ≥0,60.',
 'Стоп 1,5%; предельная просадка 15%. Гэп может ухудшить цену выхода.',
 'Защитные выходы не ограничены лимитом обычных сделок. Без плеча и коротких продаж.',
 '', 'ОГРАНИЧЕНИЯ',
 'Все сделки, включая защитные выходы, требуют вашего подтверждения. Без ответа исполнения нет.',
 'FRED и внеочередной AI-анализ по скачкам цены не подключены.',
 '', 'ПОСЛЕДНИЕ СОБЫТИЯ'];
 for(const e of j.events.slice(0,20))lines.push(date(e.ts)+' | '+e.kind+' | '+(e.body.proposal?.reasoning||e.body.message||JSON.stringify(e.body)));
 if(s.lastError)lines.push('', 'ОШИБКА: '+s.lastError);
 $('terminalOutput').textContent=lines.join('\n');
 $('terminalFresh').textContent='Сводка обновлена: '+date(Date.now());
}
$('refreshTerminal').onclick=async()=>{const b=$('refreshTerminal');b.disabled=true;try{await refresh(true);}finally{b.disabled=false;}};
setInterval(()=>{if(!document.hidden&&!$('app').hidden)refresh(true);},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('app').hidden)refresh(true);});

function renderApprovals(s){
 for(const id of ['approvalsOverview','approvalsTerminal']){
 const host=$(id);host.replaceChildren();const pending=(s.pending||[]).filter(p=>p.status==='pending'&&p.expires>Date.now());
 if(!pending.length){host.textContent='Нет предложений, ожидающих подтверждения.';continue;}
 for(const p of pending){const card=document.createElement('article');const title=document.createElement('h3');title.textContent=(p.protective?'Защитный выход: ':'')+(p.proposal.action==='BUY'?'Купить ':'Продать ')+p.proposal.symbol;const desc=document.createElement('p');desc.textContent='Объём около $'+p.amount.toFixed(2)+' · Цена при предложении '+p.price.toFixed(5)+' · Действует до '+new Date(p.expires).toLocaleTimeString('ru-RU',{timeZone:'America/New_York'})+' (Нью-Йорк). '+(p.proposal.reasoning||'');card.append(title,desc);
 for(const [action,label] of [['approve','Подтвердить виртуальную сделку'],['reject','Отклонить']]){const b=document.createElement('button');b.textContent=label;b.className=action==='reject'?'secondary':'';b.onclick=async()=>{if(action==='approve'&&!confirm('Исполнить виртуальную '+(p.proposal.action==='BUY'?'покупку':'продажу')+' '+p.proposal.symbol+' по свежей цене?'))return;card.querySelectorAll('button').forEach(x=>x.disabled=true);try{const r=await api('approval',{id:p.id,action});notice(({approved:'Виртуальная сделка исполнена.',rejected:'Предложение отклонено.',expired:'Срок предложения истёк.',invalidated:'Предложение больше не действует.',superseded:'Предложение заменено защитным выходом.'}[r.status]||r.status)+(r.reason?' '+r.reason:''));await refresh(true);}catch(e){notice(e.message);card.querySelectorAll('button').forEach(x=>x.disabled=false);}};card.append(b);}host.append(card);}
 }
}

let nextMarketBoundary;
function updateMarketClock(){
 const t=Date.now();if(!nextMarketBoundary||t>=nextMarketBoundary.at)nextMarketBoundary=FxSchedule.next(t);
 const seconds=Math.max(0,Math.floor((nextMarketBoundary.at-t)/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
 $('marketOpenState').textContent=FxSchedule.closed(t)?'Forex закрыт по недельному расписанию':'Forex открыт по недельному расписанию';
 $('marketCountdown').textContent=(nextMarketBoundary.opening?'До открытия: ':'До закрытия: ')+(days?days+' дн. ':'')+hours+' ч. '+minutes+' мин. '+seconds%60+' сек.';
 const format=v=>new Date(v).toLocaleString('ru-RU',{timeZone:'America/New_York',timeZoneName:'short'});
 $('marketNow').textContent='Сейчас в Нью-Йорке: '+format(t);
 $('marketNext').textContent=(nextMarketBoundary.opening?'Следующее открытие: ':'Ближайшее закрытие: ')+format(nextMarketBoundary.at);
}
updateMarketClock();setInterval(updateMarketClock,1000);

async function loadShadow(){
 if($('app').hidden||location.hash!=='#shadow')return;
 try{
 const d=await api('shadow');$('shadowCost').textContent='Расход за месяц $'+(d.usage||0).toFixed(3)+' из $15';
 const host=$('shadowRows');host.replaceChildren();if(!d.rows.length)host.textContent='Сравнения появятся после следующего планового анализа.';
 for(const r of d.rows){const card=node('article');card.append(node('h3',r.symbol+' · '+localTime(r.ts)),node('p','Без сигналов: '+r.baseline+' · С сигналами: '+(r.withSignals||'пропуск')),node('p',r.reason||r.note));for(const i of r.ideas){const a=node('a',i.author+' · '+localTime(i.published)+' · '+i.title);a.href=i.link;a.target='_blank';a.rel='noopener noreferrer';card.append(a,node('br'));}host.append(card);}
 const individuals=await (await fetch('/fx-authors.json')).json();const teams=await (await fetch('/shadow-sources.json')).json();const sources={...individuals,...teams};$('shadowSources').replaceChildren(node('p','Индивидуальные авторы: '+Object.keys(individuals).length+'. Команды: '+Object.keys(teams).length+'. Ссылки ведут на примеры публикаций.'));for(const [name,url] of Object.entries(sources)){const a=node('a',name+(Object.hasOwn(individuals,name)?' · автор FXStreet':' · команда ActionForex'));a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('shadowSources').append(a,node('br'));}
 }catch(e){notice(e.message);}
}
$('shadowRefresh').onclick=loadShadow;window.addEventListener('hashchange',loadShadow);
