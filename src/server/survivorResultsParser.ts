import cast from '../lib/survivor/cast.json' with { type: 'json' };
import { SCORE_SOURCE, validateResults, type SeasonResults } from '../lib/survivor/scoring.ts';

function plain(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/g, ' ').replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function normalize(name: string) { return name.toLowerCase().replace(/[^a-z]/g, ''); }
const aliases: Record<string, string> = {
  thienannguyen: 'an-thien-an-nguyen',
  dannykilby: 'danny-kilby-kilby',
  angelicajellyloblack: 'angelica-jelly-loblack',
};
function castId(name: string): string | null {
  const key = normalize(name);
  return aliases[key] ?? cast.find(c => normalize(c.name) === key)?.id ?? null;
}

// The contestant table is ordered by departure, but vote-out ordinals exclude
// quits and medical departures. Keep both checks: table order determines fantasy
// points, while vote ordinals catch edits or a malformed source table.
export function parseSurvivorResults(html: string, checkedAt: string): SeasonResults {
  const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map(m => m[0]).find(t => /<caption\b[^>]*>[^]*?List of[^]*?Survivor 51[^]*?contestants[^]*?<\/caption>/i.test(t));
  if (!table) throw new Error('Season contestant table is unavailable.');
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
  const departures: string[] = [];
  const jurors: string[] = [];
  const finalists = new Map<number, string>();
  let winner: string | null = null;
  let recognized = 0;
  let nextVoteOut = 2; // Aaliyah, the first vote-out, was not in the draft.
  for (const row of rows) {
    const name = plain(row.match(/<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/i)?.[1] ?? '');
    const id = castId(name);
    if (name === 'Aaliyah Puglia') { recognized++; continue; }
    if (!id) continue;
    recognized++;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plain(m[1]));
    const finish = cells.filter(c => /voted out|eliminated|jury member|sole survivor|runner.up|finalist|winner|quit|medically evacuated|withdrew|withdrawn|removed from the game/i.test(c)).join(' ');
    if (!finish) continue;
    const voteOut = finish.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+(?:voted out|eliminated)\b/i);
    if (voteOut) {
      if (Number(voteOut[1]) !== nextVoteOut++) throw new Error('Unexpected vote-out sequence.');
      departures.push(id);
      if (/jury member|juror/i.test(finish)) jurors.push(id);
    } else if (/\b(?:quit|medically evacuated|withdrew|withdrawn|removed from the game)\b/i.test(finish)) {
      departures.push(id);
      if (/jury member|juror/i.test(finish)) jurors.push(id);
    } else if (/sole survivor|winner/i.test(finish)) { finalists.set(20, id); winner = id; }
    else if (/(?:2nd|second)\s+runner.up/i.test(finish)) { finalists.set(18, id); }
    else if (/runner.up/i.test(finish)) { finalists.set(19, id); }
    else if (/finalist/i.test(finish)) { finalists.set(18, id); }
    else throw new Error(`Unrecognized finish for ${name}.`);
  }
  if (recognized !== 21) throw new Error('Season source did not list all 21 castaways.');
  if (departures.length > 17 || new Set(departures).size !== departures.length) throw new Error('Unexpected departure sequence.');
  const finalOrder = finalists.size === 0 ? [] : [18, 19, 20].map(n => finalists.get(n) ?? '');
  if (finalOrder.includes('')) throw new Error('Final placements are incomplete.');
  return validateResults({ bootOrder: departures, jurors, finalists: finalOrder, winner, checkedAt, sourceUrl: SCORE_SOURCE });
}
