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

test("parseRideSourceContent extracts BayAreaRides event objects from Next payload", () => {
  const payload = `3c:[{"rides":[{"group_ride_id":7912,"club_title":"Almaden Cycle Touring Club","ride_title":"Monday Mixed Terrain- Palo Alto Baylands","start_time":"2026-05-04 10:00:00.000000","details_url":"https://www.actc.org/ridestats/calendar/show_ride.php?ride_id=31318_20260504","distance":75396,"description":"<p>No one left behind.</p>","start_coords":"POINT (-121.92217 37.29287)","start_address":"1980 Hamilton Ave., San Jose, CA","regions":["South Bay"]}],"clubs":[]}]`;
  const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`;

  const parsed = parseRideSourceContent(
    makeSource({ url: "https://bayarearides.org", parserType: "calendar-page" }),
    html,
    "Bay Area group rides feed."
  );

  assert.equal(parsed.sourceEvents.length, 1);
  assert.equal(parsed.sourceEvents[0]?.title, "Monday Mixed Terrain- Palo Alto Baylands");
  assert.equal(parsed.sourceEvents[0]?.dateKey, "2026-05-04");
  assert.equal(parsed.sourceEvents[0]?.metroArea, "South Bay");
  assert.equal(parsed.detectedEventCount, 1);
});

test("parseRideSourceContent extracts BayAreaRides events from initialGroupRides payload", () => {
  const payload = `9:["$","$L13",null,{"initialGroupRides":[{"group_ride_id":17,"club_id":17,"club_title":"House of Pain (HOP Ride)","ride_title":"🔁 House of Pain (HOP Ride)","start_time":"2026-05-09 09:00:00","details_url":"https://www.facebook.com/groups/291586665032871/","distance":87944,"description":"<p>Saturday morning group ride.</p>","start_coords":"POINT (-121.99701 37.81898)","start_address":"Peet's Coffee - 435 Railroad Ave, Danville, California","regions":["East Bay"]}],"foo":"bar"}]`;
  const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`;

  const parsed = parseRideSourceContent(
    makeSource({ url: "https://bayarearides.org", parserType: "calendar-page" }),
    html,
    "Bay Area group rides feed."
  );

  assert.equal(parsed.sourceEvents.length, 1);
  assert.equal(parsed.sourceEvents[0]?.title, "🔁 House of Pain (HOP Ride)");
  assert.equal(parsed.sourceEvents[0]?.dateKey, "2026-05-09");
  assert.equal(parsed.sourceEvents[0]?.metroArea, "East Bay");
  assert.equal(parsed.detectedEventCount, 1);
});
