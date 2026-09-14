import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const seed=JSON.parse(fs.readFileSync(new URL('../data/journey.json',import.meta.url)));
const core=await import('../app/core.mjs');

test('seed validates and day number is bounded',()=>{
  assert.equal(core.validateJourneyData(seed).ok,true);
  assert.equal(core.dayNumber(seed,'2026-08-25'),1);
  assert.equal(core.dayNumber(seed,'2026-11-03'),71);
});

test('stage change impact and undo preserve canonical seed',()=>{
  let state=core.defaultState();
  state.events.push({id:'e1',date:'2026-09-20',start:'10:00',end:'11:00',title:'Meeting'});
  const impact=core.impactOfStageChange(seed,state,'stage-06-shenzhen-long',{end:'2026-09-28'});
  assert.equal(impact.counts.events,1);
  state=core.applyStageChange(seed,state,'stage-06-shenzhen-long',{end:'2026-09-28'},'test');
  assert.equal(core.effectiveStages(seed,state).find(s=>s.id==='stage-06-shenzhen-long').end,'2026-09-28');
  state=core.undoLastChange(state);
  assert.equal(core.effectiveStages(seed,state).find(s=>s.id==='stage-06-shenzhen-long').end,'2026-10-22');
});

test('conflict engine finds short airport buffer',()=>{
  const state=core.defaultState();
  state.events=[{id:'m',date:'2026-09-20',start:'13:00',end:'14:00',title:'Meeting'}];
  state.travel=[{id:'f',date:'2026-09-20',departureTime:'14:30',arrivalTime:'17:00',title:'SZX flight',mode:'flight'}];
  const risks=core.detectConflicts(state);
  assert.equal(risks.length,1);
  assert.equal(risks[0].kind,'buffer');
  assert.equal(risks[0].level,'critical');
});

test('relationship summary separates waiting and owed',()=>{
  const state=core.defaultState();
  state.people=[{id:'p1',name:'Allen'}];
  state.actions=[{id:'a1',personId:'p1',status:'waiting'},{id:'a2',personId:'p1',status:'open'}];
  const r=core.relationshipSummary(state,'p1');
  assert.equal(r.openLoops,2);
  assert.equal(r.waiting.length,1);
  assert.equal(r.owed.length,1);
});