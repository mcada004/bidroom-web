"use client";

export function matchesPlayerName(name: string, query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const normalizedName = normalize(name);
  return normalize(query).trim().split(/\s+/).every(part => normalizedName.includes(part));
}

export default function FantasyPlayerSearch({ query, onQueryChange, resultCount }: {
  query: string; onQueryChange: (query: string) => void; resultCount: number;
}) {
  return <div className="draft-player-search">
    <label>
      <span>Search players</span>
      <input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="First or last name…" autoComplete="off" spellCheck={false} />
    </label>
    {query ? <button type="button" onClick={() => onQueryChange("")}>Clear search</button> : null}
    <span className="draft-search-count" role="status" aria-live="polite">{resultCount} {resultCount === 1 ? "player" : "players"} shown</span>
  </div>;
}
