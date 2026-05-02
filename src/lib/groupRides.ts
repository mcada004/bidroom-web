export type RideRegionSlug =
  | "bay-area"
  | "san-diego"
  | "los-angeles"
  | "santa-clarita"
  | "riverside";

export type RideRecurrence =
  | {
      kind: "weekly";
      weekdays: number[];
      seasonStart?: string;
      seasonEnd?: string;
      intervalWeeks?: number;
      anchorDate?: string;
    }
  | {
      kind: "monthly-nth-weekday";
      weekday: number;
      nthWeek: number;
      seasonStart?: string;
      seasonEnd?: string;
    }
  | {
      kind: "monthly-nth-weekdays";
      weekday: number;
      nthWeeks: number[];
      seasonStart?: string;
      seasonEnd?: string;
    }
  | {
      kind: "specific-dates";
      dates: string[];
    }
  | {
      kind: "variable-calendar";
    };

export type RideListing = {
  id: string;
  title: string;
  organizer: string;
  regionSlug: RideRegionSlug;
  metroArea: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl: string;
  cadence: string;
  schedule: string;
  distance: string;
  distanceMinMiles: number | null;
  distanceMaxMiles: number | null;
  pace: string;
  terrain: string;
  dropPolicy: string;
  startLocation: string;
  access: string;
  summary: string;
  notes: string;
  tags: string[];
  verifiedOn: string;
  recurrence: RideRecurrence;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: "exact" | "approximate" | "metro" | "unknown";
};

export type RideRegion = {
  slug: RideRegionSlug;
  label: string;
  blurb: string;
  status: "live" | "planned";
  rides: RideListing[];
};

export type DerivedRideListing = RideListing & {
  nextOccurrenceDate: string | null;
  nextOccurrenceLabel: string;
};

type RideCoordinate = {
  latitude: number;
  longitude: number;
  locationPrecision: "exact" | "approximate" | "metro";
};

export type RideDirectorySnapshot = {
  generatedAt: string;
  regions: RideRegion[];
  rides: DerivedRideListing[];
  syncSummary?: RideSyncSummary;
  sourceReports?: RideSourceReport[];
};

export type RideSourceReport = {
  sourceId: string;
  rideId: string | null;
  label: string;
  url: string;
  parserType: string;
  syncMode: string;
  fetchedAt: string;
  status: "fetched" | "failed" | "skipped";
  ok: boolean;
  httpStatus: number | null;
  pageTitle: string | null;
  pageDescription: string | null;
  excerpt: string | null;
  extractedSchedule: string | null;
  extractedDistance: string | null;
  extractedDropPolicy: string | null;
  contentHash: string | null;
  error: string | null;
  skippedReason: string | null;
};

export type RideSyncSummary = {
  generatedAt: string;
  sourceCount: number;
  crawledSourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  skippedSourceCount: number;
  persisted: boolean;
};

type SeedRideListing = Omit<RideListing, "latitude" | "longitude" | "locationPrecision">;
type SeedRideRegion = Omit<RideRegion, "rides"> & { rides: SeedRideListing[] };

function asDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isWithinSeason(dateKey: string, seasonStart?: string, seasonEnd?: string) {
  if (seasonStart && dateKey < seasonStart) return false;
  if (seasonEnd && dateKey > seasonEnd) return false;
  return true;
}

function getWeekOrdinal(date: Date) {
  return Math.floor((date.getUTCDate() - 1) / 7) + 1;
}

function occursOnDate(ride: RideListing, date: Date) {
  const dateKey = toDateKey(date);
  const weekday = date.getUTCDay();

  switch (ride.recurrence.kind) {
    case "weekly": {
      if (!ride.recurrence.weekdays.includes(weekday)) return false;
      if (!isWithinSeason(dateKey, ride.recurrence.seasonStart, ride.recurrence.seasonEnd)) {
        return false;
      }

      if (ride.recurrence.intervalWeeks && ride.recurrence.anchorDate) {
        const anchor = asDate(ride.recurrence.anchorDate);
        const diffDays = Math.floor((date.getTime() - anchor.getTime()) / 86_400_000);
        if (diffDays < 0) return false;
        const diffWeeks = Math.floor(diffDays / 7);
        return diffWeeks % ride.recurrence.intervalWeeks === 0;
      }

      return true;
    }
    case "monthly-nth-weekday":
      return (
        weekday === ride.recurrence.weekday &&
        getWeekOrdinal(date) === ride.recurrence.nthWeek &&
        isWithinSeason(dateKey, ride.recurrence.seasonStart, ride.recurrence.seasonEnd)
      );
    case "monthly-nth-weekdays":
      return (
        weekday === ride.recurrence.weekday &&
        ride.recurrence.nthWeeks.includes(getWeekOrdinal(date)) &&
        isWithinSeason(dateKey, ride.recurrence.seasonStart, ride.recurrence.seasonEnd)
      );
    case "specific-dates":
      return ride.recurrence.dates.includes(dateKey);
    case "variable-calendar":
      return false;
    default:
      return false;
  }
}

export function rideOccursOnDateKey(ride: RideListing, dateKey: string) {
  return occursOnDate(ride, asDate(dateKey));
}

function computeNextOccurrenceDate(ride: RideListing, startDateKey: string) {
  if (ride.recurrence.kind === "variable-calendar") return null;

  const startDate = asDate(startDateKey);
  for (let offset = 0; offset <= 400; offset += 1) {
    const candidate = addDays(startDate, offset);
    if (occursOnDate(ride, candidate)) return toDateKey(candidate);
  }

  return null;
}

function formatOccurrenceLabel(dateKey: string | null) {
  if (!dateKey) return "Check source calendar";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(asDate(dateKey));
}

