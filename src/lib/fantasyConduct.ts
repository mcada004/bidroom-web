export const CONDUCT_CATEGORIES = ["domestic-violence", "dui", "assault"] as const;
export type ConductCategory = typeof CONDUCT_CATEGORIES[number];
export const CONDUCT_LABELS: Record<ConductCategory, string> = {
  "domestic-violence": "Domestic violence", dui: "DUI / impaired driving", assault: "Assault / battery",
};
export type ConductRecord = {
  categories: readonly ConductCategory[];
  year: number;
  outcome: string;
  cleared: boolean;
  summary: string;
  sources: readonly string[];
};
// Name keys deliberately avoid mutable board ranks. Entries are manually sourced,
// not inferred from fantasy risk notes, allegations alone, or league suspensions.
export const CONDUCT_RECORDS: Readonly<Record<string, readonly ConductRecord[]>> = {
  "Jordan Addison": [{ categories: ["dui"], year: 2024, outcome: "Reduced charge · no-contest plea", cleared: false,
    summary: "DUI case resolved in 2025 with a no-contest plea to alcohol-related reckless driving.",
    sources: ["https://www.nfl.com/news/vikings-jordan-addison-resolves-dui-case-by-pleading-no-contest-to-a-lesser-charge"] }],
  "Aaron Jones Sr.": [{ categories: ["dui"], year: 2017, outcome: "No-contest plea", cleared: false,
    summary: "Pleaded no contest in 2018 to driving with a controlled substance in his system.",
    sources: ["https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/aaron-jones-pleads-no-contest-to-marijuana-related-charge-stemming-from-october-arrest/"] }],
  "Chris Rodriguez Jr.": [{ categories: ["dui"], year: 2022, outcome: "Guilty plea", cleared: false,
    summary: "Pleaded guilty to DUI in July 2022 while at Kentucky.",
    sources: ["https://www.wtvq.com/warrant-issued-for-university-of-kentucky-player-chris-rodriguez/"] }],
  "Dak Prescott": [{ categories: ["dui"], year: 2016, outcome: "Acquitted", cleared: true,
    summary: "Found not guilty of the DUI charge in July 2016.",
    sources: ["https://www.espn.com/nfl/story/_/id/17160255/dak-prescott-dallas-cowboys-quarterback-acquitted-dui-college-town"] }],
  "Quinshon Judkins": [{ categories: ["domestic-violence", "assault"], year: 2025, outcome: "Prosecution declined", cleared: true,
    summary: "Arrested for battery/domestic violence; prosecutors declined to formally charge him.",
    sources: ["https://www.nfl.com/_amp/florida-prosecutors-decline-to-formally-charge-browns-rookie-rb-quinshon-judkins"] }],
  "Jerry Jeudy": [{ categories: ["domestic-violence"], year: 2022, outcome: "Dismissed", cleared: true,
    summary: "Criminal tampering charge with a domestic violence enhancer was dismissed; this was not an assault charge.",
    sources: ["https://www.nfl.com/_amp/charges-against-broncos-wr-jerry-jeudy-to-be-dismissed"] }],
  "Xavier Worthy": [{ categories: ["domestic-violence", "assault"], year: 2025, outcome: "Dismissed / declined", cleared: true,
    summary: "Arrested on a family/household assault charge; prosecutors declined the case and he was released.",
    sources: ["https://apnews.com/article/4d3b3bb4c3608a5be74f2dda420f0044"] }],
  "Davante Adams": [{ categories: ["assault"], year: 2022, outcome: "Dismissed", cleared: true,
    summary: "Misdemeanor assault charge from the photographer incident was dismissed in June 2023.",
    sources: ["https://www.espn.com/nfl/story/_/id/37908188/assault-charge-raiders-wr-davante-adams-dropped"] }],
  "Stefon Diggs": [{ categories: ["assault"], year: 2025, outcome: "Acquitted", cleared: true,
    summary: "Found not guilty of strangulation and assault charges in May 2026.",
    sources: ["https://www.nfl.com/_amp/former-patriots-wr-stefon-diggs-found-not-guilty-of-assaulting-his-private-chef"] }],
  "Alvin Kamara": [{ categories: ["assault"], year: 2022, outcome: "Reduced charge · no-contest plea", cleared: false,
    summary: "Las Vegas battery case resolved in 2023 with a no-contest plea to misdemeanor breach of peace.",
    sources: ["https://www.nfl.com/news/alvin-kamara-says-he-embarrassed-saints-nfl-in-las-vegas-incident"] }],
  "Jeffery Simmons": [{ categories: ["assault"], year: 2016, outcome: "No-contest plea", cleared: false,
    summary: "Pleaded no contest to simple assault in July 2016.",
    sources: ["https://www.si.com/college/2016/07/26/mississippi-state-bulldogs-jeffrey-simmons-assault-case-no-contest"] }],
  "Rashee Rice": [{ categories: ["assault"], year: 2024, outcome: "Resolved · guilty pleas to crash offenses", cleared: false,
    summary: "Initially charged with aggravated assault after a crash. Pleaded guilty in 2025 to collision involving serious injury and racing causing injury.",
    sources: ["https://www.nfl.com/news/kansas-city-chiefs-rashee-rice-surrenders-to-police-on-assault-charge-after-high-speed-crash", "https://apnews.com/article/454eb8f9ee467628ee8258fe8ae5cc0c"] }],
};
export function getConductRecords(name: string): readonly ConductRecord[] {
  return Object.hasOwn(CONDUCT_RECORDS, name) ? CONDUCT_RECORDS[name] : [];
}
export function isConductExcluded(name: string, categories: readonly ConductCategory[], includeCleared: boolean): boolean {
  return getConductRecords(name).some(record => (!record.cleared || includeCleared) && record.categories.some(category => categories.includes(category)));
}
