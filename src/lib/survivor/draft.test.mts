import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addTeam, addPick, emptyDraft, moveTeam, setTeamCount, shuffleOrder, startDraft, teamForPick } from './draft.ts';
const cast = JSON.parse(readFileSync(new URL('./cast.json', import.meta.url), 'utf8')) as {id: string}[];
const ids = cast.map(c => c.id);
test('four-team snake finishes with five unique contestants per team', () => {
  assert.equal(ids.length, 20); assert.equal(new Set(ids).size,20);
  let state = emptyDraft();
  for(let i=0;i<4;i++) state=addTeam(state, `uid${i}`, `Team ${i}`);
  assert.throws(()=>addPick(state,'uid0',ids[0],ids,0));
  state=moveTeam(state,0,3);
  assert.deepEqual(state.order,['uid3','uid1','uid2','uid0']);
  state=startDraft(state);
  const order=[0,1,2,3,3,2,1,0,0,1,2,3,3,2,1,0,0,1,2,3];
  for(let n=0;n<20;n++) {
    assert.equal(teamForPick(n, 4),order[n]);
    assert.throws(()=>addPick(state,state.order[(order[n]+1)%4],ids[n],ids,n));
    state=addPick(state,state.order[order[n]],ids[n],ids,n);
  }
  for(let i=0;i<4;i++) assert.equal(state.picks.filter((_,n)=>teamForPick(n, 4)===i).length,5);
  assert.throws(()=>addPick(state,'uid0',ids[0],ids,20));
  assert.throws(()=>moveTeam(state,0,1));
});
test('rejects duplicate names, fifth teams, pre-lobby picks, stale submissions and invalid contestants',()=>{
  let state=addTeam(emptyDraft(),'a',' Team A ');
  assert.equal(addTeam(state,'a','New name'),state);
  assert.throws(()=>addTeam(state,'b','team a'));
  assert.throws(()=>addTeam(state,'b',' '));
  assert.throws(()=>addPick(state,'a',ids[0],ids,0));
  for(let i=1;i<4;i++)state=addTeam(state,`u${i}`,`Team ${i}`);
  assert.throws(()=>addTeam(state,'fifth','Team Five'));
  assert.throws(()=>addPick(state,'a',ids[0],ids,0));
  state=startDraft(state);
  assert.throws(()=>addPick(state,'a','aaliyah-puglia',ids,0));
  state=addPick(state,'a',ids[0],ids,0);
  assert.throws(()=>addPick(state,'u1',ids[0],ids,1));
  assert.throws(()=>addPick(state,'u1',ids[1],ids,0));
});
test('two joined teams can start and snake through all 20 picks',()=>{
  let state=setTeamCount(emptyDraft(),2);
  state=addTeam(state,'a','Team A');
  state=addTeam(state,'b','Team B');
  state=startDraft({...state,order:shuffleOrder(state.order,()=>0)});
  assert.equal(state.teamCount,2);
  assert.deepEqual(state.order,['b','a']);
  for(let n=0;n<20;n++) {
    const owner=state.order[teamForPick(n,2)];
    state=addPick(state,owner,ids[n],ids,n);
  }
  assert.equal(state.picks.length,20);
  assert.throws(()=>addTeam(state,'c','Late Team'));
});
test('three teams draft all castaways with a 7/7/6 split',()=>{
  let state=setTeamCount(emptyDraft(),3);
  for(let i=0;i<3;i++)state=addTeam(state,`u${i}`,`Team ${i}`);
  state=startDraft(state);
  for(let n=0;n<20;n++)state=addPick(state,state.order[teamForPick(n,3)],ids[n],ids,n);
  assert.deepEqual(state.order.map((_,i)=>state.picks.filter((_,n)=>teamForPick(n,3)===i).length),[7,7,6]);
});
test('start with fewer than the configured limit uses joined teams and locks the count',()=>{
  let state=addTeam(emptyDraft(),'a','Team A');
  state=addTeam(state,'b','Team B');
  state=startDraft(state);
  assert.equal(state.teamCount,2);
  assert.throws(()=>setTeamCount(state,4));
  assert.throws(()=>addTeam(state,'c','Late Team'));
});
