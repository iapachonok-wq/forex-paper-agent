import {profileIdeas} from './profile-ideas.js';
import authors from '../public/fx-authors.json';
const domain='https://www.fxstreet.com';
function unwrap(s){return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').trim();}
async function attribution(url){
 if(!url.startsWith(domain+'/analysis/')&&!url.startsWith(domain+'/news/'))return null;
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(9000),cf:{cacheEverything:true,cacheTtl:3600}});
 if(!r.ok)return null;
 let json='',author;
 const filtered=new HTMLRewriter().on('script[type="application/ld+json"]',{
 element(el){json='';el.onEndTag(()=>{try{const entry=JSON.parse(json);const people=[entry.author].flat();author??=people.find(p=>p?.['@type']==='Person'&&Object.hasOwn(authors,p.name))?.name;}catch{}});},
 text(chunk){if(json.length<300000)json+=chunk.text;}
 }).transform(r);
 await filtered.body.pipeTo(new WritableStream({write(){}}));return author;
}
export async function individualIdeas(symbol){
 const seen=new Set(),ideas=[];let available=0;
 for(const channel of ['analysis','news']){
 try{
 const r=await fetch(domain+'/rss/'+channel,{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;
 const xml=await r.text();if(!xml.includes('<rss'))continue;available++;
 let lookups=0;
 for(const [item] of xml.matchAll(/<item>[\s\S]*?<\/item>/gi)){
 const field=k=>unwrap(item.match(new RegExp('<'+k+'>([\\s\\S]*?)</'+k+'>','i'))?.[1]||'');
 const title=field('title'),published=Date.parse(field('pubDate')),link=field('link'),age=Date.now()-published;
 if(!(age>=0&&age<86400000)||!(title+' '+field('description')).toUpperCase().replace(/[ /-]/g,'').includes(symbol)||!/(forecast|outlook|support|resistance|bull|bear|rebound|recovery|pressure|break|downside|upside|rally|target|sell|buy)/i.test(title))continue;
 if(++lookups>4)break;
 try{const author=await attribution(link);if(author&&!seen.has(author)&&!seen.has(title)){seen.add(author);seen.add(title);ideas.push({author,title:title.slice(0,220),link,published,received:Date.now()});}}catch{}
 }
 }catch{}
 }
 for(const idea of await profileIdeas(symbol)){if(!seen.has(idea.author)&&!seen.has(idea.title))ideas.push(idea);}
 return {ideas,available};
}
