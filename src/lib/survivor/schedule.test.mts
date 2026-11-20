import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSundayReleaseHour, lastSundayRelease, nextSundayRelease } from './schedule.ts';
import { readFileSync } from 'node:fs';

test('weekday opens, Saturday night, and Sunday before 9 PT all see the preceding edition', () => {
  for (const iso of ['2026-11-19T05:30:00Z', '2026-11-22T04:00:00Z','2026-11-22T05:00:00Z', '2026-11-22T16:59:59Z']) {
    assert.equal(lastSundayRelease(new Date(iso)).toISOString(),'2026-11-15T17:00:00.000Z');
    assert.equal(isSundayReleaseHour(new Date(iso)), false);
  }
  assert.equal(lastSundayRelease(new Date('2026-11-22T17:00:00Z')).toISOString(),'2026-11-22T17:00:00.000Z');
});
test('exactly one configured cron slot releases at 9 Pacific, including DST change Sundays', () => {
  const { crons } = JSON.parse(readFileSync(new URL('../../../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(crons.filter((c:{path:string}) => c.path.includes('/survivor/')).map((c:{schedule:string})=>c.schedule).sort(), ['0 16 * * 0','0 17 * * 0']);
  for (const [date,hour] of [['2026-03-08','16'],['2026-11-01','17'],['2026-11-22','17']]) {
    for (const utc of ['16','17']) assert.equal(isSundayReleaseHour(new Date(date+'T'+utc+':59:59Z')),utc===hour);
  }
  assert.equal(lastSundayRelease(new Date('2026-11-01T16:59:59Z')).toISOString(),'2026-10-25T16:00:00.000Z');
  assert.equal(nextSundayRelease(new Date('2026-10-25T16:00:00Z')).toISOString(),'2026-11-01T17:00:00.000Z');
  assert.equal(nextSundayRelease(new Date('2026-03-01T17:00:00Z')).toISOString(),'2026-03-08T16:00:00.000Z');
  assert.equal(lastSundayRelease(new Date('2026-03-08T15:59:59Z')).toISOString(),'2026-03-01T17:00:00.000Z');
});
