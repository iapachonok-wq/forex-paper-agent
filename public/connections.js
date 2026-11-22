async function loadBrokers(){
 if($('app').hidden)return;
 try{const {profiles}=await api('brokers');const host=$('brokerProfiles');host.replaceChildren();if(!profiles.length)host.append(node('p','Демо-счета ещё не подключены. После регистрации добавьте Account ID и токен.'));
 for(const p of profiles){const card=node('article');card.append(node('h2',p.label),node('p','OANDA Practice · '+p.accountId),node('p','Сохранён профиль. Соединение проверяется отдельной кнопкой; отправка сделок не подключена.','muted'));
 const output=node('pre'),secret=node('input');secret.type='password';secret.readOnly=true;secret.hidden=true;secret.autocomplete='off';secret.setAttribute('aria-label','Сохранённый API-токен');let timer;
 const hide=()=>{clearTimeout(timer);secret.value='';secret.type='password';secret.hidden=true;};
 for(const [action,label] of [['check','Проверить счёт'],['reveal','Показать API-токен на 30 секунд'],['delete','Удалить подключение']]){const b=node('button',label,'secondary');b.onclick=async()=>{if(action==='delete'&&!confirm('Удалить сохранённый токен из панели? Сам счёт OANDA останется.'))return;b.disabled=true;try{const r=await api('brokers',{id:p.id,action});if(action==='reveal'){hide();secret.hidden=false;secret.type='text';secret.value=r.token;timer=setTimeout(hide,30000);}else if(action==='check'){output.textContent='Проверено: '+localTime(r.checkedAt)+' (Нью-Йорк)\n'+JSON.stringify(r,null,2);}else{hide();await loadBrokers();}}catch(e){output.textContent=e.message;}finally{b.disabled=false;}};card.append(b);}
 const hideButton=node('button','Скрыть токен','secondary');hideButton.onclick=hide;card.append(hideButton,secret,output);const link=node('a','Открыть кабинет OANDA ↗');link.href='https://hub.oanda.com/';link.target='_blank';link.rel='noopener noreferrer';card.append(link);host.append(card);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});window.addEventListener('hashchange',hide);
 }
 }catch(e){notice(e.message);}
}
$('brokerForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await api('brokers',{action:'save',profile:{provider:'oanda_practice',label:$('brokerLabel').value,accountId:$('brokerAccount').value.trim(),token:$('brokerToken').value.trim()}});$('brokerToken').value='';notice('Профиль сохранён. Нажмите «Проверить счёт», чтобы проверить подключение.');await loadBrokers();}catch(e){notice(e.message);}finally{button.disabled=false;}};
$('reloadBrokers').onclick=loadBrokers;
window.addEventListener('hashchange',()=>{if(location.hash==='#brokers')loadBrokers();});
// Loading the broker page never reveals a token or calls the broker automatically.
setTimeout(()=>{if(location.hash==='#brokers')loadBrokers();},1000);
$('makePrediction').onclick=async()=>{
 const b=$('makePrediction');b.disabled=true;const symbol=$('predictionSymbol').value;$('predictionStatus').textContent='Анализируем '+symbol+'… Это может занять до нескольких минут.';$('predictionResult').hidden=true;
 try{const p=await api('prediction',{symbol});const host=$('predictionResult');host.replaceChildren(node('h2',p.symbol+' · '+p.horizon),node('p','Создан: '+localTime(p.createdAt)+' (Нью-Йорк). Котировка: '+localTime(p.quoteTime*1000)+' · '+p.price+(p.stale?' · Данные устарели: это условный сценарий по последним доступным данным.':'')));
 if(p.result.plan){const plan=p.result.plan,box=node('article',undefined,'marketBanner');box.append(node('h2','Что делать: '+({WAIT:'ждать',CONSIDER_BUY:'рассмотреть покупку при условиях',AVOID:'пропустить вход'}[plan.action]||'проверить условия')));for(const [key,label] of [['now','Сейчас'],['buy_condition','Покупку рассматривать, только если'],['review','Когда проверить снова'],['avoid','Когда не покупать'],['cancel','Когда отменить идею']])box.append(node('h3',label),node('p',plan[key]));box.append(node('small','Условный план для демо-счёта, а не команда на сделку. Точность прогноза не гарантирована; исполнение требует отдельного подтверждения.'));host.append(box);}
 for(const [k,label] of [['summary','Кратко'],['base_case','Базовый сценарий'],['bull_case','Если цена растёт'],['bear_case','Если цена падает'],['invalidation','Когда прогноз перестаёт действовать'],['uncertainty','Что остаётся неизвестным']])host.append(node('h3',label),node('p',p.result[k]));host.hidden=false;$('predictionStatus').textContent='Прогноз готов. Сделок и заявок не создано.';
 }catch(e){$('predictionStatus').textContent='Прогноз не получен: '+e.message;}finally{b.disabled=false;}
};
