import test from "node:test";
import assert from "node:assert/strict";
import { CONDUCT_RECORDS, getConductRecords, isConductExcluded } from "./fantasyConduct.ts";

test("filter is opt-in and missing data never implies misconduct", () => {
  assert.equal(isConductExcluded("Jordan Addison", [], true), false);
  assert.equal(isConductExcluded("Unlisted player", ["dui", "assault", "domestic-violence"], true), false);
  assert.deepEqual(getConductRecords("toString"), []);
});
test("categories combine as OR and preserve outcome distinctions", () => {
  assert.equal(isConductExcluded("Jordan Addison", ["assault"], true), false);
  assert.equal(isConductExcluded("Jordan Addison", ["dui", "assault"], false), true);
  assert.equal(isConductExcluded("Alvin Kamara", ["assault"], false), true);
  assert.equal(isConductExcluded("Jerry Jeudy", ["assault"], true), false);
});
test("dismissals, declined cases, and acquittals require explicit inclusion", () => {
  for (const name of ["Dak Prescott", "Stefon Diggs", "Jerry Jeudy", "Quinshon Judkins", "Xavier Worthy", "Davante Adams"]) {
    assert.equal(isConductExcluded(name, ["dui", "assault", "domestic-violence"], false), false, name);
    assert.equal(isConductExcluded(name, ["dui", "assault", "domestic-violence"], true), true, name);
  }
});
test("filtering preserves player IDs and original board without removing drafted picks", () => {
  const players = [[91, "Jordan Addison", "WR"], [107, "Stefon Diggs", "WR"], [1, "Jahmyr Gibbs", "RB"]] as const;
  const visible = players.filter(player => player[2] === "WR" && !isConductExcluded(player[1], ["dui"], false));
  assert.deepEqual(visible.map(player => player[0]), [107]);
  assert.equal(players.length, 3);
});
test("every curated incident has a category, outcome and HTTPS evidence", () => {
  for (const records of Object.values(CONDUCT_RECORDS)) for (const record of records) {
    assert.ok(record.categories.length && record.outcome && record.summary);
    assert.ok(record.sources.length);
    for (const source of record.sources) assert.equal(new URL(source).protocol, "https:");
  }
});
