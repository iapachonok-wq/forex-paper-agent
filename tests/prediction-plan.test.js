import test from 'node:test';import assert from 'node:assert/strict';import {practicalPlan} from '../src/prediction-plan.js';
const p={action:'CONSIDER_BUY',now:'buy',buy_condition:'condition',review:'review',avoid:'avoid',cancel:'cancel'};
test('stale or closed market always forces waiting',()=>{for(const state of [{stale:true,marketClosed:false},{stale:false,marketClosed:true}]){const r=practicalPlan(p,state);assert.equal(r.action,'WAIT');assert.match(r.review,/время проверки/);assert.equal(p.action,'CONSIDER_BUY');}});
test('fresh plan is preserved, malformed plan fails closed',()=>{assert.equal(practicalPlan(p,{stale:false,marketClosed:false}),p);assert.throws(()=>practicalPlan({action:'SELL'},{}));});
