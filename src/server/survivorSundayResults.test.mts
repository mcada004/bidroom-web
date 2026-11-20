import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchSundayEdition } from './survivorSundayResults.ts';
import { advanceResults } from '../lib/survivor/scoring.ts';
import { lastSundayRelease } from '../lib/survivor/schedule.ts';
const source = readFileSync(new URL('./fixtures/survivor-51-shared-finish.html', import.meta.url),'utf8');
const cutoff = lastSundayRelease(new Date('2026-11-19T20:00:00Z')).toISOString();
test('even a cold weekday lookup loads only a revision pinned to the last release; manual scores can take precedence', async () => {
  const requests:URL[] = [];
  const result = await fetchSundayEdition(cutoff, async input => {
    const url = new URL(String(input)); requests.push(url);
    if (url.pathname === '/w/api.php') return Response.json({query:{pages:[{title:'Survivor 51',revisions:[{revid:123,timestamp:'2026-11-14T18:00:00Z'}]}]}});
    assert.equal(url.searchParams.get('oldid'),'123'); return new Response(source);
  });
  assert.equal(requests.length,2);
  assert.equal(requests[0].searchParams.get('rvstart'),'2026-11-15T17:00:00.000Z');
  assert.equal(result.bootOrder.length,10);
  const manual = {...result, checkedAt:'2026-11-19T18:00:00Z', bootOrder:[...result.bootOrder,'lewis-kelly'], jurors:[...result.jurors,'lewis-kelly']};
  assert.deepEqual(advanceResults(result,manual),manual);
  assert.deepEqual(advanceResults(manual,result),manual);
});
test('a future revision or lookup failure never falls through to the current episode', async () => {
  for (const response of [Response.json({query:{pages:[{title:'Survivor 51',revisions:[{revid:321,timestamp:'2026-11-19T00:00:00Z'}]}]}}),new Response(null,{status:503})]) {
    let calls=0;
    await assert.rejects(fetchSundayEdition(cutoff,async () => {calls++;return response;}));
    assert.equal(calls,1);
  }
});
