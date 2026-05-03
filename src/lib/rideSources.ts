import { getSeedRideRegions, type RideRegionSlug } from "./groupRides.ts";

export type RideSourceParserType = "recurring-page" | "calendar-page" | "shop-event-page" | "community-page";
export type RideSourceSyncMode = "crawl" | "manual" | "api_reference";

export type RideSourceIntegration =
  | {
      provider: "meetup";
      accessTokenEnv: string;
      networkUrlnameEnv: string;
      maxEvents?: number;
    }
  | {
      provider: "strava";
      accessTokenEnv: string;
      clubIdEnv: string;
      maxActivities?: number;
    }
  | {
      provider: "ridewithgps";
      apiKeyEnv: string;
      accessTokenEnv?: string;
      authTokenEnv?: string;
      eventsUrlEnv: string;
      maxEvents?: number;
    };

export type RideSourceRegistryEntry = {
  id: string;
  rideId: string | null;
  regionSlug: RideRegionSlug;
  organizer: string;
  label: string;
  url: string;
  crawlUrl?: string;
  parserType: RideSourceParserType;
  trustLevel: "official" | "community";
  syncMode: RideSourceSyncMode;
  integration?: RideSourceIntegration;
  notes?: string;
};

const rideSourceOverrides: Partial<Record<string, Partial<RideSourceRegistryEntry>>> = {
  "domestique-golden-hour": {
    crawlUrl: "https://www.domestiquecyclingclub.com/",
  },
  "domestique-coffee-ride": {
    crawlUrl: "https://www.domestiquecyclingclub.com/",
  },
  "domestique-all-club": {
    crawlUrl: "https://www.domestiquecyclingclub.com/",
  },
  "domestique-brentwood-hills": {
    crawlUrl: "https://www.domestiquecyclingclub.com/",
  },
};

function inferParserType(sourceType: string): RideSourceParserType {
  const normalized = sourceType.toLowerCase();
  if (normalized.includes("calendar")) return "calendar-page";
  if (normalized.includes("shop")) return "shop-event-page";
  if (normalized.includes("community")) return "community-page";
  return "recurring-page";
}

function inferTrustLevel(sourceType: string): "official" | "community" {
  return sourceType.toLowerCase().includes("community") ? "community" : "official";
}

