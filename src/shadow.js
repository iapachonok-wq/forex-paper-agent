import {safeHeadlines} from './guard.js';
import {individualIdeas} from './individuals.js';
import sources from '../public/shadow-sources.json';
const feeds=['technical-analysis','fundamental-analysis'];
function field(xml,name){
 const match=xml.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'));
 return (match?.[1]||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').trim();
}
export async function signals(symbol){
 const found=[],seen=new Set();let available=0;
 for(const feed of feeds){
 try{
 const r=await fetch('https://www.actionforex.com/category/contributors/'+feed+'/feed/',{signal:AbortSignal.timeout(8000)});
 if(!r.ok)continue;
 const xml=await r.text();if(!xml.includes('<rss'))continue;available++;
 for(const [item] of xml.matchAll(/<item>[\s\S]*?<\/item>/gi)){
 const title=field(item,'title'),author=field(item,'dc:creator'),link=field(item,'link'),published=Date.parse(field(item,'pubDate'));
 const age=Date.now()-published;
 if(!Object.hasOwn(sources,author)||!title.toUpperCase().replace(/[\s/-]/g,'').includes(symbol)||!(age>=0&&age<86400000)||!/^https:\/\/www\.actionforex\.com\//.test(link))continue;
 if(!/bull|bear|upside|downside|recovery|support|resistance|rally|rebound|pressure|breakout|decline|sell|buy/i.test(title)||seen.has(author)||seen.has(title))continue;
 seen.add(author);seen.add(title);found.push({author,title:title.slice(0,220),link,published,received:Date.now()});
 }
 }catch{}
 }
 const individuals=await individualIdeas(symbol);const ideas=[...individuals.ideas,...found].filter(i=>safeHeadlines([i.title]).length);return {ideas,available:available+individuals.available};
}
