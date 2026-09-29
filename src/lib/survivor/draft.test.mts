import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addTeam, addPick, emptyDraft, teamForPick } from './draft.ts';
const cast = JSON.parse(readFileSync(new URL('./cast.json', import.meta.url), 'utf8')) as {id: string}[];
const ids = cast.map(c => c.id);
test('five-team snake finishes with four unique contestants per team', () => {
  assert.equal(ids.length, 20); assert.equal(new Set(ids).size,20);
  let state = emptyDraft();
  for(let i=0;i<5;i++) state=addTeam(state, `uid${i}`, `Team ${i}`);
  const order=[0,1,2,3,4,4,3,2,1,0,0,1,2,3,4,4,3,2,1,0];
  for(let n=0;n<20;n++) {
    assert.equal(teamForPick(n),order[n]);
    assert.throws(()=>addPick(state,`uid${(order[n]+1)%5}`,ids[n],ids,n));
    state=addPick(state,`uid${order[n]}`,ids[n],ids,n);
  }
  for(let i=0;i<5;i++) assert.equal(state.picks.filter((_,n)=>teamForPick(n)===i).length,4);
  assert.throws(()=>addPick(state,'uid0',ids[0],ids,20));
});
test('rejects duplicate names, sixth teams, pre-lobby picks, stale submissions and invalid contestants',()=>{
  let state=addTeam(emptyDraft(),'a',' Team A ');
  assert.equal(addTeam(state,'a','New name'),state);
  assert.throws(()=>addTeam(state,'b','team a'));
  assert.throws(()=>addTeam(state,'b',' '));
  assert.throws(()=>addPick(state,'a',ids[0],ids,0));
  for(let i=1;i<5;i++)state=addTeam(state,`u${i}`,`Team ${i}`);
  assert.throws(()=>addTeam(state,'six','Team Six'));
  assert.throws(()=>addPick(state,'a','aaliyah-puglia',ids,0));
  state=addPick(state,'a',ids[0],ids,0);
  assert.throws(()=>addPick(state,'u1',ids[0],ids,1));
  assert.throws(()=>addPick(state,'u1',ids[1],ids,0));
});
