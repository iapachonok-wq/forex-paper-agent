import profiles from './fx-profiles.json';
async function profileIdea(author,url,symbol){
 const r=await fetch(url,{signal:AbortSignal.timeout(6000),cf:{cacheEverything:true,cacheTtl:1800}});if(!r.ok)return null;
 const candidates=[];
 const parser=new HTMLRewriter().on('a[href]',{
 element(el){
 const link=el.getAttribute('href')||'';
 if(!/^https:\/\/www\.fxstreet\.com\/(news|analysis)\//.test(link))return;
 const date=link.match(/-(20\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/);
 if(!date)return;
 const published=Date.UTC(+date[1],+date[2]-1,+date[3],+date[4],+date[5]);
 const age=Date.now()-published;if(!(age>=0&&age<86400000))return;
 if(!link.toUpperCase().replace(/-/g,'').includes(symbol))return;
 if(!candidates.includes(link))candidates.push(link);
 }});
 await parser.transform(r).body.pipeTo(new WritableStream({write(){}}));
 for(const link of candidates.slice(0,2)){
 const article=await fetch(link,{signal:AbortSignal.timeout(7000),cf:{cacheEverything:true,cacheTtl:3600}});
 if(!article.ok)continue;
 let raw='',idea;
 await new HTMLRewriter().on('script[type="application/ld+json"]',{element(el){raw='';el.onEndTag(()=>{try{
 const o=JSON.parse(raw),published=Date.parse(o.datePublished),age=Date.now()-published;
 if(o.isAccessibleForFree===false||o.isAccessibleForFree==='False'||!(age>=0&&age<86400000)||![o.author].flat().some(a=>a?.name===author))return;
 if(typeof o.headline==='string'&&/forecast|outlook|support|resistance|bull|bear|pressure|break|rebound|recovery|target/i.test(o.headline))idea={author,title:o.headline.slice(0,220),link,published,received:Date.now()};
 }catch{}});},text(c){if(raw.length<300000)raw+=c.text;}}).transform(article).body.pipeTo(new WritableStream({write(){}}));if(idea)return idea;
 }
 return null;
}
export async function profileIdeas(symbol){
 const all=Object.entries(profiles),group=Math.floor(Date.now()/14400000),start=group*5%all.length;
 const selected=Array.from({length:Math.min(5,all.length)},(_,i)=>all[(start+i)%all.length]);
 const settled=await Promise.allSettled(selected.map(([author,url])=>profileIdea(author,url,symbol)));
 return settled.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]);
}
