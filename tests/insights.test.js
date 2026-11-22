import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const elements={};
const make=()=>({append(){},replaceChildren(){},addEventListener(){},setAttribute(){},hidden:true});
const ctx={document:{getElementById:id=>elements[id]??=make(),createElement:make},setInterval(){},Date};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../public/insights.js',import.meta.url),'utf8'),ctx);
test('events use half-open candle boundaries, never snap weekend gaps',()=>{
 const events=[{ts:999},{ts:1000},{ts:3599999},{ts:3601000},{ts:99999999}];
 assert.equal(ctx.eventsForBar({t:1},events,3600).length,2);
});
test('beginner explanation preserves uncertainty and no-short limitation',()=>{
 const out=ctx.explainDecision({body:{proposal:{reasoning:'RSI 22, перепроданность; позиции нет, покупать против тренда'}}}).join(' ');
 assert.match(out,/не обещает/);assert.match(out,/не открывает шорт/);
});
test('unknown explanation gets honest fallback',()=>{
 assert.match(ctx.explainDecision({body:{proposal:{reasoning:'custom'}}})[0],/нет шаблонной/);
});
