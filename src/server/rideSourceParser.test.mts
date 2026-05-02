import test from "node:test";
import assert from "node:assert/strict";
import { parseRideSourceContent } from "./rideSourceParser.ts";
import type { RideSourceRegistryEntry } from "../lib/rideSources.ts";

function makeSource(overrides: Partial<RideSourceRegistryEntry> = {}): RideSourceRegistryEntry {
  return {
    id: "source-test",
    rideId: "ride-test",
    regionSlug: "bay-area",
    organizer: "Test Organizer",
    label: "Test Source",
    url: "https://example.com",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    ...overrides,
  };
}

test("parseRideSourceContent extracts event dates from Tockify-style JSON-LD", () => {
  const html = `
    <html>
      <head>
        <title>Calendar</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Event",
            "name": "Morning Ride",
            "startDate": "2026-05-16T08:00:00-07:00"
          }
        </script>
      </head>
      <body>Upcoming community rides.</body>
    </html>
  `;

  const parsed = parseRideSourceContent(
    makeSource({ url: "https://tockify.com/sanfranciscorides/" }),
    html,
    "A live calendar of group rides."
  );

  assert.equal(parsed.parserStrategy, "tockify-calendar");
  assert.deepEqual(parsed.detectedDates, ["2026-05-16"]);
  assert.match(parsed.extractedSchedule ?? "", /Upcoming dates:/);
});

test("parseRideSourceContent extracts dates from WildApricot-style calendar text", () => {
  const html = `
    <html>
      <body>
        <div>Saturday, May 9, 2026 8:00 AM</div>
        <div>Oakland social ride</div>
        <div>Sunday, May 17, 2026 8:00 AM</div>
      </body>
    </html>
  `;

  const parsed = parseRideSourceContent(
    makeSource({ url: "https://oaklandyellowjackets.wildapricot.org/", parserType: "calendar-page" }),
    html,
    null
  );

  assert.equal(parsed.parserStrategy, "wildapricot-calendar");
  assert.deepEqual(parsed.detectedDates, ["2026-05-09", "2026-05-17"]);
  assert.match(parsed.extractedSchedule ?? "", /Upcoming dates:/);
});

test("parseRideSourceContent keeps recurring schedule language for recurring pages", () => {
  const html = `
    <html>
      <body>
        <h1>Weekly Rides</h1>
        <p>Tuesdays meet 5:25 PM, roll 5:35 PM from Berkeley.</p>
        <p>Distance is 32 miles and the ride regroups at key turns.</p>
      </body>
    </html>
  `;

  const parsed = parseRideSourceContent(
    makeSource({ parserType: "recurring-page", url: "https://www.grizz.org/rides/" }),
    html,
    null
  );

  assert.equal(parsed.parserStrategy, "recurring-page");
  assert.match(parsed.extractedSchedule ?? "", /Tuesdays/i);
  assert.equal(parsed.extractedDistance, "32 miles");
  assert.match(parsed.extractedDropPolicy ?? "", /regroups/i);
});

