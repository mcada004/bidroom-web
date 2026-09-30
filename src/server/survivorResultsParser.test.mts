import { test } from 'node:test';
import assert from 'node:assert/strict';
import cast from '../lib/survivor/cast.json' with { type: 'json' };
import { parseSurvivorResults } from './survivorResultsParser.ts';
const aliases: Record<string,string> = { 'an-thien-an-nguyen':'Thien An Nguyen', 'danny-kilby-kilby':'Danny Kilby', 'angelica-jelly-loblack':'Angelica "Jelly" Loblack' };
function row(name:string, finish='') { return `<tr><th scope="row"><span class="fn">${name}</span></th><td>30</td><td>Town</td><td>Tribe</td><td></td><td>${finish}</td><td>Day</td></tr>`; }
function source(overrides:Record<string,string>={}) {
  return `<table><caption>List of <i>Survivor 51</i> contestants</caption><tbody>${row('Aaliyah Puglia','1st voted out')}${cast.map(c=>row(aliases[c.id]??c.name,overrides[c.id]??'')).join('')}</tbody></table>`;
}
test('parses numbered boots and jurors, rejects gaps and unfamiliar source layout',()=>{
  const now=new Date().toISOString();
  const parsed=parseSurvivorResults(source({'alexis-levine':'2nd voted out','ana-sani':'3rd voted out / 1st jury member'}),now);
  assert.deepEqual(parsed.bootOrder,['alexis-levine','ana-sani']);
  assert.deepEqual(parsed.jurors,['ana-sani']);
  assert.throws(()=>parseSurvivorResults(source({'ana-sani':'3rd voted out'}),now));
  assert.throws(()=>parseSurvivorResults('<html></html>',now));
});
