import { test } from 'node:test';
import assert from 'node:assert/strict';
import cast from '../lib/survivor/cast.json' with { type: 'json' };
import { parseSurvivorResults } from './survivorResultsParser.ts';
import { contestantPoints, emptyResults, validateResults } from '../lib/survivor/scoring.ts';
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
