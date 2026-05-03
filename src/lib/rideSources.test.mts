import test from "node:test";
import assert from "node:assert/strict";
import { getRideSourceRegistry } from "./rideSources.ts";

test("getRideSourceRegistry merges duplicate seeded and extra source entries", () => {
  const sources = getRideSourceRegistry();
  const sfBikeSources = sources.filter((source) => source.rideId === "sf-bike-coalition-events");
  const svbcSources = sources.filter((source) => source.rideId === "silicon-valley-bike-clubs-directory");

  assert.equal(sfBikeSources.length, 1);
  assert.equal(sfBikeSources[0]?.syncMode, "manual");

  assert.equal(svbcSources.length, 1);
  assert.equal(svbcSources[0]?.syncMode, "manual");
});

test("getRideSourceRegistry uses stable crawl targets for Domestique rides", () => {
  const sources = getRideSourceRegistry();
  const domestiqueSources = sources.filter((source) => source.organizer === "Domestique Cycling Club");

  assert.equal(domestiqueSources.length, 4);
  for (const source of domestiqueSources) {
    assert.equal(source.url, "https://www.domestiquecyclingclub.com/rides");
    assert.equal(source.crawlUrl, "https://www.domestiquecyclingclub.com/");
  }
});

test("getRideSourceRegistry keeps Fat Cake crawlable while retaining Strava integration metadata", () => {
  const sources = getRideSourceRegistry();
  const fatCake = sources.find((source) => source.rideId === "fat-cake-club-strava");

  assert.ok(fatCake);
  assert.equal(fatCake.url, "https://www.fatcake.cc/rides");
  assert.equal(fatCake.syncMode, "crawl");
  assert.equal(fatCake.integration?.provider, "strava");
});
