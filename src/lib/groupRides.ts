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
  fetchedAt: string;
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
};

export type RideSyncSummary = {
  generatedAt: string;
  sourceCount: number;
  successfulSourceCount: number;
  failedSourceCount: number;
  persisted: boolean;
};

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

const seedRideRegions: RideRegion[] = [
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

export function getSeedRideRegions() {
  return seedRideRegions.map((region) => ({
    ...region,
    rides: region.rides.map((ride) => ({ ...ride, tags: [...ride.tags] })),
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
