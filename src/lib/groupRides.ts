export type RideRegionSlug =
  | "bay-area"
  | "san-diego"
  | "los-angeles"
  | "santa-clarita"
  | "riverside";

export type RideListing = {
  id: string;
  title: string;
  organizer: string;
  metroArea: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl: string;
  cadence: string;
  schedule: string;
  distance: string;
  pace: string;
  terrain: string;
  dropPolicy: string;
  startLocation: string;
  access: string;
  summary: string;
  notes: string;
  tags: string[];
  verifiedOn: string;
};

export type RideRegion = {
  slug: RideRegionSlug;
  label: string;
  blurb: string;
  status: "live" | "planned";
  rides: RideListing[];
};

export const rideRegions: RideRegion[] = [
  {
    slug: "bay-area",
    label: "Bay Area",
    blurb:
      "Curated first. These listings favor official club calendars, advocacy org pages, recurring shop rides, and active community ride pages.",
    status: "live",
    rides: [
      {
        id: "bike-east-bay-group-ride-series",
        title: "Bike East Bay Group Ride Series",
        organizer: "Bike East Bay",
        metroArea: "East Bay",
        sourceType: "Advocacy calendar",
        sourceLabel: "Bike East Bay 2026 Ride Series",
        sourceUrl: "https://bikeeastbay.org/annual-ride-series/",
        cadence: "Usually monthly",
        schedule: "Generally the 3rd Saturday, 11:00 AM to 2:00 PM, with some exceptions",
        distance: "Varies by route",
        pace: "Social",
        terrain: "Road and mixed urban paths; all bikes welcome",
        dropPolicy: "No-drop",
        startLocation: "Varies; recent starts include Hayward BART and Oakland",
        access: "Public events",
        summary:
          "Beginner-friendly East Bay ride series run by the region's main bike advocacy group.",
        notes:
          "Good starting point for riders who want a scheduled, social, transit-friendly group ride.",
        tags: ["Beginner-friendly", "Transit-friendly", "No-drop", "Monthly"],
        verifiedOn: "2026-05-02",
      },
      {
        id: "grizzly-peak-tuesday-night-ride",
        title: "GPC Tuesday Night Ride - Brisk Group",
        organizer: "Grizzly Peak Cyclists",
        metroArea: "East Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "Grizzly Peak Cyclists rides page",
        sourceUrl: "https://www.grizz.org/rides/",
        cadence: "Weekly",
        schedule: "Tuesdays; meet 5:25 PM, roll 5:35 PM",
        distance: "32 miles",
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
      },
      {
        id: "marin-red-whale-sunday",
        title: "Easy Like Sunday Morning",
        organizer: "Marin Cyclists",
        metroArea: "Marin",
        sourceType: "Club recurring ride",
        sourceLabel: "Marin Cyclists recurring Sunday ride",
        sourceUrl:
          "https://marincyclists.com/content.aspx?club_id=525458&item_id=2804074&page_id=4002",
        cadence: "Weekly",
        schedule: "Sundays; meet 9:45 AM, roll 10:00 AM",
        distance: "30 to 35 miles",
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
      },
      {
        id: "marin-wednesday-gravel",
        title: "Wednesday Decide & Ride Gravel",
        organizer: "Marin Cyclists",
        metroArea: "Marin",
        sourceType: "Club recurring ride",
        sourceLabel: "Marin Cyclists Wednesday gravel ride",
        sourceUrl:
          "https://www.marincyclists.com/content.aspx?club_id=525458&item_id=2908301&page_id=4091",
        cadence: "Weekly",
        schedule: "Wednesdays; meet 9:00 AM",
        distance: "40 to 60 miles",
        pace: "Moderate to strong",
        terrain: "Gravel and mixed-terrain routes in Marin and nearby hills",
        dropPolicy: "Regroups as necessary",
        startLocation: "Pink Owl Coffee, San Rafael",
        access: "Pre-registration requested; members and non-members welcome",
        summary:
          "A longer Marin gravel meetup with route choice driven by the day's group and conditions.",
        notes:
          "Source explicitly says this is not a beginner ride and that route options may include Headlands, Tam, or Hamilton.",
        tags: ["Gravel", "Longer ride", "Weekday", "Regroups"],
        verifiedOn: "2026-05-02",
      },
      {
        id: "western-wheelers-monday-coffee",
        title: "Socially Paced Monday Morning Coffee Ride",
        organizer: "Western Wheelers",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride",
        sourceLabel: "Western Wheelers Monday coffee ride",
        sourceUrl: "https://westernwheelersbicycleclub.wildapricot.org/event-6467878",
        cadence: "Weekly",
        schedule: "Mondays; meet 8:45 AM, roll 9:00 AM",
        distance: "15 miles",
        pace: "A pace / easy social pace",
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
      },
      {
        id: "western-wheelers-seal-point",
        title: "Seal Point / Redwood Shores",
        organizer: "Western Wheelers",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride",
        sourceLabel: "Western Wheelers Seal Point / Redwood Shores",
        sourceUrl: "https://westernwheelersbicycleclub.wildapricot.org/event-6467913",
        cadence: "Multiple days each week",
        schedule: "Tuesday through Saturday; meet 8:45 AM, depart 9:00 AM",
        distance: "23 miles",
        pace: "BC pace / relaxed to steady",
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
      },
      {
        id: "western-wheelers-tuesday-evening",
        title: "Tuesday Evening Ride",
        organizer: "Western Wheelers",
        metroArea: "Peninsula",
        sourceType: "Club recurring ride",
        sourceLabel: "Western Wheelers ride schedule",
        sourceUrl:
          "https://westernwheelersbicycleclub.wildapricot.org/ride_calendar?EventListViewMode=1&EventViewMode=1",
        cadence: "Weekly during evening-ride season",
        schedule: "Tuesdays; meet 5:15 PM, roll 5:30 PM",
        distance: "15 miles and up",
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
      },
      {
        id: "fat-cake-ftwnb",
        title: "FTWNB Ride",
        organizer: "Fat Cake Club",
        metroArea: "San Francisco",
        sourceType: "Community rides page",
        sourceLabel: "Fat Cake Club rides",
        sourceUrl: "https://www.fatcake.cc/rides",
        cadence: "Weekly",
        schedule: "Mondays at 6:30 AM",
        distance: "17 miles",
        pace: "Relaxed",
        terrain: "City road route via Ocean Beach, Great Highway, and Twin Peaks",
        dropPolicy: "First Monday specifically calls for allies to sweep from the back",
        startLocation: "Conservatory of Flowers, Golden Gate Park",
        access: "Open community ride",
        summary:
          "A San Francisco ride specifically built for femme, trans, women, and non-binary cyclists.",
        notes:
          "The route ends with coffee and breakfast after the Twin Peaks lap.",
        tags: ["Inclusive", "City ride", "Coffee ride", "Morning"],
        verifiedOn: "2026-05-02",
      },
      {
        id: "fat-cake-headlands",
        title: "Headlands + Arsicault Bakery",
        organizer: "Fat Cake Club",
        metroArea: "San Francisco",
        sourceType: "Community rides page",
        sourceLabel: "Fat Cake Club rides",
        sourceUrl: "https://www.fatcake.cc/rides",
        cadence: "Weekly",
        schedule: "Tuesdays at 6:30 AM",
        distance: "25 miles",
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
      },
      {
        id: "ornot-after-cake",
        title: "After Cake, Ornot",
        organizer: "Ornot",
        metroArea: "San Francisco",
        sourceType: "Shop ride page",
        sourceLabel: "Ornot showroom events",
        sourceUrl: "https://www.ornotbike.com/pages/showroom",
        cadence: "Weekly",
        schedule: "Tuesday mornings at 8:30 AM",
        distance: "About 1.5 hours of riding",
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
      },
      {
        id: "pas-normal-sf-weekly",
        title: "Pas Normal Studios Weekly Group Rides",
        organizer: "Pas Normal Studios San Francisco",
        metroArea: "San Francisco",
        sourceType: "Shop ride page",
        sourceLabel: "Pas Normal Studios San Francisco",
        sourceUrl: "https://pasnormalstudios.com/pages/san-francisco",
        cadence: "Weekly",
        schedule: "Weekly; see store events for exact departures",
        distance: "Varies",
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
      },
      {
        id: "actc-ride-calendar",
        title: "ACTC Club Ride Calendar",
        organizer: "Almaden Cycle Touring Club",
        metroArea: "South Bay",
        sourceType: "Club ride calendar",
        sourceLabel: "ACTC ride schedule",
        sourceUrl: "https://actc.org/schedule/",
        cadence: "Daily calendar",
        schedule: "Several rides every day; see current and next month schedules",
        distance: "Varies widely",
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
      },
      {
        id: "mikes-bikes-community-events",
        title: "Mike's Bikes Community & Events",
        organizer: "Mike's Bikes",
        metroArea: "South Bay",
        sourceType: "Shop events hub",
        sourceLabel: "Mike's Bikes community and events",
        sourceUrl: "https://mikesbikes.com/pages/community-and-events",
        cadence: "Weekly rides across participating stores",
        schedule: "Weekly loops, weekend rides, clinics, and workshops",
        distance: "Varies by store and event",
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
      },
    ],
  },
  {
    slug: "san-diego",
    label: "San Diego",
    blurb:
      "Scaffolded next. This section is ready for official club, shop, and recurring Strava-backed San Diego ride sources.",
    status: "planned",
    rides: [],
  },
  {
    slug: "los-angeles",
    label: "Los Angeles",
    blurb:
      "Scaffolded next. This section will expand with LA basin road, gravel, and shop rides after the Bay Area pass.",
    status: "planned",
    rides: [],
  },
  {
    slug: "santa-clarita",
    label: "Santa Clarita",
    blurb:
      "Scaffolded next. This section is reserved for north-LA county and Santa Clarita ride communities.",
    status: "planned",
    rides: [],
  },
  {
    slug: "riverside",
    label: "Riverside",
    blurb:
      "Scaffolded next. This section will cover Inland Empire road, gravel, and club calendars in a later pass.",
    status: "planned",
    rides: [],
  },
];
