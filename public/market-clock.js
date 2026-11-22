(function(root){
 const zone='America/New_York';
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',hour:'numeric',hourCycle:'h23'});
 function closed(t=Date.now()){const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return p.weekday==='Sat'||p.weekday==='Fri'&&+p.hour>=17||p.weekday==='Sun'&&+p.hour<17;}
 function next(t=Date.now()){const state=closed(t);let point=Math.floor(t/3600000)*3600000+3600000;for(let i=0;i<192;i++,point+=3600000)if(closed(point)!==state)return {at:point,opening:state};throw Error('Schedule boundary not found');}
 root.FxSchedule={closed,next,zone};
})(globalThis);
