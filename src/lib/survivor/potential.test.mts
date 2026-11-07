import { test } from 'node:test';
import assert from 'node:assert/strict';
import cast from './cast.json' with { type: 'json' };
import { contestantPoints, emptyResults } from './scoring.ts';
import { teamPotential } from './potential.ts';

const allIds = cast.map(c => c.id);

test('one to five remaining players take distinct top places, with one winner', () => {
  const winnerTotals = [55, 89, 122, 144, 165];
  const finalistTotals = [34, 67, 89, 110, 130];
  const juryTotals = [22, 43, 63, 82, 100];
  for (let count = 1; count <= 5; count++) {
    const potential = teamPotential(allIds.slice(0, count), emptyResults());
    assert.equal(potential.winner?.total, winnerTotals[count - 1]);
    assert.equal(potential.finalTribal?.total, finalistTotals[count - 1]);
    assert.equal(potential.juryOnly?.total, juryTotals[count - 1]);
    assert.deepEqual(potential.winner?.finishes.map(f => f.place), Array.from({ length: count }, (_, i) => i + 1));
    assert.equal(potential.winner?.finishes.filter(f => f.place === 1).length, 1);
  }
});

test('adds actual earned points once, preserving quits and jury bonuses', () => {
  const results = { ...emptyResults(), bootOrder: ['ana-sani', 'rob-antonson', 'patt-cannaday'], jurors: ['patt-cannaday'] };
  const picks = ['ana-sani', 'rob-antonson', 'patt-cannaday', 'alexis-levine', 'jenna-doore'];
  const before = structuredClone(results);
  const potential = teamPotential(picks, results);
  assert.equal(potential.earnedPoints, 11); // 1 + 2 + (3 + 5)
  assert.deepEqual(potential.remainingIds, ['alexis-levine', 'jenna-doore']);
  assert.equal(potential.juryOnly?.total, 54);
  assert.equal(potential.finalTribal?.total, 78);
  assert.equal(potential.winner?.total, 100); // 11 + 55 + 34, not 11 + 2 × 55
  assert.deepEqual(results, before);
  assert.deepEqual(picks, ['ana-sani', 'rob-antonson', 'patt-cannaday', 'alexis-levine', 'jenna-doore']);
});

test('an exit replaces a projected finish with actual points on the next refresh', () => {
  const picks = ['alexis-levine', 'jenna-doore'];
  assert.equal(teamPotential(picks, emptyResults()).winner?.total, 89);
  const afterExit = teamPotential(picks, { ...emptyResults(), bootOrder: ['jenna-doore'] });
  assert.equal(afterExit.earnedPoints, 1);
  assert.deepEqual(afterExit.remainingIds, ['alexis-levine']);
  assert.equal(afterExit.winner?.total, 56);
});

test('impossible scenarios never reuse departed players finishing places', () => {
  const finalThree = allIds.slice(17);
  const results = { ...emptyResults(), bootOrder: allIds.slice(0, 17) };
  const sweep = teamPotential(finalThree, results);
  assert.equal(sweep.juryOnly, null);
  assert.equal(sweep.finalTribal, null); // three players cannot fill just second and third
  assert.equal(sweep.winner?.total, 122);
  const two = teamPotential(finalThree.slice(0, 2), results);
  assert.equal(two.juryOnly, null);
  assert.equal(two.finalTribal?.total, 67);
});

test('projected first through fourth points match the existing actual scorer', () => {
  const results = {
    ...emptyResults(), bootOrder: allIds.slice(0, 17), jurors: [allIds[16]],
    finalists: allIds.slice(17), winner: allIds[19],
  };
  const projected = teamPotential(allIds.slice(0, 4), emptyResults()).winner!;
  const finishOrder = [allIds[19], allIds[18], allIds[17], allIds[16]];
  assert.deepEqual(projected.finishes.map(f => f.points), finishOrder.map(id => contestantPoints(id, results)));
});

test('completed teams and the completed season retain only their actual scores', () => {
  const results = { ...emptyResults(), bootOrder: allIds.slice(0, 17), finalists: allIds.slice(17), winner: allIds[19] };
  for (const picks of [[], [allIds[0]], allIds.slice(17), allIds]) {
    const potential = teamPotential(picks, results);
    assert.deepEqual(potential.remainingIds, []);
    const actual = picks.reduce((sum, id) => sum + contestantPoints(id, results), 0);
    for (const scenario of [potential.juryOnly, potential.finalTribal, potential.winner]) {
      assert.deepEqual(scenario, { total: actual, additionalPoints: 0, finishes: [] });
    }
  }
});
