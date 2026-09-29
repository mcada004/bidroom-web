import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, runTransaction } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const env=await initializeTestEnvironment({projectId:'demo-survivor',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8188}});
const clients=Array.from({length:6},(_,i)=>env.authenticatedContext(`u${i}`).firestore());
const publicDb=env.unauthenticatedContext().firestore();
const ref=db=>doc(db,'survivorDrafts','survivor-51-2026');
const ids=JSON.parse(readFileSync('src/lib/survivor/cast.json','utf8')).map(c=>c.id);
const order=[0,1,2,3,4,4,3,2,1,0,0,1,2,3,4,4,3,2,1,0];
let s={uids:['u0'],names:['Team 0'],nameKeys:['team 0'],picks:[]};
try {
 await assertSucceeds(getDoc(ref(publicDb)));
 await assertFails(getDocs(collection(publicDb,'survivorDrafts')));
 await assertFails(setDoc(ref(publicDb),s));
 await assertFails(setDoc(ref(clients[1]),s));
 await assertSucceeds(setDoc(ref(clients[0]),s));
 await assertFails(setDoc(ref(clients[0]),{...s,picks:[ids[0]]}));
 for(let i=1;i<5;i++) {
   const next={...s,uids:[...s.uids,`u${i}`],names:[...s.names,`Team ${i}`],nameKeys:[...s.nameKeys,`team ${i}`]};
   await assertFails(setDoc(ref(clients[0]),next));
   await assertFails(setDoc(ref(clients[i]),{...next,nameKeys:[...s.nameKeys,'team 0'],names:[...s.names,'Team 0']}));
   await assertSucceeds(setDoc(ref(clients[i]),next));s=next;
 }
 await assertFails(setDoc(ref(clients[5]),{...s,uids:[...s.uids,'u5'],names:[...s.names,'Team 5'],nameKeys:[...s.nameKeys,'team 5']}));
 await assertFails(setDoc(ref(clients[0]),{...s,picks:['aaliyah-puglia']}));
 await assertFails(setDoc(ref(clients[0]),{...s,picks:[ids[0]],names:['Changed',...s.names.slice(1)]}));
 // Two devices submit for the same first turn: precisely one transaction can win.
 const results=await Promise.allSettled([0,1].map(n=>runTransaction(clients[0],async t=>{
   const r=ref(clients[0]); const snap=await t.get(r); const before=snap.data();
   if(before.picks.length!==0) throw new Error('stale');
   t.set(r,{...before,picks:[ids[n]]});
 })));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 s=(await getDoc(ref(publicDb))).data();
 const remaining=ids.filter(id=>!s.picks.includes(id));
 for(let n=1;n<20;n++) {
   const next={...s,picks:[...s.picks,remaining[n-1]]};
   await assertFails(setDoc(ref(clients[(order[n]+1)%5]),next));
   await assertFails(setDoc(ref(clients[order[n]]),{...s,picks:[...s.picks,s.picks[0]]}));
   await assertSucceeds(setDoc(ref(clients[order[n]]),next));s=next;
 }
 await assertFails(setDoc(ref(clients[0]),{...s,picks:s.picks.slice(0,-1)}));
 await assertFails(deleteDoc(ref(clients[0])));
 await assertFails(setDoc(doc(clients[0],'survivorDrafts','unapproved-room'),s));
 console.log('PASS: guest access, unique names, five teams, snake order, duplicate/invalid picks, simultaneous picks, immutable history and completion.');
} finally {await env.cleanup();}
