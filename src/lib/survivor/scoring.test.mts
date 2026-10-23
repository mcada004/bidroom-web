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

test('the legacy correction cannot reorder, drop, or insert other scored departures', () => {
  const previous = { ...emptyResults(), checkedAt: '2026-10-09T03:58:12.000Z', bootOrder: ['ana-sani', 'patt-cannaday'] };
  const corrected = { ...previous, bootOrder: ['ana-sani', 'rob-antonson', 'patt-cannaday'] };
  for (const bootOrder of [
    ['rob-antonson', 'ana-sani', 'patt-cannaday'],
    ['ana-sani', 'alexis-levine', 'patt-cannaday'],
    ['ana-sani', 'rob-antonson'],
    ['patt-cannaday', 'rob-antonson', 'ana-sani'],
  ]) assert.throws(() => validateResults({ ...previous, bootOrder }, previous), /already scored elimination/);
  assert.throws(() => validateResults(previous, corrected), /already scored elimination/);
  assert.throws(() => validateResults({ ...corrected, bootOrder: ['ana-sani', 'rob-antonson', 'jenna-doore', 'patt-cannaday'] }, corrected), /already scored elimination/);
  assert.throws(() => validateResults(corrected, { ...previous, bootOrder: [...previous.bootOrder, 'jenna-doore'] }), /already scored elimination/);
  assert.throws(() => validateResults(corrected, { ...previous, jurors: ['patt-cannaday'] }), /already scored bonus/);
  assert.throws(() => validateResults({ ...corrected, bootOrder: [...corrected.bootOrder, 'rob-antonson'] }, previous), /repeated castaway/);
});
