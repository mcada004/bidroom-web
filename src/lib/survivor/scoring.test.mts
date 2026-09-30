import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contestantPoints, emptyResults, validateResults } from './scoring.ts';

test('elimination order and cumulative bonuses', () => {
  const results = validateResults({ ...emptyResults(), checkedAt: new Date().toISOString(), bootOrder: ['alexis-levine','ana-sani'], jurors:['ana-sani'] });
  assert.equal(contestantPoints('alexis-levine',results),1);
  assert.equal(contestantPoints('ana-sani',results),7);
  const final = validateResults({ ...results, finalists:['brady-booker','carter-krull','cristian-chavez'], winner:'cristian-chavez' },results);
  assert.equal(contestantPoints('brady-booker',final),33);
  assert.equal(contestantPoints('carter-krull',final),34);
  assert.equal(contestantPoints('cristian-chavez',final),55);
  assert.throws(() => validateResults({ ...results, bootOrder:['ana-sani','alexis-levine'] },results));
});
