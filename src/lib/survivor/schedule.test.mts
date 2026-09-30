import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSaturdayNinePacific } from './schedule.ts';
test('Saturday 9 p.m. Pacific switches UTC hour at daylight saving',()=>{
  assert.equal(isSaturdayNinePacific(new Date('2026-10-04T04:00:00Z')),true);
  assert.equal(isSaturdayNinePacific(new Date('2026-11-08T05:00:00Z')),true);
  assert.equal(isSaturdayNinePacific(new Date('2026-11-08T04:00:00Z')),false);
  assert.equal(isSaturdayNinePacific(new Date('2026-10-04T05:00:00Z')),false);
});
