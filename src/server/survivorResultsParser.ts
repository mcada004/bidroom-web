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

const finishPattern = /voted out|eliminated|jury member|juror|sole survivor|runner.up|finalist|winner|quit|medically evacuated|withdrew|withdrawn|removed from the game/i;
type ResultCell = { text: string; rowSpan: number; offset: number };

// A shared placement/day/tribe cell occurs only in its first HTML row. Carry
// its text to the following rows, as a browser does when displaying rowspan.
function* resultRows(rows: string[]) {
  let inherited: ResultCell[] = [];
  for (const row of rows) {
    const own = [...row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].map(([, attributes, html]) => {
      const span = attributes.match(/\browspan\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const rowSpan = span ? Number(span[1] ?? span[2] ?? span[3]) : 1;
      if (!Number.isInteger(rowSpan) || rowSpan < 1 || rowSpan > cast.length + 1) throw new Error('Invalid season table row span.');
      return { text: plain(html), rowSpan, offset: 0 };
    });
    const cells = [...inherited, ...own];
    inherited = cells.filter(cell => cell.offset + 1 < cell.rowSpan).map(cell => ({ ...cell, offset: cell.offset + 1 }));
    yield { row, cells };
  }
  if (inherited.some(cell => finishPattern.test(cell.text))) throw new Error('Shared season results are incomplete.');
}

// The contestant table is ordered by departure, but vote-out ordinals exclude
// quits and medical departures. Keep both checks: table order determines fantasy
// points (including shared finishes), while vote ordinals catch malformed data.
export function parseSurvivorResults(html: string, checkedAt: string): SeasonResults {
  const table = [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)]
    .map(m => m[0]).find(t => /<caption\b[^>]*>[^]*?List of[^]*?Survivor 51[^]*?contestants[^]*?<\/caption>/i.test(t));
  if (!table) throw new Error('Season contestant table is unavailable.');
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
  const departures: string[] = [];
  const jurors: string[] = [];
  const finalists = new Map<number, string>();
  let winner: string | null = null;
  const recognized = new Set<string>();
  let nextVoteOut = 2; // Aaliyah, the first vote-out, was not in the draft.
  for (const { row, cells } of resultRows(rows)) {
    const name = plain(row.match(/<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/i)?.[1] ?? '');
    const id = castId(name);
    const key = id ?? (name === 'Aaliyah Puglia' ? 'aaliyah-puglia' : null);
    if (!key) {
      if (cells.some(cell => cell.offset > 0 && finishPattern.test(cell.text))) throw new Error('Shared result includes an unrecognized castaway.');
      continue;
    }
    if (recognized.has(key)) throw new Error('Season source repeated a castaway.');
    recognized.add(key);
    if (!id) continue;
    const finishCells = cells.filter(cell => finishPattern.test(cell.text));
    const finish = finishCells.map(cell => cell.text).join(' ');
    if (!finish) continue;
    // Joining the jury earns the bonus, even if a juror later withdraws.
    const earnedJury = /jury member|juror|(?:withdrew|withdrawn) from (?:the )?jury/i.test(finish);
    const voteCells = finishCells.filter(cell => /\b(?:voted out|eliminated)\b/i.test(cell.text));
    if (voteCells.length) {
      if (voteCells.length !== 1) throw new Error(`Conflicting vote-out results for ${name}.`);
      const cell = voteCells[0];
      const voteOut = cell.text.match(/\b(\d{1,2}(?:st|nd|rd|th)(?:\s*(?:&|and|,)\s*\d{1,2}(?:st|nd|rd|th))*)\s+(?:voted out|eliminated)\b/i);
      const ordinals = voteOut?.[1].match(/\d+/g)?.map(Number) ?? [];
      if (ordinals.length !== cell.rowSpan || ordinals.some((n, i) => n !== ordinals[0] + i)) throw new Error(`Shared vote-out results are incomplete or out of order for ${name}. Scores were not changed.`);
      const ordinal = ordinals[cell.offset];
      if (ordinal !== nextVoteOut) throw new Error(`Unexpected vote-out sequence for ${name}: expected ${nextVoteOut}, found ${ordinal}. Scores were not changed.`);
      nextVoteOut++;
      departures.push(id);
      if (earnedJury) jurors.push(id);
    } else if (/\b(?:quit|medically evacuated|withdrew|withdrawn|removed from the game)\b/i.test(finish)) {
      departures.push(id);
      if (earnedJury) jurors.push(id);
    } else if (/sole survivor|winner/i.test(finish)) { finalists.set(20, id); winner = id; }
    else if (/(?:2nd|second)\s+runner.up/i.test(finish)) { finalists.set(18, id); }
    else if (/runner.up/i.test(finish)) { finalists.set(19, id); }
    else if (/finalist/i.test(finish)) { finalists.set(18, id); }
    else throw new Error(`Unrecognized finish for ${name}.`);
  }
  if (recognized.size !== 21) throw new Error('Season source did not list all 21 castaways.');
  if (departures.length > 17 || new Set(departures).size !== departures.length) throw new Error('Unexpected departure sequence.');
  const finalOrder = finalists.size === 0 ? [] : [18, 19, 20].map(n => finalists.get(n) ?? '');
  if (finalOrder.includes('')) throw new Error('Final placements are incomplete.');
  return validateResults({ bootOrder: departures, jurors, finalists: finalOrder, winner, checkedAt, sourceUrl: SCORE_SOURCE });
}
