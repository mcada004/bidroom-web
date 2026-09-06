"use client";

import { CONDUCT_CATEGORIES, CONDUCT_LABELS, getConductRecords, type ConductCategory } from "@/src/lib/fantasyConduct";

const NEWS_PUBLISHERS: Record<string, string> = {
  "www.nfl.com": "NFL.com", "apnews.com": "Associated Press", "www.espn.com": "ESPN",
  "www.nbcsports.com": "NBC Sports", "www.wtvq.com": "WTVQ / ABC 36", "www.si.com": "Sports Illustrated",
};

function newsPublisher(source: string) {
  const hostname = new URL(source).hostname;
  return NEWS_PUBLISHERS[hostname] ?? hostname;
}

export function FantasyConductFilter({ categories, includeCleared, onCategories, onIncludeCleared, hiddenCount }: {
  categories: ConductCategory[]; includeCleared: boolean;
  onCategories: (categories: ConductCategory[]) => void;
  onIncludeCleared: (include: boolean) => void; hiddenCount: number;
}) {
  return <details className="draft-conduct-filter">
    <summary>Bad behavior filter <span>{categories.length ? `${hiddenCount} hidden` : "Off"}</span></summary>
    <fieldset>
      <legend>Hide players with reported records in these categories</legend>
      <div className="draft-conduct-options">
        {CONDUCT_CATEGORIES.map(category => <label key={category}>
          <input type="checkbox" checked={categories.includes(category)} onChange={event => onCategories(event.target.checked ? [...categories, category] : categories.filter(item => item !== category))} />
          {CONDUCT_LABELS[category]}
        </label>)}
      </div>
      <label className="draft-conduct-history"><input type="checkbox" checked={includeCleared} onChange={event => onIncludeCleared(event.target.checked)} /> Include dismissed/declined cases and acquittals</label>
      <p>For informational purposes only. Based on linked news articles; see each player’s notes for the news source and reported outcome.</p>
      <p>Charges are not convictions. Reduced-charge pleas are included. Dismissed/declined cases and acquittals are excluded only if you select the option above.</p>
      <p>Manually curated public reports, reviewed September 6, 2026; coverage is incomplete. No listed record does not mean a clean record. Open a player’s notes for sources and outcomes.</p>
      <div className="draft-conduct-footer"><span role="status">{hiddenCount} hidden by this filter at the current position</span><button type="button" onClick={() => { onCategories([]); onIncludeCleared(false); }}>Clear behavior filter</button></div>
    </fieldset>
  </details>;
}

export function FantasyConductNotes({ name }: { name: string }) {
  const records = getConductRecords(name);
  return <section className="draft-conduct-notes" aria-label="Reported conduct records">
    <h3>Reported conduct records</h3>
    <p>For informational purposes only. Summaries reflect the linked news reports, not an independent background check or finding of guilt. Charges are not convictions; reports may be incomplete or later updated.</p>
    {records.length ? records.map((record, index) => <article key={index}>
      <strong>{record.categories.map(category => CONDUCT_LABELS[category]).join(" · ")} · {record.year}</strong>
      <p className="draft-conduct-outcome">{record.outcome}</p>
      <p>{record.summary}</p>
      {record.sources.map((source) => <a key={source} href={source} target="_blank" rel="noreferrer">News source: {newsPublisher(source)} ↗</a>)}
    </article>) : <p>No sourced record is listed in this curated dataset; this is not a background check.</p>}
  </section>;
}
