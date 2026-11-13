import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import cast from '../lib/survivor/cast.json' with { type: 'json' };
import { parseSurvivorResults } from './survivorResultsParser.ts';
import { contestantPoints, emptyResults, validateResults } from '../lib/survivor/scoring.ts';
import { teamPotential } from '../lib/survivor/potential.ts';
const sharedFinishSource = readFileSync(new URL('./fixtures/survivor-51-shared-finish.html', import.meta.url), 'utf8');
const aliases: Record<string,string> = { 'an-thien-an-nguyen':'Thien An Nguyen', 'danny-kilby-kilby':'Danny Kilby', 'angelica-jelly-loblack':'Angelica "Jelly" Loblack' };
function row(name:string, finish='') { return `<tr><th scope="row"><span class="fn">${name}</span></th><td>30</td><td>Town</td><td>Tribe</td><td></td><td>${finish}</td><td>Day</td></tr>`; }
function source(overrides:Record<string,string>={}) {
  return `<table><caption>List of <i>Survivor 51</i> contestants</caption><tbody>${row('Aaliyah Puglia','1st voted out')}${cast.map(c=>row(aliases[c.id]??c.name,overrides[c.id]??'')).join('')}</tbody></table>`;
}
function orderedSource(departures: Array<[string,string]>) {
  const ids = new Set(departures.map(([id]) => id));
  const byId = new Map(cast.map(c => [c.id, c.name]));
  return `<table><caption>List of <i>Survivor 51</i> contestants</caption><tbody>${row('Aaliyah Puglia','1st voted out')}${departures.map(([id,finish]) => row(byId.get(id)!,finish)).join('')}${cast.filter(c => !ids.has(c.id)).map(c => row(aliases[c.id]??c.name)).join('')}</tbody></table>`;
}
test('parses numbered vote-outs and jurors, rejects gaps and unfamiliar source layout',()=>{
  const now=new Date().toISOString();
  const parsed=parseSurvivorResults(source({'alexis-levine':'2nd voted out','ana-sani':'3rd voted out / 1st jury member'}),now);
  assert.deepEqual(parsed.bootOrder,['alexis-levine','ana-sani']);
  assert.deepEqual(parsed.jurors,['ana-sani']);
  assert.throws(()=>parseSurvivorResults(source({'ana-sani':'3rd voted out'}),now));
  assert.throws(()=>parseSurvivorResults('<html></html>',now));
});
test('a quit counts in actual departure order, without requiring a vote-out ordinal',()=>{
  const now=new Date().toISOString();
  const ana=parseSurvivorResults(orderedSource([['ana-sani','2nd voted out']]),now);
  const afterRob=parseSurvivorResults(orderedSource([['ana-sani','2nd voted out'],['rob-antonson','Quit']]),now);
  const afterPatt=parseSurvivorResults(orderedSource([['ana-sani','2nd voted out'],['rob-antonson','Quit'],['patt-cannaday','3rd voted out']]),now);
  validateResults(afterRob,ana);
  validateResults(afterPatt,afterRob);
  assert.deepEqual(afterPatt.bootOrder,['ana-sani','rob-antonson','patt-cannaday']);
  assert.deepEqual(['ana-sani','rob-antonson','patt-cannaday'].map(id=>contestantPoints(id,afterPatt)),[1,2,3]);
  assert.throws(()=>validateResults(ana,afterPatt));
  assert.throws(()=>parseSurvivorResults(orderedSource([['ana-sani','2nd voted out'],['rob-antonson','Quit'],['patt-cannaday','4th voted out']]),now));
});
test('medical and voluntary departures count, but a future vote-out cannot reorder existing scores',()=>{
  const now=new Date().toISOString();
  const medical=parseSurvivorResults(orderedSource([['ana-sani','2nd voted out'],['rob-antonson','Medically evacuated'],['patt-cannaday','3rd voted out']]),now);
  assert.equal(contestantPoints('rob-antonson',medical),2);
  assert.throws(()=>parseSurvivorResults(orderedSource([['rob-antonson','Quit'],['ana-sani','3rd voted out']]),now));
});
test('refreshes the saved vote-only scores with Rob and subsequent departures', () => {
  const previous = {
    ...emptyResults(),
    bootOrder: ['ana-sani', 'patt-cannaday'],
    checkedAt: '2026-10-09T03:58:12.000Z',
  };
  const parsed = parseSurvivorResults(orderedSource([
    ['ana-sani', '2nd voted out'],
    ['rob-antonson', 'Quit'],
    ['patt-cannaday', '3rd voted out'],
    ['jenna-doore', '4th voted out'],
    ['alexis-levine', '5th voted out'],
    ['linnea-capobianco', '6th voted out'],
  ]), '2026-10-23T01:00:00.000Z');
  const updated = validateResults(parsed, previous);
  assert.deepEqual(updated.bootOrder.map(id => contestantPoints(id, updated)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(previous.bootOrder, ['ana-sani', 'patt-cannaday']);
  assert.deepEqual(validateResults(updated, updated), updated);
  assert.deepEqual(validateResults({ ...updated, bootOrder: [...updated.bootOrder, 'eric-macksoud'] }, updated).bootOrder.slice(-1), ['eric-macksoud']);
});

test('a shared double elimination refreshes both players, earned bonuses and team maximums', () => {
  const previous = {
    ...emptyResults(), checkedAt: '2026-11-07T04:33:26.794Z',
    bootOrder: ['ana-sani', 'rob-antonson', 'patt-cannaday', 'jenna-doore', 'alexis-levine', 'linnea-capobianco', 'ori-jean-charles', 'brady-booker'],
    jurors: ['brady-booker'],
  };
  const result = validateResults(parseSurvivorResults(sharedFinishSource, '2026-11-13T04:00:00.000Z'), previous);
  assert.deepEqual(result.bootOrder, [...previous.bootOrder, 'kristin-flickinger', 'danny-kilby-kilby']);
  assert.deepEqual(result.jurors, ['brady-booker', 'kristin-flickinger', 'danny-kilby-kilby']);
  assert.deepEqual(['brady-booker', 'kristin-flickinger', 'danny-kilby-kilby'].map(id => contestantPoints(id, result)), [13, 14, 15]);
  const han = teamPotential(['angelica-jelly-loblack', 'devin-way', 'ori-jean-charles', 'danny-kilby-kilby', 'brady-booker'], result);
  assert.equal(han.earnedPoints, 35);
  assert.deepEqual(han.remainingIds, ['angelica-jelly-loblack', 'devin-way']);
  assert.equal(han.winner?.total, 124);
  assert.deepEqual(validateResults(result, result), result);
  assert.throws(() => validateResults(previous, result), /already scored elimination/);
});

test('a subsequent vote-out follows the entire shared elimination group', () => {
  const html = sharedFinishSource.replace('<th scope="row">Cristian Chavez</th><td></td>', '<th scope="row">Cristian Chavez</th><td>11th voted out<br>3rd jury member</td>');
  const result = parseSurvivorResults(html, new Date().toISOString());
  assert.deepEqual(result.bootOrder.slice(-3), ['kristin-flickinger', 'danny-kilby-kilby', 'cristian-chavez']);
  assert.equal(contestantPoints('cristian-chavez', result), 16);
});

test('shared results still reject missing, duplicate, reversed or ambiguous vote-out numbers', () => {
  for (const changed of [
    sharedFinishSource.replace('9th &amp; 10th voted out', '10th &amp; 11th voted out'),
    sharedFinishSource.replace('9th &amp; 10th voted out', '9th &amp; 11th voted out'),
    sharedFinishSource.replace('9th &amp; 10th voted out', '9th &amp; 9th voted out'),
    sharedFinishSource.replace('9th &amp; 10th voted out', '10th &amp; 9th voted out'),
    sharedFinishSource.replace('<td rowspan="2"><span>9th', '<td><span>9th'),
    sharedFinishSource.replace('<td rowspan="2"><span>9th', '<td rowspan="3"><span>9th'),
  ]) assert.throws(() => parseSurvivorResults(changed, new Date().toISOString()));
});

test('a changed jury label preserves the earned bonus without accepting its silent removal', () => {
  const now = new Date().toISOString();
  const original = parseSurvivorResults(orderedSource([['ana-sani', '2nd voted out / 1st jury member']]), now);
  const withdrawn = parseSurvivorResults(orderedSource([['ana-sani', '2nd voted out / Withdrew from jury']]), now);
  validateResults(withdrawn, original);
  assert.equal(contestantPoints('ana-sani', withdrawn), 6);
  const missing = parseSurvivorResults(orderedSource([['ana-sani', '2nd voted out']]), now);
  assert.throws(() => validateResults(missing, original), /already scored bonus/);
});
