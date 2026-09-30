import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addTeam, addPick, emptyDraft, moveTeam, shuffleOrder, startDraft, teamForPick } from './draft.ts';
const cast = JSON.parse(readFileSync(new URL('./cast.json', import.meta.url), 'utf8')) as {id: string}[];
const ids = cast.map(c => c.id);
test('five-team snake finishes with four unique contestants per team', () => {
  assert.equal(ids.length, 20); assert.equal(new Set(ids).size,20);
  let state = emptyDraft();
  for(let i=0;i<5;i++) state=addTeam(state, `uid${i}`, `Team ${i}`);
  assert.throws(()=>addPick(state,'uid0',ids[0],ids,0));
  state=moveTeam(state,0,4);
  assert.deepEqual(state.order,['uid4','uid1','uid2','uid3','uid0']);
  state=startDraft(state);
  const order=[0,1,2,3,4,4,3,2,1,0,0,1,2,3,4,4,3,2,1,0];
  for(let n=0;n<20;n++) {
    assert.equal(teamForPick(n),order[n]);
    assert.throws(()=>addPick(state,state.order[(order[n]+1)%5],ids[n],ids,n));
    state=addPick(state,state.order[order[n]],ids[n],ids,n);
  }
  for(let i=0;i<5;i++) assert.equal(state.picks.filter((_,n)=>teamForPick(n)===i).length,4);
  assert.throws(()=>addPick(state,'uid0',ids[0],ids,20));
  assert.throws(()=>moveTeam(state,0,1));
});
test('rejects duplicate names, sixth teams, pre-lobby picks, stale submissions and invalid contestants',()=>{
  let state=addTeam(emptyDraft(),'a',' Team A ');
  assert.equal(addTeam(state,'a','New name'),state);
  assert.throws(()=>addTeam(state,'b','team a'));
  assert.throws(()=>addTeam(state,'b',' '));
  assert.throws(()=>addPick(state,'a',ids[0],ids,0));
  for(let i=1;i<5;i++)state=addTeam(state,`u${i}`,`Team ${i}`);
  assert.throws(()=>addTeam(state,'six','Team Six'));
  assert.throws(()=>addPick(state,'a',ids[0],ids,0));
  state=startDraft(state);
  assert.throws(()=>addPick(state,'a','aaliyah-puglia',ids,0));
  state=addPick(state,'a',ids[0],ids,0);
  assert.throws(()=>addPick(state,'u1',ids[0],ids,1));
  assert.throws(()=>addPick(state,'u1',ids[1],ids,0));
});
test('early test start shuffles joined teams and pauses at open slots',()=>{
  let state=addTeam(emptyDraft(),'a','Team A');
  state=addTeam(state,'b','Team B');
  state=startDraft({...state,order:shuffleOrder(state.order,()=>0)});
  assert.deepEqual(state.order,['b','a']);
  state=addPick(state,'b',ids[0],ids,0);
  state=addPick(state,'a',ids[1],ids,1);
  assert.throws(()=>addPick(state,'b',ids[2],ids,2));
  state=addTeam(state,'c','Team C');
  state=addPick(state,'c',ids[2],ids,2);
  assert.equal(state.picks.length,3);
});