const extraSourceRegistryEntries: RideSourceRegistryEntry[] = [
  {
    id: "source-bike-east-bay-events",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Bike East Bay",
    label: "Bike East Bay events hub",
    url: "https://bikeeastbay.org/events/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "General Bike East Bay events hub.",
  },
  {
    id: "source-la-wheelmen-upcoming-rides",
    rideId: null,
    regionSlug: "los-angeles",
    organizer: "Los Angeles Wheelmen",
    label: "LA Wheelmen upcoming rides",
    url: "https://www.lawheelmen.org/upcoming-rides/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Supplemental LA Wheelmen calendar page.",
  },
  {
    id: "source-riverside-bicycle-club-home",
    rideId: null,
    regionSlug: "riverside",
    organizer: "Riverside Bicycle Club",
    label: "Riverside Bicycle Club home",
    url: "https://www.riversidebicycleclub.com/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Supplemental Riverside Bicycle Club home page.",
  },
  {
    id: "source-sf-rides-tockify",
    rideId: "sf-group-rides-calendar",
    regionSlug: "bay-area",
    organizer: "Bay Area Rides / SF Group Rides",
    label: "San Francisco Group Rides calendar",
    url: "https://tockify.com/sanfranciscorides/",
    parserType: "calendar-page",
    trustLevel: "community",
    syncMode: "crawl",
    notes: "Strong Bay Area ride aggregator calendar.",
  },
  {
    id: "source-bay-area-rides-home",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Bay Area Rides",
    label: "BayAreaRides home",
    url: "https://bayarearides.org",
    parserType: "calendar-page",
    trustLevel: "community",
    syncMode: "crawl",
    notes: "Primary Bay Area group ride discovery site and companion source to the SF Group Rides calendar.",
  },
  {
    id: "source-sf-bike-events",
    rideId: "sf-bike-coalition-events",
    regionSlug: "bay-area",
    organizer: "San Francisco Bicycle Coalition",
    label: "SF Bike events",
    url: "https://sfbike.org/events/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "manual",
    notes: "Official SF Bike events and rides. Server-side crawl is blocked by Cloudflare, so this remains a manual source until an official feed is available.",
  },
  {
    id: "source-bike-east-bay-group-rides-category",
    rideId: "bike-east-bay-group-rides-category",
    regionSlug: "bay-area",
    organizer: "Bike East Bay",
    label: "Bike East Bay group rides category",
    url: "https://bikeeastbay.org/events/category/group-rides/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "East Bay group rides category page.",
  },
  {
    id: "source-ridepanda-bay-area-calendar",
    rideId: "ridepanda-bay-area-calendar",
    regionSlug: "bay-area",
    organizer: "Ridepanda",
    label: "Ridepanda Bay Area bike event calendar",
    url: "https://www.ridepanda.com/blog/bay-area-bike-event-calendar",
    parserType: "calendar-page",
    trustLevel: "community",
    syncMode: "crawl",
    notes: "Aggregator source; verify rides at organizer source where possible.",
  },
  {
    id: "source-meetup-cycling-topic",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Meetup",
    label: "Meetup cycling topic directory",
    url: "https://www.meetup.com/topics/cycling/",
    parserType: "community-page",
    trustLevel: "community",
    syncMode: "manual",
    notes: "General discovery page for cycling groups.",
  },
  {
    id: "source-bay-area-cycling-meetup",
    rideId: "bay-area-cycling-meetup",
    regionSlug: "bay-area",
    organizer: "Bay Area Cycling Meetup",
    label: "Bay Area Cycling Meetup",
    url: "https://www.meetup.com/bayareacycling/",
    parserType: "community-page",
    trustLevel: "community",
    syncMode: "manual",
    integration: {
      provider: "meetup",
      accessTokenEnv: "MEETUP_ACCESS_TOKEN",
      networkUrlnameEnv: "MEETUP_BAY_AREA_CYCLING_NETWORK_URLNAME",
      maxEvents: 8,
    },
    notes: "Meetup group; use official API or manual verification.",
  },
  {
    id: "source-bay-area-road-biking-meetup",
    rideId: "bay-area-road-biking-meetup",
    regionSlug: "bay-area",
    organizer: "Bay Area Road Biking Meetup",
    label: "Bay Area Road Biking Meetup",
    url: "https://www.meetup.com/sunnyvale-los-altos-road-biking/",
    parserType: "community-page",
    trustLevel: "community",
    syncMode: "manual",
    integration: {
      provider: "meetup",
      accessTokenEnv: "MEETUP_ACCESS_TOKEN",
      networkUrlnameEnv: "MEETUP_BAY_AREA_ROAD_BIKING_NETWORK_URLNAME",
      maxEvents: 8,
    },
    notes: "Peninsula/South Bay road cycling Meetup.",
  },
  {
    id: "source-bespoke-cycles-rides",
    rideId: "bespoke-cycles-sf-rides",
    regionSlug: "bay-area",
    organizer: "Bespoke Cycles SF",
    label: "Bespoke Cycles SF rides",
    url: "https://www.bespokecyclessf.com/rides",
    parserType: "shop-event-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "SF shop ride page with Saturday no-drop ride.",
  },
  {
    id: "source-different-spokes-calendar",
    rideId: "different-spokes-sf-calendar",
    regionSlug: "bay-area",
    organizer: "Different Spokes",
    label: "Different Spokes SF ride calendar",
    url: "https://www.dssf.org/content.aspx?club_id=17789&page_id=4001",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "SF cycling and social club ride calendar.",
  },
  {
    id: "source-rapha-cycle-club-sf-dothebay",
    rideId: "rapha-sf-events",
    regionSlug: "bay-area",
    organizer: "Rapha Cycle Club San Francisco",
    label: "Rapha Cycle Club SF via DoTheBay",
    url: "https://dothebay.com/venues/rapha-cycle-club",
    parserType: "calendar-page",
    trustLevel: "community",
    syncMode: "crawl",
    notes: "Useful discovery page; verify directly with Rapha where possible.",
  },
  {
    id: "source-fat-cake-strava",
    rideId: "fat-cake-club-strava",
    regionSlug: "bay-area",
    organizer: "Fat Cake Club",
    label: "Fat Cake Club rides",
    url: "https://www.fatcake.cc/rides",
    parserType: "recurring-page",
    trustLevel: "community",
    syncMode: "crawl",
    integration: {
      provider: "strava",
      accessTokenEnv: "STRAVA_ACCESS_TOKEN",
      clubIdEnv: "STRAVA_FAT_CAKE_CLUB_ID",
      maxActivities: 8,
    },
    notes: "Public rides page for daily crawl, with optional Strava integration for richer club data when OAuth is configured.",
  },
  {
    id: "source-fat-cake-chronicle-profile",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "SF Chronicle",
    label: "Fat Cake SF Chronicle profile",
    url: "https://www.sfchronicle.com/totalsf/article/fat-cake-bike-club-22062754.php",
    parserType: "community-page",
    trustLevel: "community",
    syncMode: "manual",
    notes: "Background/profile source, not a live event feed.",
  },
  {
    id: "source-grizzly-peak-home",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Grizzly Peak Cyclists",
    label: "Grizzly Peak Cyclists home",
    url: "https://www.grizz.org/",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Club overview and supplemental discovery.",
  },
  {
    id: "source-berkeley-bike-club-weekly",
    rideId: "berkeley-bike-club-weekly",
    regionSlug: "bay-area",
    organizer: "Berkeley Bicycle Club",
    label: "Berkeley Bicycle Club weekly group rides",
    url: "https://berkeleybikeclub.org/weekly-group-ride",
    parserType: "recurring-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Weekly recurring rides page.",
  },
  {
    id: "source-berkeley-bike-club-home",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Berkeley Bicycle Club",
    label: "Berkeley Bicycle Club home",
    url: "https://berkeleybikeclub.org/",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Club overview and supplemental discovery.",
  },
  {
    id: "source-oakland-yellow-jackets",
    rideId: "oakland-yellow-jackets-calendar",
    regionSlug: "bay-area",
    organizer: "Oakland Yellow Jackets",
    label: "Oakland Yellow Jackets",
    url: "https://oaklandyellowjackets.wildapricot.org/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Oakland club with calendar-linked rides.",
  },
  {
    id: "source-veloraptors-rides",
    rideId: "veloraptors-rides-routes",
    regionSlug: "bay-area",
    organizer: "VeloRaptors Cycling Club",
    label: "VeloRaptors rides and routes",
    url: "https://www.veloraptors.com/rides-routes/",
    parserType: "recurring-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "East Bay performance-oriented weekly ride info.",
  },
  {
    id: "source-street-level-cycling-club",
    rideId: "street-level-cycling-club-calendar",
    regionSlug: "bay-area",
    organizer: "Street Level Cycling Club",
    label: "Street Level Cycling Club ride calendar",
    url: "https://watersideworkshops.org/street-level-cycling-club-ride-calendar/",
    parserType: "calendar-page",
    trustLevel: "community",
    syncMode: "crawl",
    notes: "Beginner/intermediate recurring ride calendar.",
  },
  {
    id: "source-cherry-city-cyclists",
    rideId: "cherry-city-cyclists-calendar",
    regionSlug: "bay-area",
    organizer: "Cherry City Cyclists",
    label: "Cherry City Cyclists",
    url: "https://www.cherrycitycyclists.org/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Broader Bay Area club calendar.",
  },
  {
    id: "source-valley-spokesmen",
    rideId: "valley-spokesmen-calendar",
    regionSlug: "bay-area",
    organizer: "Valley Spokesmen Bicycle Club",
    label: "Valley Spokesmen Bicycle Club",
    url: "https://www.valleyspokesmen.org/",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Dublin/East Bay club with varied ride types.",
  },
  {
    id: "source-western-wheelers-rides-this-week",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Western Wheelers",
    label: "Western Wheelers rides this week",
    url: "https://westernwheelersbicycleclub.wildapricot.org/Rides-this-week",
    parserType: "calendar-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Near-term week-view supplement to main calendar.",
  },
  {
    id: "source-penvelo-group-rides",
    rideId: "penvelo-summit-group-rides",
    regionSlug: "bay-area",
    organizer: "Pen Velo / Summit Bicycles",
    label: "Pen Velo / Summit group rides",
    url: "https://penvelo.org/group-rides/",
    parserType: "recurring-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Peninsula fast road ride source.",
  },
  {
    id: "source-alto-velo-other-group-rides",
    rideId: "alto-velo-other-group-rides",
    regionSlug: "bay-area",
    organizer: "Alto Velo",
    label: "Alto Velo other group rides",
    url: "https://www.altovelo.org/other-group-rides",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Curated Peninsula/South Bay discovery list.",
  },
  {
    id: "source-silicon-valley-bike-clubs-directory",
    rideId: "silicon-valley-bike-clubs-directory",
    regionSlug: "bay-area",
    organizer: "Silicon Valley Bicycle Coalition",
    label: "SVBC local bike clubs directory",
    url: "https://bikesiliconvalley.org/resources/local-bike-clubs",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "manual",
    notes: "Directory source for future expansion and club discovery. Kept manual because it is a seed list, not a live ride feed, and can be bot-sensitive.",
  },
  {
    id: "source-meetup-graphql-api",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Meetup",
    label: "Meetup GraphQL API",
    url: "https://www.meetup.com/graphql/",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Official API docs for future integration.",
  },
  {
    id: "source-meetup-graphql-guide",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Meetup",
    label: "Meetup GraphQL API guide",
    url: "https://www.meetup.com/graphql/guide/",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Official Meetup GraphQL guide.",
  },
  {
    id: "source-strava-api-reference",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Strava",
    label: "Strava API reference",
    url: "https://developers.strava.com/docs/reference/",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Official Strava API reference with OAuth limitations.",
  },
  {
    id: "source-strava-api-getting-started",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Strava",
    label: "Strava API getting started",
    url: "https://developers.strava.com/docs/getting-started/",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Official Strava getting started docs.",
  },
  {
    id: "source-rwgps-events-api",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Ride with GPS",
    label: "Ride with GPS Events API",
    url: "https://ridewithgps.com/api/v1/doc/endpoints/events",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Official RWGPS events endpoint docs.",
  },
  {
    id: "source-rwgps-cycling-clubs",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Ride with GPS",
    label: "Ride with GPS cycling clubs",
    url: "https://ridewithgps.com/cycling-clubs",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "crawl",
    notes: "Discovery source for RWGPS-hosted club calendars.",
  },
  {
    id: "source-rwgps-club-events-live",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Ride with GPS",
    label: "Ride with GPS club events feed",
    url: "https://ridewithgps.com/api/v1/doc/endpoints/events",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "manual",
    integration: {
      provider: "ridewithgps",
      apiKeyEnv: "RWGPS_API_KEY",
      accessTokenEnv: "RWGPS_ACCESS_TOKEN",
      authTokenEnv: "RWGPS_AUTH_TOKEN",
      eventsUrlEnv: "RWGPS_EVENTS_URL",
      maxEvents: 10,
    },
    notes: "Authenticated Ride with GPS events integration when a live events endpoint URL is configured.",
  },
  {
    id: "source-rwgps-calendar-embed-doc",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Ride with GPS",
    label: "RWGPS club event calendar embed docs",
    url: "https://support.ridewithgps.com/hc/en-us/articles/4423201352731-Embed-the-Club-Event-Calendar",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Support docs for live-updating club calendar embeds.",
  },
  {
    id: "source-rwgps-club-management-doc",
    rideId: null,
    regionSlug: "bay-area",
    organizer: "Ride with GPS",
    label: "RWGPS club account management docs",
    url: "https://support.ridewithgps.com/hc/en-us/articles/19381884258203-Club-Account-Management",
    parserType: "community-page",
    trustLevel: "official",
    syncMode: "api_reference",
    notes: "Support docs for club events and management.",
  },
];

function getRegistryMergeKey(entry: Pick<RideSourceRegistryEntry, "rideId" | "url">) {
  return `${entry.rideId ?? "__none__"}::${entry.url}`;
}

export function getRideSourceRegistry() {
  const mergedEntries = new Map<string, RideSourceRegistryEntry>();

  const derivedEntries: RideSourceRegistryEntry[] = getSeedRideRegions().flatMap((region) =>
    region.rides.map((ride) => ({
      id: `source-${ride.id}`,
      rideId: ride.id,
      regionSlug: region.slug,
      organizer: ride.organizer,
      label: ride.sourceLabel,
      url: ride.sourceUrl,
      parserType: inferParserType(ride.sourceType),
      trustLevel: inferTrustLevel(ride.sourceType),
      syncMode: "crawl" as const,
      integration: undefined,
      ...rideSourceOverrides[ride.id],
    }))
  );

  for (const entry of derivedEntries) {
    mergedEntries.set(getRegistryMergeKey(entry), entry);
  }

  for (const entry of extraSourceRegistryEntries) {
    const key = getRegistryMergeKey(entry);
    const existing = mergedEntries.get(key);
    mergedEntries.set(key, existing ? { ...existing, ...entry } : entry);
  }

  return [...mergedEntries.values()];
}
