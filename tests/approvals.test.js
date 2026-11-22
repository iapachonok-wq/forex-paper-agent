import test from 'node:test';import assert from 'node:assert/strict';
import {initial,execute} from '../src/engine.js';import {enqueue,queueProtection,resolve} from '../src/approvals.js';
const now=Date.UTC(2026,10,12,12),prices={EURUSD:1.1,GBPUSD:1.25};
const proposal={symbol:'EURUSD',action:'BUY',size_fraction:.1,confidence:.9,injection_suspected:false};
function setup(){const s=initial();s.enabled=true;const p=enqueue(s,proposal,{amount:1000},1.1,false,now);return {s,p};}
test('queue never executes, approval executes only once',()=>{const {s,p}=setup();assert.equal(s.trades.length,0);resolve(s,p.id,'approve',prices,now+1000);resolve(s,p.id,'approve',prices,now+2000);assert.equal(s.trades.length,1);});
test('rejection and expiry cannot execute',()=>{for(const mode of ['reject','expire']){const {s,p}=setup();resolve(s,p.id,mode==='reject'?'reject':'approve',prices,mode==='expire'?now+900001:now);resolve(s,p.id,'approve',prices,now+900002);assert.equal(s.trades.length,0);}});
test('price drift and changed risk block approval',()=>{const {s,p}=setup();assert.equal(resolve(s,p.id,'approve',{...prices,EURUSD:1.2},now).status,'invalidated');assert.equal(s.trades.length,0);const other=setup();other.s.halted=true;assert.equal(resolve(other.s,other.p.id,'approve',prices,now).status,'invalidated');});
test('protection only queues; rejects do not sell',()=>{const s=initial();s.enabled=true;execute(s,'EURUSD','BUY',1000,1.1,now-7200000);const old=s.trades.length;const pending=queueProtection(s,{...prices,EURUSD:1.07},now);assert.equal(pending.length,1);assert.equal(s.trades.length,old);resolve(s,pending[0].id,'reject',prices,now);assert.equal(s.trades.length,old);});
test('duplicate pending suppressed and protection supersedes buy',()=>{const {s,p}=setup();assert.equal(enqueue(s,proposal,{amount:1000},1.1,false,now),null);enqueue(s,{symbol:'EURUSD',action:'SELL'},{amount:1000},1.1,true,now);assert.equal(p.status,'superseded');});
