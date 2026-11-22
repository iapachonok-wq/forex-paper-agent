export function practicalPlan(plan,{stale,marketClosed}){
 if(!plan||!['WAIT','CONSIDER_BUY','AVOID'].includes(plan.action))throw Error('Некорректный план прогноза');
 if(stale||marketClosed)return {...plan,action:'WAIT',now:'Сейчас не открывать новую позицию по этому прогнозу: рынок закрыт или котировки устарели.',review:'Получить свежие котировки после открытия и повторить прогноз после закрытия первой полной часовой свечи. Это время проверки, а не обещание покупки.',avoid:'Не покупать по старым уровням и сразу после гэпа. Условия покупки ниже требуют проверки на новых данных.'};
 return plan;
}