const seedRideRegions: SeedRideRegion[] = [
  {
    slug: "bay-area",
    label: "Bay Area",
    blurb:
      "Curated first from official club calendars, advocacy pages, recurring shop rides, and active community ride pages.",
    status: "live",
    rides: [
      {
        id: "bike-east-bay-group-ride-series",
        title: "Bike East Bay Group Ride Series",
        organizer: "Bike East Bay",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Advocacy calendar",
        sourceLabel: "Bike East Bay 2026 Ride Series",
        sourceUrl: "https://bikeeastbay.org/annual-ride-series/",
        cadence: "Usually monthly",
        schedule: "Generally the 3rd Saturday from 11:00 AM to 2:00 PM, with some exceptions",
        distance: "Varies by route",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Social",
        terrain: "Road and mixed urban paths; all bikes welcome",
        dropPolicy: "No-drop",
        startLocation: "Varies; recent starts include Hayward BART and Oakland",
        access: "Public events",
        summary:
          "Beginner-friendly East Bay ride series run by the region's main bike advocacy group.",
        notes:
          "Current source page shows specific 2026 ride dates such as May 16 and June 6.",
        tags: ["Beginner-friendly", "Transit-friendly", "No-drop", "Monthly"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "specific-dates",
          dates: ["2026-05-16", "2026-06-06"],
        },
      },
      {
        id: "grizzly-peak-tuesday-night-ride",
        title: "GPC Tuesday Night Ride - Brisk Group",
        organizer: "Grizzly Peak Cyclists",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "Grizzly Peak Cyclists rides page",
        sourceUrl: "https://www.grizz.org/rides/",
        cadence: "Weekly",
        schedule: "Tuesdays; meet 5:25 PM, roll 5:35 PM",
        distance: "32 miles",
        distanceMinMiles: 32,
        distanceMaxMiles: 32,
        pace: "Brisk",
        terrain: "Road loop through Berkeley and Oakland hills",
        dropPolicy: "Regroups, but not no-drop",
        startLocation: "Spruce & Grizzly Peak Blvd plaza, Berkeley",
        access: "Non-members can try club rides before joining",
        summary:
          "A recurring East Bay evening ride for stronger road riders who are comfortable in a faster pack.",
        notes:
          "The source describes pace-line riding and limited wait times at regroup points.",
        tags: ["Fast", "Road", "Weeknight", "Regroups"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [2],
        },
      },
      {
        id: "marin-red-whale-sunday",
        title: "Easy Like Sunday Morning",
        organizer: "Marin Cyclists",
        regionSlug: "bay-area",
        metroArea: "Marin",
        sourceType: "Club recurring ride",
        sourceLabel: "Marin Cyclists recurring Sunday ride",
        sourceUrl:
          "https://marincyclists.com/content.aspx?club_id=525458&item_id=2804074&page_id=4002",
        cadence: "Weekly",
        schedule: "Sundays; meet 9:45 AM, roll 10:00 AM",
        distance: "30 to 35 miles",
        distanceMinMiles: 30,
        distanceMaxMiles: 35,
        pace: "Social, about 12 to 13.9 mph",
        terrain: "Mostly flat road route with minor variations",
        dropPolicy: "No-drop",
        startLocation: "Red Whale Coffee / Redwood Cafe parking lot, San Rafael",
        access: "Registration required; members and non-members welcome",
        summary:
          "A classic Marin recovery-style ride with regroups and a low-pressure social pace.",
        notes:
          "The organizer notes that all riders are welcome and the ride cancels with a 20% or higher chance of rain.",
        tags: ["Social", "No-drop", "Road", "Weekend"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
      {
        id: "marin-wednesday-gravel",
        title: "Wednesday Decide & Ride Gravel",
        organizer: "Marin Cyclists",
        regionSlug: "bay-area",
        metroArea: "Marin",
        sourceType: "Club recurring ride",
        sourceLabel: "Marin Cyclists Wednesday gravel ride",
        sourceUrl:
          "https://www.marincyclists.com/content.aspx?club_id=525458&item_id=2908301&page_id=4091",
        cadence: "Weekly",
        schedule: "Wednesdays; meet 9:00 AM",
        distance: "40 to 60 miles",
        distanceMinMiles: 40,
        distanceMaxMiles: 60,
        pace: "Moderate to strong",
        terrain: "Gravel and mixed terrain in Marin and nearby hills",
        dropPolicy: "Regroups as necessary",
        startLocation: "Pink Owl Coffee, San Rafael",
        access: "Pre-registration requested; members and non-members welcome",
        summary:
          "A longer Marin gravel meetup with route choice driven by the day's group and conditions.",
        notes:
          "Source explicitly says this is not a beginner ride and that route options may include Headlands, Tam, or Hamilton.",
        tags: ["Gravel", "Longer ride", "Weekday", "Regroups"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [3],
        },
      },
      {
        id: "western-wheelers-monday-coffee",
        title: "Socially Paced Monday Morning Coffee Ride",
        organizer: "Western Wheelers",
        regionSlug: "bay-area",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride",
        sourceLabel: "Western Wheelers Monday coffee ride",
        sourceUrl: "https://westernwheelersbicycleclub.wildapricot.org/event-6467878",
        cadence: "Weekly",
        schedule: "Mondays; meet 8:45 AM, roll 9:00 AM",
        distance: "15 miles",
        distanceMinMiles: 15,
        distanceMaxMiles: 15,
        pace: "Easy social pace",
        terrain: "Neighborhood road spin with a coffee stop",
        dropPolicy: "No-drop",
        startLocation: "Rengstorff Community Center, Mountain View",
        access: "Guests welcome on club rides unless noted otherwise",
        summary:
          "An easy Peninsula coffee ride designed for riders who want a truly mellow group pace.",
        notes:
          "The source says nobody is left behind and the mid-ride stop is Cafe Borrone.",
        tags: ["Beginner-friendly", "Coffee ride", "No-drop", "Weekday"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [1],
        },
      },
      {
        id: "western-wheelers-seal-point",
        title: "Seal Point / Redwood Shores",
        organizer: "Western Wheelers",
        regionSlug: "bay-area",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride",
        sourceLabel: "Western Wheelers Seal Point / Redwood Shores",
        sourceUrl: "https://westernwheelersbicycleclub.wildapricot.org/event-6467913",
        cadence: "Multiple days each week",
        schedule: "Tuesday through Saturday; meet 8:45 AM, depart 9:00 AM",
        distance: "23 miles",
        distanceMinMiles: 23,
        distanceMaxMiles: 23,
        pace: "Relaxed to steady",
        terrain: "Flat bay trail and local streets",
        dropPolicy: "No-drop",
        startLocation: "Seal Point Park, San Mateo",
        access: "Guests welcome on club rides unless noted otherwise",
        summary:
          "A frequent Peninsula ride that stays approachable and centers on the bay trail corridor.",
        notes:
          "Source describes a regroup and coffee stop in Redwood Shores before returning to Seal Point.",
        tags: ["Frequent", "Flat", "Coffee ride", "No-drop"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [2, 3, 4, 5, 6],
        },
      },
      {
        id: "western-wheelers-tuesday-evening",
        title: "Tuesday Evening Ride",
        organizer: "Western Wheelers",
        regionSlug: "bay-area",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride",
        sourceLabel: "Western Wheelers ride schedule",
        sourceUrl:
          "https://westernwheelersbicycleclub.wildapricot.org/ride_calendar?EventListViewMode=1&EventViewMode=1",
        cadence: "Weekly during evening-ride season",
        schedule: "Tuesdays; meet 5:15 PM, roll 5:30 PM",
        distance: "15 miles and up",
        distanceMinMiles: 15,
        distanceMaxMiles: null,
        pace: "C to D pace",
        terrain: "Backroads around Woodside with moderate hills",
        dropPolicy: "Varies by route; confirm day-of details",
        startLocation: "Pioneer Saloon, Woodside",
        access: "Guests welcome on club rides unless noted otherwise",
        summary:
          "A stronger after-work Peninsula road ride with weekly route variation around Woodside.",
        notes:
          "Current 2026 schedule shows the series running from March 10, 2026 through June 30, 2026.",
        tags: ["Weeknight", "Road", "Hilly", "Seasonal"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [2],
          seasonStart: "2026-03-10",
          seasonEnd: "2026-06-30",
        },
      },
      {
        id: "fat-cake-ftwnb",
        title: "FTWNB Ride",
        organizer: "Fat Cake Club",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Community rides page",
        sourceLabel: "Fat Cake Club rides",
        sourceUrl: "https://www.fatcake.cc/rides",
        cadence: "Weekly",
        schedule: "Mondays at 6:30 AM",
        distance: "17 miles",
        distanceMinMiles: 17,
        distanceMaxMiles: 17,
        pace: "Relaxed",
        terrain: "City road route via Ocean Beach, Great Highway, and Twin Peaks",
        dropPolicy: "Sweep support on ally day; welcoming format overall",
        startLocation: "Conservatory of Flowers, Golden Gate Park",
        access: "Open community ride",
        summary:
          "A San Francisco ride specifically built for femme, trans, women, and non-binary cyclists.",
        notes:
          "The route ends with coffee and breakfast after the Twin Peaks lap.",
        tags: ["Inclusive", "City ride", "Coffee ride", "Morning"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [1],
        },
      },
      {
        id: "fat-cake-headlands",
        title: "Headlands + Arsicault Bakery",
        organizer: "Fat Cake Club",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Community rides page",
        sourceLabel: "Fat Cake Club rides",
        sourceUrl: "https://www.fatcake.cc/rides",
        cadence: "Weekly",
        schedule: "Tuesdays at 6:30 AM",
        distance: "25 miles",
        distanceMinMiles: 25,
        distanceMaxMiles: 25,
        pace: "Steady social",
        terrain: "Road ride via Golden Gate Bridge and Marin Headlands",
        dropPolicy: "Check ride culture and route expectations before joining",
        startLocation: "Southern Golden Gate Bridge pavilion",
        access: "Open community ride",
        summary:
          "One of the more recognizable SF recurring rides: early bridge crossing, Hawk Hill, pastry stop.",
        notes:
          "A good choice if you want a scenic city-to-Headlands road route with a consistent meetup.",
        tags: ["Road", "Headlands", "Morning", "Bakery stop"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [2],
        },
      },
      {
        id: "ornot-after-cake",
        title: "After Cake, Ornot",
        organizer: "Ornot",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Shop ride page",
        sourceLabel: "Ornot showroom events",
        sourceUrl: "https://www.ornotbike.com/pages/showroom",
        cadence: "Weekly",
        schedule: "Tuesday mornings at 8:30 AM",
        distance: "About 1.5 hours of riding",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Chill",
        terrain: "Mixed terrain with some dirt and gravel paths",
        dropPolicy: "Everyone welcome",
        startLocation: "Ornot showroom, 59 Clement Street, San Francisco",
        access: "Open shop ride",
        summary:
          "A low-key Inner Richmond mixed-terrain ride that starts from a well-known SF cycling brand showroom.",
        notes:
          "The source says most bikes will work, but riders should be comfortable with some dirt and gravel.",
        tags: ["Shop ride", "Mixed terrain", "Welcoming", "Weekday"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [2],
        },
      },
      {
        id: "pas-normal-sf-weekly",
        title: "Pas Normal Studios Weekly Group Rides",
        organizer: "Pas Normal Studios San Francisco",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Shop ride page",
        sourceLabel: "Pas Normal Studios San Francisco",
        sourceUrl: "https://pasnormalstudios.com/pages/san-francisco",
        cadence: "Weekly",
        schedule: "Weekly; see store events for exact departures",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by ride",
        terrain: "Road and gravel routes heading north across the bridge",
        dropPolicy: "Confirm on the specific event",
        startLocation: "799 Haight Street, San Francisco",
        access: "Open store events",
        summary:
          "The Lower Haight flagship hosts weekly rides that typically head north toward Marin.",
        notes:
          "The official store page calls out multiple weekly group rides and both road and gravel options.",
        tags: ["Shop ride", "Road", "Gravel", "Marin routes"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "actc-ride-calendar",
        title: "ACTC Club Ride Calendar",
        organizer: "Almaden Cycle Touring Club",
        regionSlug: "bay-area",
        metroArea: "South Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "ACTC ride schedule",
        sourceUrl: "https://actc.org/schedule/",
        cadence: "Daily calendar",
        schedule: "Several rides every day; see current and next month schedules",
        distance: "Varies widely",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "All levels",
        terrain: "Road, trails, paths, and mountains",
        dropPolicy: "Varies by ride",
        startLocation: "Mostly South Bay starts, plus broader Bay Area routes",
        access: "Visitors and guests are welcome",
        summary:
          "One of the deepest South Bay ride calendars, with enough variety to support beginners through endurance riders.",
        notes:
          "Useful as a calendar source when you want daily options instead of one fixed recurring meetup.",
        tags: ["Calendar", "South Bay", "All levels", "High volume"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "mikes-bikes-community-events",
        title: "Mike's Bikes Community & Events",
        organizer: "Mike's Bikes",
        regionSlug: "bay-area",
        metroArea: "South Bay",
        sourceType: "Shop events hub",
        sourceLabel: "Mike's Bikes community and events",
        sourceUrl: "https://mikesbikes.com/pages/community-and-events",
        cadence: "Weekly rides across participating stores",
        schedule: "Weekly loops, weekend rides, clinics, and workshops",
        distance: "Varies by store and event",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Casual to performance-oriented depending on ride",
        terrain: "Road and trail depending on shop route",
        dropPolicy: "Varies by event",
        startLocation: "Varies by store",
        access: "Public shop events",
        summary:
          "Bay Area shop-ride hub that aggregates rides, clinics, and hands-on workshops from Mike's Bikes locations.",
        notes:
          "Especially useful if you want a shop-led ride and prefer to browse current dates instead of memorizing a standing meetup.",
        tags: ["Shop ride", "Clinics", "Bay-wide", "Calendar"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "sf-group-rides-calendar",
        title: "San Francisco Group Rides Calendar",
        organizer: "Bay Area Rides / SF Group Rides",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Aggregator calendar",
        sourceLabel: "San Francisco Group Rides calendar",
        sourceUrl: "https://tockify.com/sanfranciscorides/",
        cadence: "Calendar feed",
        schedule: "Recurring and one-off Bay Area rides; see the live calendar for exact dates",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by event",
        terrain: "Road, gravel, city, and mixed terrain depending on listing",
        dropPolicy: "Check the source event",
        startLocation: "Varies around San Francisco and the greater Bay Area",
        access: "Public calendar discovery source",
        summary:
          "A strong Bay Area ride aggregator that is useful when you want a wider view than any single club calendar.",
        notes:
          "Best used as a discovery source, then confirmed against the organizer's own listing.",
        tags: ["Aggregator", "Bay Area", "Calendar", "Discovery"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "sf-bike-coalition-events",
        title: "San Francisco Bicycle Coalition Events",
        organizer: "San Francisco Bicycle Coalition",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Advocacy events calendar",
        sourceLabel: "SF Bike events",
        sourceUrl: "https://sfbike.org/events/",
        cadence: "Calendar feed",
        schedule: "Community rides, classes, and advocacy events on the coalition calendar",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Usually social",
        terrain: "Primarily city rides and event-based routes",
        dropPolicy: "Check the source event",
        startLocation: "Varies across San Francisco",
        access: "Public events",
        summary:
          "An official San Francisco advocacy calendar that regularly includes community rides and social bike events.",
        notes:
          "Not every listing is a ride, but it is a high-trust source for SF cycling events.",
        tags: ["Official", "San Francisco", "Advocacy", "Calendar"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "bike-east-bay-group-rides-category",
        title: "Bike East Bay Group Rides Category",
        organizer: "Bike East Bay",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Advocacy events calendar",
        sourceLabel: "Bike East Bay group rides category",
        sourceUrl: "https://bikeeastbay.org/events/category/group-rides/",
        cadence: "Calendar feed",
        schedule: "East Bay group ride listings on the official events calendar",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Usually social to intermediate",
        terrain: "Road, city, and mixed path riding",
        dropPolicy: "Usually announced in the event listing",
        startLocation: "Varies around the East Bay",
        access: "Public events",
        summary:
          "A broader Bike East Bay ride source than the annual series alone, useful for keeping East Bay community rides visible.",
        notes:
          "Good source for discovery and official verification of Bike East Bay ride listings.",
        tags: ["Official", "East Bay", "Calendar", "Community rides"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "ridepanda-bay-area-calendar",
        title: "Ridepanda Bay Area Bike Event Calendar",
        organizer: "Ridepanda",
        regionSlug: "bay-area",
        metroArea: "Bay Area",
        sourceType: "Aggregator calendar",
        sourceLabel: "Ridepanda Bay Area bike event calendar",
        sourceUrl: "https://www.ridepanda.com/blog/bay-area-bike-event-calendar",
        cadence: "Calendar feed",
        schedule: "Aggregated Bay Area ride and event listings",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by organizer",
        terrain: "All formats depending on listing",
        dropPolicy: "Verify with original organizer",
        startLocation: "Varies around the Bay Area",
        access: "Public discovery source",
        summary:
          "A discovery-focused Bay Area event aggregator that can surface rides you might miss on club-only calendars.",
        notes:
          "Use it as a lead source, then verify details directly with the ride organizer.",
        tags: ["Aggregator", "Discovery", "Bay Area", "Calendar"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "bay-area-cycling-meetup",
        title: "Bay Area Cycling Meetup",
        organizer: "Bay Area Cycling Meetup",
        regionSlug: "bay-area",
        metroArea: "Bay Area",
        sourceType: "Community group calendar",
        sourceLabel: "Bay Area Cycling Meetup",
        sourceUrl: "https://www.meetup.com/bayareacycling/",
        cadence: "Group event feed",
        schedule: "Weekday and weekend rides announced through Meetup",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by meetup ride",
        terrain: "Road and social cycling routes",
        dropPolicy: "Check event listing",
        startLocation: "Varies around the Bay Area",
        access: "Meetup-based community rides",
        summary:
          "A useful community group for Bay-wide ride discovery when club calendars feel too fragmented.",
        notes:
          "Best treated as a community discovery source rather than an official organizer feed.",
        tags: ["Meetup", "Community", "Bay Area", "Discovery"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "bay-area-road-biking-meetup",
        title: "Bay Area Road Biking Meetup",
        organizer: "Bay Area Road Biking Meetup",
        regionSlug: "bay-area",
        metroArea: "South Bay",
        sourceType: "Community group calendar",
        sourceLabel: "Bay Area Road Biking Meetup",
        sourceUrl: "https://www.meetup.com/sunnyvale-los-altos-road-biking/",
        cadence: "Group event feed",
        schedule: "Weekday and weekend Peninsula/South Bay road rides via Meetup",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Mostly road-group pacing",
        terrain: "Road rides around the Peninsula and South Bay",
        dropPolicy: "Check event listing",
        startLocation: "Varies around Sunnyvale, Los Altos, and nearby starts",
        access: "Meetup-based community rides",
        summary:
          "A Peninsula/South Bay road-focused Meetup source that can expose active group rides outside the major clubs.",
        notes:
          "Useful discovery source; event details and cadence may shift frequently.",
        tags: ["Meetup", "Road", "South Bay", "Community"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "bespoke-cycles-sf-rides",
        title: "Bespoke Cycles SF Rides",
        organizer: "Bespoke Cycles SF",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Shop ride page",
        sourceLabel: "Bespoke Cycles SF rides",
        sourceUrl: "https://www.bespokecyclessf.com/rides",
        cadence: "Recurring shop rides",
        schedule: "Includes a recurring Saturday no-drop ride and future ride references",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Beginner-friendly to social",
        terrain: "City and road routes from San Francisco",
        dropPolicy: "No-drop ride called out on source page",
        startLocation: "Bespoke Cycles SF",
        access: "Public shop ride",
        summary:
          "A strong San Francisco shop-ride source with a more approachable recurring ride format.",
        notes:
          "Good candidate when you want a lower-barrier SF road ride with explicit no-drop language.",
        tags: ["Shop ride", "San Francisco", "No-drop", "Recurring"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "different-spokes-sf-calendar",
        title: "Different Spokes San Francisco Ride Calendar",
        organizer: "Different Spokes",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Club ride calendar",
        sourceLabel: "Different Spokes ride calendar",
        sourceUrl: "https://www.dssf.org/content.aspx?club_id=17789&page_id=4001",
        cadence: "Calendar feed",
        schedule: "Recurring and one-off rides through the Different Spokes club calendar",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by ride",
        terrain: "Road and social club rides",
        dropPolicy: "Check the event listing",
        startLocation: "Varies around San Francisco and the Bay Area",
        access: "Club calendar with public discovery value",
        summary:
          "A long-running SF cycling and social club calendar that broadens the city's ride coverage beyond shop rides.",
        notes:
          "Useful for recurring club programs and special rides that may not appear on broader aggregators.",
        tags: ["Club calendar", "San Francisco", "Social", "Recurring"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "rapha-sf-events",
        title: "Rapha Cycle Club San Francisco Events",
        organizer: "Rapha Cycle Club San Francisco",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Community events listing",
        sourceLabel: "Rapha Cycle Club SF via DoTheBay",
        sourceUrl: "https://dothebay.com/venues/rapha-cycle-club",
        cadence: "Event feed",
        schedule: "Recurring and social ride discovery via listing page",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by event",
        terrain: "Road and community rides",
        dropPolicy: "Verify with Rapha or the ride organizer",
        startLocation: "Rapha Cycle Club San Francisco",
        access: "Public discovery source",
        summary:
          "A useful Rapha event discovery page for social and club-style rides tied to the SF clubhouse.",
        notes:
          "Use it as a discovery source, then confirm specifics against the primary organizer source where possible.",
        tags: ["Rapha", "San Francisco", "Discovery", "Social rides"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "fat-cake-club-strava",
        title: "Fat Cake Club Strava Community",
        organizer: "Fat Cake Club",
        regionSlug: "bay-area",
        metroArea: "San Francisco",
        sourceType: "Community club page",
        sourceLabel: "Fat Cake Club Strava",
        sourceUrl: "https://www.strava.com/clubs/fatcakeclub",
        cadence: "Community feed",
        schedule: "Ride organization often happens through Strava and related community channels",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by ride",
        terrain: "Road and city rides",
        dropPolicy: "Check the ride post or organizer note",
        startLocation: "Varies around San Francisco",
        access: "Community source",
        summary:
          "A strong signal for active SF group riding even when direct event extraction is limited.",
        notes:
          "Included primarily as a community source with source-link value rather than a guaranteed structured event feed.",
        tags: ["Strava", "Community", "San Francisco", "Discovery"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "berkeley-bike-club-weekly",
        title: "Berkeley Bicycle Club Weekly Group Rides",
        organizer: "Berkeley Bicycle Club",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Club recurring ride page",
        sourceLabel: "Berkeley Bicycle Club weekly group rides",
        sourceUrl: "https://berkeleybikeclub.org/weekly-group-ride",
        cadence: "Weekly recurring rides",
        schedule: "Includes weekday and weekend recurring rides plus progression and intro formats",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies from intro to faster club pace",
        terrain: "East Bay and Marin road routes",
        dropPolicy: "Regroups on many rides; confirm on source",
        startLocation: "Varies; includes East Bay starts and Richmond Bridge / Marin options",
        access: "Club rides with public discovery value",
        summary:
          "One of the best East Bay recurring-ride sources because it is explicitly organized around weekly standing rides.",
        notes:
          "Good source for intro rides, progression rides, and classic East Bay-to-Marin routes.",
        tags: ["East Bay", "Weekly rides", "Club", "Progression"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "oakland-yellow-jackets-calendar",
        title: "Oakland Yellow Jackets Ride Calendar",
        organizer: "Oakland Yellow Jackets",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "Oakland Yellow Jackets",
        sourceUrl: "https://oaklandyellowjackets.wildapricot.org/",
        cadence: "Calendar feed",
        schedule: "Recurring and special rides through the club calendar",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "All abilities",
        terrain: "East Bay and broader Bay Area routes",
        dropPolicy: "Check individual ride listing",
        startLocation: "Varies around Oakland and the East Bay",
        access: "Club calendar",
        summary:
          "An Oakland-based club source that broadens East Bay coverage with a more all-abilities community emphasis.",
        notes:
          "Useful source for finding Oakland-centered group rides that do not always surface on larger club pages.",
        tags: ["Oakland", "East Bay", "Club calendar", "All abilities"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "veloraptors-rides-routes",
        title: "VeloRaptors Rides & Routes",
        organizer: "VeloRaptors Cycling Club",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Club recurring ride page",
        sourceLabel: "VeloRaptors rides and routes",
        sourceUrl: "https://www.veloraptors.com/rides-routes/",
        cadence: "Weekly recurring rides",
        schedule: "Weekly Sunday, Wednesday, and Saturday ride information",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Performance-oriented",
        terrain: "Road training and endurance routes",
        dropPolicy: "Check ride description",
        startLocation: "Varies around the East Bay",
        access: "Club ride source",
        summary:
          "A strong East Bay performance/training source for riders looking beyond beginner or social ride calendars.",
        notes:
          "Good candidate for faster weekend and midweek training ride discovery.",
        tags: ["Performance", "East Bay", "Training rides", "Weekly"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "street-level-cycling-club-calendar",
        title: "Street Level Cycling Club Ride Calendar",
        organizer: "Street Level Cycling Club",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Community ride calendar",
        sourceLabel: "Street Level Cycling Club ride calendar",
        sourceUrl: "https://watersideworkshops.org/street-level-cycling-club-ride-calendar/",
        cadence: "Recurring community rides",
        schedule: "Beginner- and intermediate-style recurring schedules on the club calendar",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Beginner to intermediate",
        terrain: "Local East Bay road and path routes",
        dropPolicy: "Check event listing",
        startLocation: "Varies in the East Bay",
        access: "Community rides",
        summary:
          "A useful East Bay source for more approachable rides, especially compared with performance-heavy club calendars.",
        notes:
          "Good complement to faster East Bay club sources because it skews more beginner/intermediate.",
        tags: ["Beginner-friendly", "East Bay", "Community rides", "Recurring"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "cherry-city-cyclists-calendar",
        title: "Cherry City Cyclists Calendar",
        organizer: "Cherry City Cyclists",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "Cherry City Cyclists",
        sourceUrl: "https://www.cherrycitycyclists.org/",
        cadence: "Club calendar",
        schedule: "Ride and event calendar with broader Bay Area coverage",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by ride",
        terrain: "Road and club routes",
        dropPolicy: "Check ride listing",
        startLocation: "Varies",
        access: "Club calendar",
        summary:
          "A useful broader Bay Area club source that can fill gaps not covered by the big East Bay and Peninsula calendars.",
        notes:
          "Included as a discovery-heavy club calendar with region overlap value.",
        tags: ["Club calendar", "Bay Area", "Discovery", "Varied routes"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "valley-spokesmen-calendar",
        title: "Valley Spokesmen Bicycle Club",
        organizer: "Valley Spokesmen Bicycle Club",
        regionSlug: "bay-area",
        metroArea: "East Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "Valley Spokesmen Bicycle Club",
        sourceUrl: "https://www.valleyspokesmen.org/",
        cadence: "Club calendar",
        schedule: "Local and non-local rides with varied difficulty and discipline",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Wide range of difficulty",
        terrain: "Road and mountain bike options",
        dropPolicy: "Check individual ride details",
        startLocation: "Dublin / Tri-Valley and beyond",
        access: "Club calendar",
        summary:
          "A strong East Bay / Tri-Valley source because it spans road, mountain bike, local, and destination rides.",
        notes:
          "Useful for riders looking outside the SF-Oakland core.",
        tags: ["Tri-Valley", "East Bay", "Road", "Mountain bike"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "penvelo-summit-group-rides",
        title: "Pen Velo / Summit Bicycles Group Rides",
        organizer: "Pen Velo / Summit Bicycles",
        regionSlug: "bay-area",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride page",
        sourceLabel: "Pen Velo / Summit group rides",
        sourceUrl: "https://penvelo.org/group-rides/",
        cadence: "Recurring fast rides",
        schedule: "Peninsula fast road ride source with recurring formats",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Fast road / training pace",
        terrain: "Peninsula road routes",
        dropPolicy: "Confirm on the ride source",
        startLocation: "Varies around the Peninsula",
        access: "Club / shop-affiliated ride source",
        summary:
          "A useful Peninsula source for stronger riders who want organized road training rides.",
        notes:
          "Pairs well with Western Wheelers by covering more performance-focused ride demand.",
        tags: ["Peninsula", "Fast", "Road", "Training"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "alto-velo-other-group-rides",
        title: "Alto Velo Other Group Rides",
        organizer: "Alto Velo",
        regionSlug: "bay-area",
        metroArea: "South Bay",
        sourceType: "Discovery list",
        sourceLabel: "Alto Velo other group rides",
        sourceUrl: "https://www.altovelo.org/other-group-rides",
        cadence: "Discovery list",
        schedule: "Curated list of Peninsula and South Bay group rides",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by linked ride",
        terrain: "Mostly road",
        dropPolicy: "Check linked organizer",
        startLocation: "Varies around the Peninsula and South Bay",
        access: "Public discovery source",
        summary:
          "A useful curated discovery page for finding additional Peninsula and South Bay rides beyond any single club.",
        notes:
          "Best used as a routing source into other organizers rather than the final authority.",
        tags: ["Discovery", "Peninsula", "South Bay", "Curated list"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
      {
        id: "silicon-valley-bike-clubs-directory",
        title: "Silicon Valley Bicycle Coalition Local Bike Clubs Directory",
        organizer: "Silicon Valley Bicycle Coalition",
        regionSlug: "bay-area",
        metroArea: "South Bay",
        sourceType: "Directory source",
        sourceLabel: "SVBC local bike clubs directory",
        sourceUrl: "https://bikesiliconvalley.org/resources/local-bike-clubs",
        cadence: "Directory",
        schedule: "Directory of local clubs, trail groups, and community groups",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by linked club",
        terrain: "Road, trail, and community riding",
        dropPolicy: "Check linked organizer",
        startLocation: "Varies around Silicon Valley and the South Bay",
        access: "Public directory",
        summary:
          "A strong seed source for future club expansion in the South Bay and Silicon Valley.",
        notes:
          "More useful as a database-building directory than as a single live event feed.",
        tags: ["Directory", "South Bay", "Discovery", "Expansion source"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
    ],
  },
  {
    slug: "san-diego",
    label: "San Diego",
    blurb:
      "Club-heavy county with strong Saturday and Sunday group ride culture, plus a few weekday staples.",
    status: "live",
    rides: [
      {
        id: "sdbc-saturday-club-ride",
        title: "SDBC Saturday Club Ride",
        organizer: "San Diego Bicycle Club",
        regionSlug: "san-diego",
        metroArea: "San Diego",
        sourceType: "Club recurring ride",
        sourceLabel: "SDBC Saturday Ride",
        sourceUrl: "https://sdbc.org/saturday",
        cadence: "Weekly",
        schedule: "Every Saturday; first-time orientation at 8:15 AM, rides roll after 8:30 AM",
        distance: "24 to 46 miles depending on group",
        distanceMinMiles: 24,
        distanceMaxMiles: 46,
        pace: "Entry-level to race-adjacent, depending on group",
        terrain: "Road; multiple group formats from development to fast paceline work",
        dropPolicy: "D-4 is no-drop; other groups vary",
        startLocation: "UC Cyclery, La Jolla",
        access: "Open to the public",
        summary:
          "One of San Diego's main standing rides, with seven groups covering almost every level.",
        notes:
          "The source lists A/B/C and D-1 at 46 miles, D-2 at about 42-43, D-3 at 37, and D-4 at 24 miles.",
        tags: ["Big club ride", "Training ride", "Saturday", "Multi-group"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
      {
        id: "sd-recyclers-sunday",
        title: "San Diego Recyclers Sunday Ride",
        organizer: "San Diego Recyclers Bicycle Club",
        regionSlug: "san-diego",
        metroArea: "San Diego",
        sourceType: "Club recurring ride",
        sourceLabel: "San Diego Recyclers home page",
        sourceUrl: "https://www.sdrecyclers.org/",
        cadence: "Weekly",
        schedule: "Sundays; meet 8:00 AM, typical 8:15 roll-out",
        distance: "30 to 50 miles",
        distanceMinMiles: 30,
        distanceMaxMiles: 50,
        pace: "About 15 mph average",
        terrain: "Road routes around San Diego County",
        dropPolicy: "Regroups where needed, but riders remain responsible for navigation",
        startLocation: "Varies around San Diego County",
        access: "No membership required; signed waiver expected",
        summary:
          "A long-running San Diego social road ride with weekly route variation and a steady, regrouping pace.",
        notes:
          "The club FAQ says rides meet at 8:00 AM for an 8:15 roll-out, with occasional early-bird starts.",
        tags: ["Social", "Sunday", "Road", "Weekly"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
      {
        id: "cyclo-vets-saturday-a",
        title: "Cyclo-Vets Saturday A Ride",
        organizer: "San Diego Cyclo-Vets",
        regionSlug: "san-diego",
        metroArea: "San Diego",
        sourceType: "Club recurring ride",
        sourceLabel: "Cyclo-Vets rides page",
        sourceUrl: "https://cyclo-vets.com/rides",
        cadence: "Weekly",
        schedule: "Saturdays at 8:30 AM",
        distance: "About 50 miles",
        distanceMinMiles: 50,
        distanceMaxMiles: 50,
        pace: "Harder, hilly",
        terrain: "Road ride with route variation after Doyle Park",
        dropPolicy: "Group regroups early, then route varies",
        startLocation: "5010 Mission Center Rd, San Diego",
        access: "Open club ride",
        summary:
          "A stronger Saturday Mission Valley start for riders looking for a harder San Diego group effort.",
        notes:
          "The source notes that all Saturday groups stay together until Bicycle Warehouse and Doyle Park before splitting.",
        tags: ["Fast", "Saturday", "Road", "Hilly"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
      {
        id: "cyclo-vets-wednesday-coffee",
        title: "Cyclo-Vets Wednesday Coffee Ride",
        organizer: "San Diego Cyclo-Vets",
        regionSlug: "san-diego",
        metroArea: "San Diego",
        sourceType: "Club recurring ride",
        sourceLabel: "Cyclo-Vets rides page",
        sourceUrl: "https://cyclo-vets.com/rides",
        cadence: "Weekly",
        schedule: "Wednesdays at 8:30 AM",
        distance: "About 50 miles",
        distanceMinMiles: 50,
        distanceMaxMiles: 50,
        pace: "Moderate+, hilly",
        terrain: "Road route to Encinitas with regroup points",
        dropPolicy: "Regroups northbound and southbound",
        startLocation: "Fashion Valley west parking lot or Rose Canyon Bike Path meet-in",
        access: "Open club ride",
        summary:
          "A midweek San Diego road ride with a coastal coffee turn-around in Encinitas.",
        notes:
          "The page describes coffee at the Lumberyard in Encinitas and occasional longer options.",
        tags: ["Coffee ride", "Weekday", "Road", "Longer ride"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [3],
        },
      },
      {
        id: "descenders-weekly-schedule",
        title: "Descenders Weekly Ride Schedule",
        organizer: "San Diego Descenders",
        regionSlug: "san-diego",
        metroArea: "San Diego",
        sourceType: "Club calendar",
        sourceLabel: "San Diego Descenders home page",
        sourceUrl: "https://descenders.org/",
        cadence: "Weekly weekend calendar",
        schedule: "Weekly; see ride schedule and calendar for routes and meeting points",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Endurance-oriented",
        terrain: "Remote and challenging paved roads in San Diego County and beyond",
        dropPolicy: "Check the posted ride",
        startLocation: "Varies",
        access: "Visitors and guests welcome",
        summary:
          "A strong option for riders looking for bigger adventure-style road rides around San Diego County.",
        notes:
          "The official site emphasizes weekly ride scheduling and guest access, but riders should check the current calendar for exact dates and starts.",
        tags: ["Calendar", "Endurance", "Challenging", "Guests welcome"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "variable-calendar",
        },
      },
    ],
  },
  {
    slug: "los-angeles",
    label: "Los Angeles",
    blurb:
      "Built around Westside recurring rides, Pasadena shop rides, and the long-running LA Wheelmen calendar.",
    status: "live",
    rides: [
      {
        id: "domestique-golden-hour",
        title: "Golden Hour",
        organizer: "Domestique Cycling Club",
        regionSlug: "los-angeles",
        metroArea: "West Los Angeles",
        sourceType: "Club recurring ride",
        sourceLabel: "Domestique weekly rides",
        sourceUrl: "https://www.domestiquecyclingclub.com/rides",
        cadence: "Weekly",
        schedule: "Tuesdays at 5:25 PM",
        distance: "About 16 miles",
        distanceMinMiles: 16,
        distanceMaxMiles: 16,
        pace: "12 to 14 mph",
        terrain: "Westside road loop with light climbing",
        dropPolicy: "No-drop with regroups as needed",
        startLocation: "San Vicente & Ocean, Santa Monica",
        access: "Club ride",
        summary:
          "A weekday evening LA ride built around connection, sunset pacing, and beginner-welcoming group flow.",
        notes:
          "The source explicitly describes this as no-drop, but not beginner-paced.",
        tags: ["No-drop", "Weeknight", "Westside", "Social"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [2],
        },
      },
      {
        id: "domestique-coffee-ride",
        title: "The Coffee Ride",
        organizer: "Domestique Cycling Club",
        regionSlug: "los-angeles",
        metroArea: "West Los Angeles",
        sourceType: "Club recurring ride",
        sourceLabel: "Domestique weekly rides",
        sourceUrl: "https://www.domestiquecyclingclub.com/rides",
        cadence: "Weekly",
        schedule: "Thursdays at 6:25 AM",
        distance: "About 21 miles",
        distanceMinMiles: 21,
        distanceMaxMiles: 21,
        pace: "12 to 14 mph",
        terrain: "Road route through Santa Monica, Amalfi, Sunset, and Mandeville",
        dropPolicy: "No-drop with leaders and sweep support",
        startLocation: "goodboybob Coffee, Santa Monica",
        access: "Club ride",
        summary:
          "A polished LA early-morning road ride that pairs a steady climbing route with regrouped coffee-ride energy.",
        notes:
          "The source calls out regroup points at the tops of Sunset and Mandeville.",
        tags: ["Coffee ride", "No-drop", "Weekday", "Westside"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [4],
        },
      },
      {
        id: "domestique-all-club",
        title: "All Club A/B",
        organizer: "Domestique Cycling Club",
        regionSlug: "los-angeles",
        metroArea: "West Los Angeles",
        sourceType: "Club recurring ride",
        sourceLabel: "Domestique weekly rides",
        sourceUrl: "https://www.domestiquecyclingclub.com/rides",
        cadence: "Weekly",
        schedule: "Saturdays; time varies",
        distance: "45 to 80 miles",
        distanceMinMiles: 45,
        distanceMaxMiles: 80,
        pace: "17 to 23 mph depending on group",
        terrain: "Longer Westside road routes with bigger elevation days",
        dropPolicy: "Grouped by pace with post-ride regrouping",
        startLocation: "Check club Strava / WhatsApp",
        access: "Club ride",
        summary:
          "The flagship Domestique Saturday with separate tempo and social groups.",
        notes:
          "Route, elevation, leaders, and start location change weekly and are posted through the club channels.",
        tags: ["Saturday", "Long ride", "Tempo", "Social option"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
      {
        id: "domestique-brentwood-hills",
        title: "Brentwood Hills",
        organizer: "Domestique Cycling Club",
        regionSlug: "los-angeles",
        metroArea: "West Los Angeles",
        sourceType: "Club recurring ride",
        sourceLabel: "Domestique weekly rides",
        sourceUrl: "https://www.domestiquecyclingclub.com/rides",
        cadence: "Weekly",
        schedule: "Sundays at 7:55 AM",
        distance: "About 16 to 25 miles",
        distanceMinMiles: 16,
        distanceMaxMiles: 25,
        pace: "14 to 16 mph",
        terrain: "Brentwood and Mandeville climbing loop",
        dropPolicy: "Regroups at the tops",
        startLocation: "goodboybob Santa Monica",
        access: "Club ride",
        summary:
          "Compact but real elevation, making it a useful LA hills ride without a huge time commitment.",
        notes:
          "The ride finishes back at goodboybob for coffee.",
        tags: ["Sunday", "Climbing", "Westside", "Coffee stop"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
      {
        id: "la-wheelmen-sunday-rides",
        title: "LA Wheelmen Sunday Club Rides",
        organizer: "Los Angeles Wheelmen",
        regionSlug: "los-angeles",
        metroArea: "Los Angeles",
        sourceType: "Club recurring ride",
        sourceLabel: "Ride with the Los Angeles Wheelmen",
        sourceUrl: "https://www.lawheelmen.org/home/",
        cadence: "Weekly",
        schedule: "Sunday mornings from varying LA- and OC-area starts",
        distance: "Short 25-35, medium 35-55, longer options beyond that",
        distanceMinMiles: 25,
        distanceMaxMiles: 55,
        pace: "Leisurely through ambitious options",
        terrain: "Road rides with short, medium, and long options",
        dropPolicy: "Club policy is to stay together and keep track of riders",
        startLocation: "Varies by route sheet",
        access: "Guests welcome",
        summary:
          "One of the region's deepest Sunday road traditions, with multiple route lengths and a strong club format.",
        notes:
          "The club posts route sheets weekly and explicitly welcomes guests on all rides.",
        tags: ["Sunday", "Classic club", "Multi-distance", "Guests welcome"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
      {
        id: "la-wheelmen-south-beach-ride",
        title: "South Beach Ride",
        organizer: "Los Angeles Wheelmen",
        regionSlug: "los-angeles",
        metroArea: "West Los Angeles",
        sourceType: "Club recurring ride",
        sourceLabel: "LA Wheelmen upcoming rides",
        sourceUrl: "https://www.lawheelmen.org/upcoming-rides/",
        cadence: "Weekly",
        schedule: "Thursdays at 8:30 AM unless otherwise specified",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Steady group road pace",
        terrain: "Bike path south to Palos Verdes with optional climbs",
        dropPolicy: "Check the posted route sheet",
        startLocation: "Ballona Creek Bridge, Marina del Rey area",
        access: "Guests welcome",
        summary:
          "A good Westside weekday option for riders who want bike-path access plus peninsula climbing choices.",
        notes:
          "The current source says riders usually go south to Palos Verdes and stop around Golden Cove.",
        tags: ["Thursday", "Westside", "Road", "Club ride"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [4],
        },
      },
      {
        id: "incycle-pasadena-foo-chow",
        title: "FOO CHOW Ride",
        organizer: "Incycle Pasadena",
        regionSlug: "los-angeles",
        metroArea: "Pasadena",
        sourceType: "Shop recurring ride",
        sourceLabel: "Incycle Pasadena FOO CHOW Ride",
        sourceUrl: "https://www.incycle.com/pages/retail-event/foo-chow-ride",
        cadence: "1st and 3rd Tuesday of the month",
        schedule: "Meet 6:45 PM, roll 7:00 PM",
        distance: "25 to 35 miles",
        distanceMinMiles: 25,
        distanceMaxMiles: 35,
        pace: "Medium to spicy",
        terrain: "Road ride with varying route and major-turn regroups",
        dropPolicy: "Regroups at all major turns or after long climbs",
        startLocation: "Incycle Pasadena, 175 S Fair Oaks Ave",
        access: "Open shop ride",
        summary:
          "A long-running Pasadena night ride for riders who want something quicker but still regrouped.",
        notes:
          "The page says the ride has been going since 2007.",
        tags: ["Night ride", "Pasadena", "Road", "Shop ride"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "monthly-nth-weekdays",
          weekday: 2,
          nthWeeks: [1, 3],
        },
      },
      {
        id: "incycle-pasadena-sunday-morning",
        title: "Sunday Morning Riders",
        organizer: "Incycle Pasadena",
        regionSlug: "los-angeles",
        metroArea: "Pasadena",
        sourceType: "Shop recurring ride",
        sourceLabel: "Incycle Pasadena Sunday Morning Riders",
        sourceUrl: "https://www.incycle.com/pages/retail-event/sunday-morning-riders",
        cadence: "Weekly",
        schedule: "Sundays at 8:00 AM",
        distance: "About 15 to 20 miles",
        distanceMinMiles: 15,
        distanceMaxMiles: 20,
        pace: "No-drop social pace",
        terrain: "Road ride around Pasadena",
        dropPolicy: "No-drop",
        startLocation: "Incycle Pasadena, 175 S Fair Oaks Ave",
        access: "Open shop ride",
        summary:
          "A short Pasadena Sunday ride for riders who want a shop-led no-drop option.",
        notes:
          "The source says rides are about two hours and no-drop.",
        tags: ["Sunday", "No-drop", "Pasadena", "Shorter ride"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
    ],
  },
  {
    slug: "santa-clarita",
    label: "Santa Clarita",
    blurb:
      "Focused on Santa Clarita valley club rides and recurring shop-led routes out of Valencia.",
    status: "live",
    rides: [
      {
        id: "sc-velo-saturday",
        title: "Santa Clarita Velo Saturday Morning Ride",
        organizer: "Santa Clarita Velo powered by CBS Cycling",
        regionSlug: "santa-clarita",
        metroArea: "Santa Clarita Valley",
        sourceType: "Club recurring ride",
        sourceLabel: "Santa Clarita Velo Saturday Morning Ride",
        sourceUrl: "https://www.santaclaritavelo.org/series/saturday-morning-ride/",
        cadence: "Weekly",
        schedule: "Saturdays, generally 8:00 AM to 2:00 PM",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Challenging club pace",
        terrain: "Road routes from Valencia with tougher Saturday focus",
        dropPolicy: "Check the club Strava route for the week",
        startLocation: "Promenade Shopping Center parking lot, Valencia",
        access: "Open club ride; check Strava for current route and time",
        summary:
          "The club's tougher weekend ride, anchored in the Santa Clarita Valley road scene.",
        notes:
          "The source series page shows repeated Saturday events in 2026, while the home page says ride times shift with weather.",
        tags: ["Saturday", "Club ride", "Valencia", "Road"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
      {
        id: "sc-velo-sunday-no-drop",
        title: "Santa Clarita Velo Sunday No-Drop Ride",
        organizer: "Santa Clarita Velo powered by CBS Cycling",
        regionSlug: "santa-clarita",
        metroArea: "Santa Clarita Valley",
        sourceType: "Club recurring ride",
        sourceLabel: "Santa Clarita Velo home page",
        sourceUrl: "https://www.santaclaritavelo.org/",
        cadence: "Weekly",
        schedule: "Sundays, generally between 7:00 AM and 8:00 AM depending on weather",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Social no-drop",
        terrain: "Road routes from Valencia",
        dropPolicy: "No-drop",
        startLocation: "Promenade Shopping Center parking lot, Valencia",
        access: "Open club ride; current route posted on Strava",
        summary:
          "The club's more approachable Sunday option for riders who want the Santa Clarita group without the harder Saturday pace.",
        notes:
          "The home page explicitly says Sunday rides are no-drop.",
        tags: ["Sunday", "No-drop", "Valencia", "Road"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
      {
        id: "cbs-cycling-saturday",
        title: "CBS Cycling Saturday Morning Group Ride",
        organizer: "CBS Cycling",
        regionSlug: "santa-clarita",
        metroArea: "Santa Clarita Valley",
        sourceType: "Club recurring ride",
        sourceLabel: "CBS Cycling club page",
        sourceUrl: "https://cbscycling.com/the-club",
        cadence: "Weekly",
        schedule: "Saturday mornings; route emailed weekly through Strava group",
        distance: "Varies",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Varies by route",
        terrain: "Road, gravel, or mountain depending on route",
        dropPolicy: "Group safety first; check weekly route details",
        startLocation: "Santa Clarita area via Strava group details",
        access: "Join the Strava group ride for weekly route details",
        summary:
          "A flexible Santa Clarita community ride series that can span multiple disciplines.",
        notes:
          "The club page says the weekly Saturday route changes and is distributed through the Strava group.",
        tags: ["Saturday", "Multi-discipline", "Community", "Strava-fed"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
      {
        id: "incycle-santa-clarita-canyon",
        title: "Incycle Santa Clarita Sunday Canyon Ride",
        organizer: "Incycle Santa Clarita",
        regionSlug: "santa-clarita",
        metroArea: "Santa Clarita Valley",
        sourceType: "Shop recurring ride",
        sourceLabel: "Incycle Santa Clarita Canyon Ride",
        sourceUrl: "https://www.incycle.com/pages/retail-event/incycle-santa-clarita-sunday-road-canyon-ride",
        cadence: "Weekly",
        schedule: "Sundays at 7:00 AM",
        distance: "Varies by canyon route",
        distanceMinMiles: null,
        distanceMaxMiles: null,
        pace: "Scenic shop ride pace",
        terrain: "Road canyon ride",
        dropPolicy: "No-drop with regroup points if necessary",
        startLocation: "Incycle Santa Clarita, 23360 Cinema Dr, Valencia",
        access: "Open shop ride",
        summary:
          "A recurring Valencia shop ride for riders who want a reliable Sunday road start in Santa Clarita.",
        notes:
          "The official event page describes the ride as no-drop with regroup points if necessary.",
        tags: ["Sunday", "No-drop", "Shop ride", "Canyon route"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0],
        },
      },
    ],
  },
  {
    slug: "riverside",
    label: "Riverside",
    blurb:
      "Built around Riverside Bicycle Club standing rides plus Inland Empire shop-led weeknight and Saturday options.",
    status: "live",
    rides: [
      {
        id: "rbc-weekly-club-rides",
        title: "Riverside Bicycle Club Weekly Club Rides",
        organizer: "Riverside Bicycle Club",
        regionSlug: "riverside",
        metroArea: "Riverside / Inland Empire",
        sourceType: "Club standing rides",
        sourceLabel: "RBC weekly club rides",
        sourceUrl: "https://www.riversidebicycleclub.com/page-1379195",
        cadence: "Multiple days each week",
        schedule: "Sunday, Tuesday, Thursday, and Saturday standing rides; time shifts seasonally",
        distance: "15 to 60 miles depending on group",
        distanceMinMiles: 15,
        distanceMaxMiles: 60,
        pace: "10 to 21 mph depending on group",
        terrain: "Flat to difficult, depending on route and group",
        dropPolicy: "Varies by group",
        startLocation: "Downtown Riverside, Lincoln & Mary, or Canyon Crest depending on day",
        access: "Open to the public",
        summary:
          "The backbone Inland Empire club calendar, with multiple standing ride days and clearly defined ability groups.",
        notes:
          "Morning rides run 7:30 AM October through April and 8:00 AM May through September; evening B-group rides begin at 6:30 PM.",
        tags: ["Multi-day", "Inland Empire", "Standing rides", "All levels"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [0, 2, 4, 6],
        },
      },
      {
        id: "rbc-saturday-road-ride",
        title: "RBC Saturday Morning Road Ride",
        organizer: "Riverside Bicycle Club",
        regionSlug: "riverside",
        metroArea: "Riverside / Inland Empire",
        sourceType: "Club recurring ride",
        sourceLabel: "RBC Saturday Morning Road Ride",
        sourceUrl: "https://www.riversidebicycleclub.com/page-1447570",
        cadence: "Weekly",
        schedule: "Saturdays; 7:30 AM May through September, 8:00 AM October through April",
        distance: "Under 20 miles for casual group; 25 to 45+ for faster groups",
        distanceMinMiles: 15,
        distanceMaxMiles: 45,
        pace: "10 to 18+ mph depending on group",
        terrain: "Mostly flat casual routes or moderate-to-steep hill routes for faster groups",
        dropPolicy: "Frequent regroups for the casual group; regroups as necessary for faster groups",
        startLocation: "Canyon Crest Towne Centre or Stater Bros at Lincoln & Mary",
        access: "Open club ride",
        summary:
          "The clearest entry point into the Riverside Bicycle Club, with a casual option and faster A/B/C groups.",
        notes:
          "The casual D/E ride is positioned for first-time or returning cyclists and avoids hills where possible.",
        tags: ["Saturday", "Beginner option", "Inland Empire", "Road"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
      {
        id: "incycle-rancho-monday",
        title: "Incycle Rancho Cucamonga Monday Night Ride",
        organizer: "Incycle Rancho Cucamonga",
        regionSlug: "riverside",
        metroArea: "Rancho Cucamonga / Inland Empire",
        sourceType: "Shop recurring ride",
        sourceLabel: "Incycle Rancho Monday Night Ride",
        sourceUrl: "https://www.incycle.com/pages/retail-event/incycle-rancho-cucamonga-monday-night-ride",
        cadence: "Weekly",
        schedule: "Mondays; meet 6:00 PM, roll 6:15 PM",
        distance: "18 miles",
        distanceMinMiles: 18,
        distanceMaxMiles: 18,
        pace: "Moderate",
        terrain: "Road ride with three regroups",
        dropPolicy: "Regroup ride",
        startLocation: "Incycle Rancho Cucamonga, 9110 Foothill Blvd",
        access: "Open shop ride",
        summary:
          "A reliable Inland Empire weeknight road ride with a manageable distance and explicit regrouping.",
        notes:
          "The event page excludes rainy or high-wind evenings.",
        tags: ["Monday", "Shop ride", "Regroups", "Inland Empire"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [1],
        },
      },
      {
        id: "incycle-chino-cow-ride",
        title: "Cow Ride",
        organizer: "Incycle Chino",
        regionSlug: "riverside",
        metroArea: "Chino / Inland Empire",
        sourceType: "Shop recurring ride",
        sourceLabel: "Incycle Chino Cow Ride",
        sourceUrl: "https://www.incycle.com/pages/retail-event/cow-ride-every-saturday-morning",
        cadence: "Weekly",
        schedule: "Saturdays at 8:00 AM",
        distance: "24 miles",
        distanceMinMiles: 24,
        distanceMaxMiles: 24,
        pace: "Moderate",
        terrain: "Road ride with rolling terrain",
        dropPolicy: "Shop ride; confirm current route day-of",
        startLocation: "Incycle Chino, 12345 Mountain Ave",
        access: "Open shop ride",
        summary:
          "A shorter Inland Empire Saturday road ride that works well for riders who want a moderate shop-group format.",
        notes:
          "The official page says the route is usually 24 miles, with a longer annual customer-appreciation variation.",
        tags: ["Saturday", "Shop ride", "Moderate", "Road"],
        verifiedOn: "2026-05-02",
        recurrence: {
          kind: "weekly",
          weekdays: [6],
        },
      },
    ],
  },
];

const rideCoordinatesById: Record<string, RideCoordinate> = {
  "bike-east-bay-group-ride-series": { latitude: 37.8044, longitude: -122.2711, locationPrecision: "metro" },
  "grizzly-peak-tuesday-night-ride": { latitude: 37.8894, longitude: -122.2516, locationPrecision: "approximate" },
  "marin-red-whale-sunday": { latitude: 37.9735, longitude: -122.5311, locationPrecision: "approximate" },
  "marin-wednesday-gravel": { latitude: 37.9731, longitude: -122.5319, locationPrecision: "approximate" },
  "western-wheelers-monday-coffee": { latitude: 37.3994, longitude: -122.1084, locationPrecision: "approximate" },
  "western-wheelers-seal-point": { latitude: 37.5845, longitude: -122.3182, locationPrecision: "approximate" },
  "western-wheelers-tuesday-evening": { latitude: 37.429, longitude: -122.2539, locationPrecision: "approximate" },
  "fat-cake-ftwnb": { latitude: 37.7715, longitude: -122.4687, locationPrecision: "approximate" },
  "fat-cake-headlands": { latitude: 37.8078, longitude: -122.475, locationPrecision: "approximate" },
  "ornot-after-cake": { latitude: 37.7832, longitude: -122.4603, locationPrecision: "exact" },
  "pas-normal-sf-weekly": { latitude: 37.7692, longitude: -122.4314, locationPrecision: "exact" },
  "actc-ride-calendar": { latitude: 37.3382, longitude: -121.8863, locationPrecision: "metro" },
  "mikes-bikes-community-events": { latitude: 37.332, longitude: -121.8904, locationPrecision: "metro" },
  "sf-group-rides-calendar": { latitude: 37.7749, longitude: -122.4194, locationPrecision: "metro" },
  "sf-bike-coalition-events": { latitude: 37.7766, longitude: -122.4174, locationPrecision: "approximate" },
  "bike-east-bay-group-rides-category": { latitude: 37.8044, longitude: -122.2711, locationPrecision: "metro" },
  "ridepanda-bay-area-calendar": { latitude: 37.7749, longitude: -122.4194, locationPrecision: "metro" },
  "bay-area-cycling-meetup": { latitude: 37.7749, longitude: -122.4194, locationPrecision: "metro" },
  "bay-area-road-biking-meetup": { latitude: 37.3688, longitude: -122.0363, locationPrecision: "metro" },
  "bespoke-cycles-sf-rides": { latitude: 37.7803, longitude: -122.458, locationPrecision: "approximate" },
  "different-spokes-sf-calendar": { latitude: 37.7749, longitude: -122.4194, locationPrecision: "metro" },
  "rapha-sf-events": { latitude: 37.7826, longitude: -122.4107, locationPrecision: "approximate" },
  "fat-cake-club-strava": { latitude: 37.7749, longitude: -122.4194, locationPrecision: "metro" },
  "berkeley-bike-club-weekly": { latitude: 37.8708, longitude: -122.2681, locationPrecision: "metro" },
  "oakland-yellow-jackets-calendar": { latitude: 37.8044, longitude: -122.2711, locationPrecision: "metro" },
  "veloraptors-rides-routes": { latitude: 37.8044, longitude: -122.2711, locationPrecision: "metro" },
  "street-level-cycling-club-calendar": { latitude: 37.8044, longitude: -122.2711, locationPrecision: "metro" },
  "cherry-city-cyclists-calendar": { latitude: 37.7749, longitude: -122.4194, locationPrecision: "metro" },
  "valley-spokesmen-calendar": { latitude: 37.7022, longitude: -121.9358, locationPrecision: "metro" },
  "penvelo-summit-group-rides": { latitude: 37.4419, longitude: -122.143, locationPrecision: "metro" },
  "alto-velo-other-group-rides": { latitude: 37.4419, longitude: -122.143, locationPrecision: "metro" },
  "silicon-valley-bike-clubs-directory": { latitude: 37.3382, longitude: -121.8863, locationPrecision: "metro" },
  "sdbc-saturday-club-ride": { latitude: 32.8328, longitude: -117.2713, locationPrecision: "approximate" },
  "sd-recyclers-sunday": { latitude: 32.7157, longitude: -117.1611, locationPrecision: "metro" },
  "cyclo-vets-saturday-a": { latitude: 32.7665, longitude: -117.205, locationPrecision: "approximate" },
  "cyclo-vets-wednesday-coffee": { latitude: 32.7665, longitude: -117.205, locationPrecision: "approximate" },
  "descenders-weekly-schedule": { latitude: 32.7157, longitude: -117.1611, locationPrecision: "metro" },
  "domestique-golden-hour": { latitude: 34.0195, longitude: -118.4912, locationPrecision: "approximate" },
  "domestique-coffee-ride": { latitude: 34.0195, longitude: -118.4912, locationPrecision: "approximate" },
  "domestique-all-club": { latitude: 34.0195, longitude: -118.4912, locationPrecision: "metro" },
  "domestique-brentwood-hills": { latitude: 34.0195, longitude: -118.4912, locationPrecision: "approximate" },
  "la-wheelmen-sunday-rides": { latitude: 34.0522, longitude: -118.2437, locationPrecision: "metro" },
  "la-wheelmen-south-beach-ride": { latitude: 33.9765, longitude: -118.442, locationPrecision: "approximate" },
  "incycle-pasadena-foo-chow": { latitude: 34.1439, longitude: -118.1498, locationPrecision: "exact" },
  "incycle-pasadena-sunday-morning": { latitude: 34.1439, longitude: -118.1498, locationPrecision: "exact" },
  "sc-velo-saturday": { latitude: 34.4156, longitude: -118.5513, locationPrecision: "approximate" },
  "sc-velo-sunday-no-drop": { latitude: 34.4156, longitude: -118.5513, locationPrecision: "approximate" },
  "cbs-cycling-saturday": { latitude: 34.4138, longitude: -118.551, locationPrecision: "metro" },
  "incycle-santa-clarita-canyon": { latitude: 34.4175, longitude: -118.561, locationPrecision: "exact" },
  "rbc-weekly-club-rides": { latitude: 33.9806, longitude: -117.3755, locationPrecision: "metro" },
  "rbc-saturday-road-ride": { latitude: 33.9468, longitude: -117.3281, locationPrecision: "approximate" },
  "incycle-rancho-monday": { latitude: 34.1064, longitude: -117.5931, locationPrecision: "exact" },
  "incycle-chino-cow-ride": { latitude: 34.016, longitude: -117.6898, locationPrecision: "approximate" },
};

export function getSeedRideRegions() {
  return seedRideRegions.map((region) => ({
    ...region,
    rides: region.rides.map((ride) => {
      const coordinate = rideCoordinatesById[ride.id];
      return {
        ...ride,
        tags: [...ride.tags],
        latitude: coordinate?.latitude ?? null,
        longitude: coordinate?.longitude ?? null,
        locationPrecision: coordinate?.locationPrecision ?? "unknown",
      };
    }),
  }));
}

export function buildRideDirectorySnapshot(
  today = new Date(),
  options: {
    generatedAt?: string;
    syncSummary?: RideSyncSummary;
    sourceReports?: RideSourceReport[];
  } = {}
): RideDirectorySnapshot {
  const todayKey = toDateKey(today);
  const regions = getSeedRideRegions();
  const rides = regions.flatMap((region) =>
    region.rides.map((ride) => {
      const nextOccurrenceDate = computeNextOccurrenceDate(ride, todayKey);
      return {
        ...ride,
        nextOccurrenceDate,
        nextOccurrenceLabel: formatOccurrenceLabel(nextOccurrenceDate),
      } satisfies DerivedRideListing;
    })
  );

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    regions,
    rides,
    syncSummary: options.syncSummary,
    sourceReports: options.sourceReports,
  };
}
