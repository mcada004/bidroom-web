import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type RequestBody = {
  location?: unknown;
  ridingType?: unknown;
  goalMetric?: unknown;
  goalAmount?: unknown;
};

type Ride = {
  name: string;
  distance: string;
  climbing: string;
  estimatedTime: string;
  difficulty: string;
  description: string;
};

type Destination = {
  name: string;
  description: string;
  bestSeason: string;
  tips: string;
  rides: Ride[];
};

const VALID_RIDING_TYPES = ["road", "gravel", "both"] as const;
const VALID_GOAL_METRICS = ["miles", "climbing", "hours"] as const;

type RidingType = (typeof VALID_RIDING_TYPES)[number];
type GoalMetric = (typeof VALID_GOAL_METRICS)[number];

// ---------------------------------------------------------------------------
// Curated destination database
// ---------------------------------------------------------------------------

type DestinationEntry = {
  name: string;
  region: string;
  description: Record<RidingType, string>;
  bestSeason: string;
  tips: string;
  rides: Record<RidingType, Ride[]>;
  tags: string[];
};

const DESTINATIONS: DestinationEntry[] = [
  {
    name: "Boulder & Front Range, Colorado",
    region: "colorado",
    description: {
      road: "Legendary climbing with long, steady ascents up mountain canyons and passes. Thin air and big views.",
      gravel: "Endless fire roads and mining trails weave through the Rockies, with altitude-amplified scenery.",
      both: "World-class road climbs meet rugged mountain gravel — switch surfaces without switching zip codes.",
    },
    bestSeason: "June–September",
    tips: "Acclimate for a day or two at altitude. Afternoon thunderstorms are common in summer — start rides early. Boulder has excellent bike shops and cafés.",
    rides: {
      road: [
        { name: "Flagstaff Mountain", distance: "28 mi", climbing: "3,200 ft", estimatedTime: "2.5 hrs", difficulty: "Hard", description: "Steep switchbacks from downtown Boulder to the summit with panoramic views of the Continental Divide." },
        { name: "Peak to Peak Highway", distance: "55 mi", climbing: "5,500 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Scenic highway linking mountain towns at 9,000+ ft with sustained climbing and long descents." },
        { name: "St. Vrain Canyon Loop", distance: "42 mi", climbing: "2,800 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Rolling canyon road following the creek through Lyons and into the foothills." },
      ],
      gravel: [
        { name: "Switzerland Trail", distance: "22 mi", climbing: "2,400 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Historic narrow-gauge rail bed turned gravel road through pine forests above Boulder." },
        { name: "Gold Hill Loop", distance: "30 mi", climbing: "4,000 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Mix of dirt roads climbing to the old mining town of Gold Hill with panoramic ridgeline sections." },
        { name: "Left Hand Canyon Gravel", distance: "35 mi", climbing: "3,800 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Paved canyon climb transitions to rugged forest roads with creek crossings." },
      ],
      both: [
        { name: "Flagstaff Mountain", distance: "28 mi", climbing: "3,200 ft", estimatedTime: "2.5 hrs", difficulty: "Hard", description: "Steep switchbacks from downtown Boulder to the summit with panoramic views of the Continental Divide." },
        { name: "Switzerland Trail", distance: "22 mi", climbing: "2,400 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Historic narrow-gauge rail bed turned gravel road through pine forests above Boulder." },
        { name: "Gold Hill Loop", distance: "30 mi", climbing: "4,000 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Mix of dirt roads climbing to the old mining town of Gold Hill with panoramic ridgeline sections." },
      ],
    },
    tags: ["colorado", "boulder", "front range", "rockies", "usa", "mountain"],
  },
  {
    name: "Mallorca, Spain",
    region: "mallorca",
    description: {
      road: "Europe's premier road cycling island. Smooth roads, dramatic sea cliffs, and the legendary Serra de Tramuntana climbs.",
      gravel: "Mallorca's interior offers limestone tracks through olive groves and ancient monasteries away from the tourist coast.",
      both: "Iconic road climbs on the coast and dusty interior tracks — one island, two cycling worlds.",
    },
    bestSeason: "March–May, September–October",
    tips: "Fly into Palma. Pro teams train here Feb–April, so roads are cyclist-friendly. Hotel bike storage is standard. Rent or ship — many shops offer high-end road and gravel bikes.",
    rides: {
      road: [
        { name: "Sa Calobra", distance: "30 mi", climbing: "4,800 ft", estimatedTime: "3 hrs", difficulty: "Epic", description: "The bucket-list Mediterranean climb: 26 hairpins descend to a tiny cove, then you climb back out." },
        { name: "Cap de Formentor", distance: "45 mi", climbing: "3,000 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Ride to the island's dramatic northern tip along cliff-edge roads with turquoise water views." },
        { name: "Puig Major Loop", distance: "70 mi", climbing: "6,500 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Full Tramuntana loop crossing the island's highest paved point with multiple categorized climbs." },
      ],
      gravel: [
        { name: "Artà to Ermita de Betlem", distance: "24 mi", climbing: "2,200 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Rocky trail to a remote hilltop hermitage with 360-degree island views." },
        { name: "Randa Interior Loop", distance: "35 mi", climbing: "2,800 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Farm tracks through the agricultural heartland linking medieval hilltop villages." },
        { name: "Serra de Llevant Traverse", distance: "40 mi", climbing: "3,500 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Eastern mountain range gravel crossing through pine forests and limestone karst." },
      ],
      both: [
        { name: "Sa Calobra", distance: "30 mi", climbing: "4,800 ft", estimatedTime: "3 hrs", difficulty: "Epic", description: "The bucket-list Mediterranean climb: 26 hairpins descend to a tiny cove, then you climb back out." },
        { name: "Artà to Ermita de Betlem", distance: "24 mi", climbing: "2,200 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Rocky trail to a remote hilltop hermitage with 360-degree island views." },
        { name: "Puig Major Loop", distance: "70 mi", climbing: "6,500 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Full Tramuntana loop crossing the island's highest paved point with multiple categorized climbs." },
      ],
    },
    tags: ["mallorca", "majorca", "spain", "europe", "mediterranean", "island"],
  },
  {
    name: "Girona, Catalonia",
    region: "girona",
    description: {
      road: "The adopted home of the pro peloton. Quiet Catalan roads, perfect tarmac, and climbs ranging from gentle coastal rolls to Pyrenean monsters.",
      gravel: "Volcanic zone tracks, medieval forest paths, and Costa Brava coastal trails make Girona a gravel paradise.",
      both: "Pro-level road networks and volcanic-zone gravel within minutes of the same café. Dual-discipline heaven.",
    },
    bestSeason: "March–June, September–November",
    tips: "Stay in the old town — bike-friendly cafés everywhere. Rocacorba and Els Àngels are the signature climbs. Easy train to Barcelona. Many tour operators offer guided gravel and road packages.",
    rides: {
      road: [
        { name: "Rocacorba", distance: "50 mi", climbing: "4,500 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "The pro-training climb: a relentless 12 km ascent through forest to the radar dome summit." },
        { name: "Costa Brava Coastal Loop", distance: "60 mi", climbing: "3,200 ft", estimatedTime: "4 hrs", difficulty: "Moderate", description: "Rolling seaside roads through fishing villages with constant Mediterranean views." },
        { name: "Mare de Déu del Mont", distance: "45 mi", climbing: "4,000 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Quiet back-road climb to a mountaintop sanctuary with views to the Pyrenees and sea." },
      ],
      gravel: [
        { name: "Zona Volcànica Loop", distance: "35 mi", climbing: "2,600 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Gravel tracks through the Garrotxa volcanic zone, weaving between dormant cones and beech forests." },
        { name: "Vic Salt Flats", distance: "28 mi", climbing: "1,800 ft", estimatedTime: "2.5 hrs", difficulty: "Easy", description: "Flat-to-rolling farm tracks across the Osona plain with views of Montserrat on clear days." },
        { name: "Les Gavarres Ridge", distance: "30 mi", climbing: "3,200 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Singletrack and double-track through cork oak forests on the massif between Girona and the coast." },
      ],
      both: [
        { name: "Rocacorba", distance: "50 mi", climbing: "4,500 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "The pro-training climb: a relentless 12 km ascent through forest to the radar dome summit." },
        { name: "Zona Volcànica Loop", distance: "35 mi", climbing: "2,600 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Gravel tracks through the Garrotxa volcanic zone, weaving between dormant cones and beech forests." },
        { name: "Costa Brava Coastal Loop", distance: "60 mi", climbing: "3,200 ft", estimatedTime: "4 hrs", difficulty: "Moderate", description: "Rolling seaside roads through fishing villages with constant Mediterranean views." },
      ],
    },
    tags: ["girona", "catalonia", "spain", "europe", "pro cycling"],
  },
  {
    name: "Tuscany, Italy",
    region: "tuscany",
    description: {
      road: "Rolling hills, cypress-lined lanes, and the white gravel Strade Bianche roads that blur the line between road and gravel.",
      gravel: "The birthplace of gravel racing. Iconic white roads (strade bianche) through Chianti vineyards and medieval hilltop towns.",
      both: "Paved Chianti climbs and classic strade bianche within the same ride — this is where gravel culture began.",
    },
    bestSeason: "April–June, September–October",
    tips: "Base in Siena or Gaiole in Chianti. The famous L'Eroica vintage ride happens in October. Local agriturismos welcome cyclists. Pair rides with wine tastings.",
    rides: {
      road: [
        { name: "Chianti Classico Loop", distance: "55 mi", climbing: "4,200 ft", estimatedTime: "4 hrs", difficulty: "Moderate", description: "Winding roads through vineyard-covered hills connecting Greve, Panzano, and Radda in Chianti." },
        { name: "Val d'Orcia Circuit", distance: "65 mi", climbing: "5,000 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "UNESCO-listed landscape with postcard-perfect cypress rows, hot springs, and Brunello wine country." },
        { name: "Fiesole to Florence", distance: "20 mi", climbing: "1,800 ft", estimatedTime: "1.5 hrs", difficulty: "Easy", description: "Short scenic climb above Florence with panoramic views of the Duomo and Arno Valley." },
      ],
      gravel: [
        { name: "Strade Bianche Route", distance: "40 mi", climbing: "3,600 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "The race route itself: eight sectors of white gravel roads finishing at the Piazza del Campo in Siena." },
        { name: "L'Eroica Permanent Course", distance: "48 mi", climbing: "4,500 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Waymarked gravel loops through Chianti connecting the same strade bianche used in the vintage ride." },
        { name: "Crete Senesi Explorer", distance: "30 mi", climbing: "2,400 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Lunar clay-hill landscape south of Siena on farm tracks between isolated abbeys." },
      ],
      both: [
        { name: "Chianti Classico Loop", distance: "55 mi", climbing: "4,200 ft", estimatedTime: "4 hrs", difficulty: "Moderate", description: "Winding roads through vineyard-covered hills connecting Greve, Panzano, and Radda in Chianti." },
        { name: "Strade Bianche Route", distance: "40 mi", climbing: "3,600 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "The race route itself: eight sectors of white gravel roads finishing at the Piazza del Campo in Siena." },
        { name: "L'Eroica Permanent Course", distance: "48 mi", climbing: "4,500 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Waymarked gravel loops through Chianti connecting the same strade bianche used in the vintage ride." },
      ],
    },
    tags: ["tuscany", "italy", "europe", "chianti", "strade bianche", "wine"],
  },
  {
    name: "Vermont Green Mountains",
    region: "vermont",
    description: {
      road: "New England's best climbing with covered bridges, dairy farms, and fall foliage that rivals anywhere on earth.",
      gravel: "Vermont's extensive network of Class 4 dirt roads and forest tracks offers endless gravel exploration through hardwood forests.",
      both: "Paved gaps and mountain passes blend seamlessly with Vermont's legendary dirt road network.",
    },
    bestSeason: "May–October (peak foliage late September)",
    tips: "Base in Stowe, Waitsfield, or Middlebury. Many roads are unpaved by default — gravel is just how Vermont rolls. Fall foliage season is spectacular but book lodging early.",
    rides: {
      road: [
        { name: "App Gap & Lincoln Gap", distance: "52 mi", climbing: "5,800 ft", estimatedTime: "4.5 hrs", difficulty: "Epic", description: "Two of Vermont's steepest mountain passes back-to-back, with Lincoln Gap's 24% pitches." },
        { name: "Stowe Mountain Road", distance: "35 mi", climbing: "2,800 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Classic ride up to Smugglers' Notch — the road narrows between towering cliffs near the top." },
        { name: "Lake Champlain Century", distance: "100 mi", climbing: "3,500 ft", estimatedTime: "6.5 hrs", difficulty: "Hard", description: "Flat-to-rolling lakeside roads with views of the Adirondacks across the water." },
      ],
      gravel: [
        { name: "Dirty 40 Route", distance: "40 mi", climbing: "3,500 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Classic Vermont gravel race route on remote Class 4 roads through the Green Mountain National Forest." },
        { name: "Waitsfield Dirt Roads", distance: "25 mi", climbing: "2,200 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Mad River Valley farm roads with covered bridges, swimming holes, and mountain views." },
        { name: "Kingdom Trails Gravel", distance: "35 mi", climbing: "3,000 ft", estimatedTime: "3.5 hrs", difficulty: "Moderate", description: "Northeast Kingdom backroads through dairy country with rolling terrain and minimal traffic." },
      ],
      both: [
        { name: "App Gap & Lincoln Gap", distance: "52 mi", climbing: "5,800 ft", estimatedTime: "4.5 hrs", difficulty: "Epic", description: "Two of Vermont's steepest mountain passes back-to-back, with Lincoln Gap's 24% pitches." },
        { name: "Dirty 40 Route", distance: "40 mi", climbing: "3,500 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Classic Vermont gravel race route on remote Class 4 roads through the Green Mountain National Forest." },
        { name: "Waitsfield Dirt Roads", distance: "25 mi", climbing: "2,200 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Mad River Valley farm roads with covered bridges, swimming holes, and mountain views." },
      ],
    },
    tags: ["vermont", "new england", "usa", "green mountains", "foliage", "northeast"],
  },
  {
    name: "Pacific Coast Highway, California",
    region: "pacific coast",
    description: {
      road: "One of the world's great coastal rides. Endless ocean views, sea-cliff roads, and the iconic Big Sur stretch.",
      gravel: "Inland fire roads in the Santa Lucia Range and coastal bluffs offer raw, remote gravel riding above the Pacific.",
      both: "Ride Highway 1's famous pavement, then duck inland on fire roads for a completely different perspective of the same coastline.",
    },
    bestSeason: "April–October",
    tips: "Ride north-to-south for tailwinds and the ocean-side lane. Book Big Sur camping/lodging months ahead. Fog is common on the coast — layers help. Support vehicles are recommended for multi-day tours.",
    rides: {
      road: [
        { name: "Big Sur Classic", distance: "72 mi", climbing: "5,500 ft", estimatedTime: "5.5 hrs", difficulty: "Hard", description: "San Simeon to Carmel along Highway 1's most dramatic section — Bixby Bridge, sea cliffs, and redwoods." },
        { name: "Santa Barbara Wine Country", distance: "50 mi", climbing: "3,200 ft", estimatedTime: "3.5 hrs", difficulty: "Moderate", description: "Inland loop through Solvang and the Santa Ynez Valley with rolling vineyard roads." },
        { name: "Malibu Canyon Loop", distance: "40 mi", climbing: "4,000 ft", estimatedTime: "3 hrs", difficulty: "Hard", description: "Climb through the Santa Monica Mountains on Mulholland and descend to PCH." },
      ],
      gravel: [
        { name: "Nacimiento-Fergusson Road", distance: "26 mi", climbing: "3,800 ft", estimatedTime: "3 hrs", difficulty: "Hard", description: "Steep mixed-surface climb from the coast up through redwoods into Fort Hunter Liggett." },
        { name: "Figueroa Mountain", distance: "32 mi", climbing: "3,600 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Fire roads climbing above the Santa Ynez Valley with wildflower meadows in spring." },
        { name: "Montana de Oro Bluffs", distance: "18 mi", climbing: "1,200 ft", estimatedTime: "2 hrs", difficulty: "Easy", description: "Coastal bluff trails and fire roads in the state park with tide pools and wildlife." },
      ],
      both: [
        { name: "Big Sur Classic", distance: "72 mi", climbing: "5,500 ft", estimatedTime: "5.5 hrs", difficulty: "Hard", description: "San Simeon to Carmel along Highway 1's most dramatic section — Bixby Bridge, sea cliffs, and redwoods." },
        { name: "Nacimiento-Fergusson Road", distance: "26 mi", climbing: "3,800 ft", estimatedTime: "3 hrs", difficulty: "Hard", description: "Steep mixed-surface climb from the coast up through redwoods into Fort Hunter Liggett." },
        { name: "Santa Barbara Wine Country", distance: "50 mi", climbing: "3,200 ft", estimatedTime: "3.5 hrs", difficulty: "Moderate", description: "Inland loop through Solvang and the Santa Ynez Valley with rolling vineyard roads." },
      ],
    },
    tags: ["pacific coast", "california", "big sur", "usa", "coastal", "pch", "highway 1"],
  },
  {
    name: "Moab & Southern Utah",
    region: "utah",
    description: {
      road: "Desert highway riding through red-rock canyons with otherworldly scenery — Arches, Canyonlands, and Monument Valley.",
      gravel: "Utah is gravel nirvana: White Rim Trail, Shafer Trail, and hundreds of miles of BLM roads through slot canyons and mesas.",
      both: "Paved scenic byways and legendary desert gravel combine for rides that feel like cycling on Mars.",
    },
    bestSeason: "March–May, September–November",
    tips: "Carry more water than you think. Summer is dangerously hot (105°F+). Spring and fall are ideal. Moab has excellent bike shops. Permits needed for White Rim overnight.",
    rides: {
      road: [
        { name: "Dead Horse Point Loop", distance: "38 mi", climbing: "2,200 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Ride to a 2,000-foot sheer cliff overlook of the Colorado River's gooseneck bends." },
        { name: "La Sal Mountain Loop", distance: "62 mi", climbing: "5,800 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Desert floor to alpine forest — climb from red rock at 4,000 ft to aspen groves at 10,000 ft." },
        { name: "Arches Scenic Drive", distance: "36 mi", climbing: "1,800 ft", estimatedTime: "2.5 hrs", difficulty: "Easy", description: "Roll through the national park past Balanced Rock, Delicate Arch viewpoint, and red sandstone fins." },
      ],
      gravel: [
        { name: "White Rim Trail", distance: "72 mi", climbing: "3,400 ft", estimatedTime: "8 hrs", difficulty: "Epic", description: "Multi-day desert classic on a shelf road 1,000 ft above the Colorado River in Canyonlands." },
        { name: "Shafer Trail", distance: "18 mi", climbing: "1,400 ft", estimatedTime: "2 hrs", difficulty: "Hard", description: "Exposed switchbacks dropping from Island in the Sky mesa to the White Rim level." },
        { name: "Gemini Bridges Road", distance: "28 mi", climbing: "1,800 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Desert double-track to natural rock bridges with views of Arches and the La Sal Mountains." },
      ],
      both: [
        { name: "La Sal Mountain Loop", distance: "62 mi", climbing: "5,800 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Desert floor to alpine forest — climb from red rock at 4,000 ft to aspen groves at 10,000 ft." },
        { name: "White Rim Trail", distance: "72 mi", climbing: "3,400 ft", estimatedTime: "8 hrs", difficulty: "Epic", description: "Multi-day desert classic on a shelf road 1,000 ft above the Colorado River in Canyonlands." },
        { name: "Gemini Bridges Road", distance: "28 mi", climbing: "1,800 ft", estimatedTime: "2.5 hrs", difficulty: "Moderate", description: "Desert double-track to natural rock bridges with views of Arches and the La Sal Mountains." },
      ],
    },
    tags: ["utah", "moab", "desert", "usa", "red rock", "canyonlands", "southwest"],
  },
  {
    name: "Oaxaca, Mexico",
    region: "oaxaca",
    description: {
      road: "High-altitude valley roads through indigenous villages, mezcal country, and the dramatic Sierra Norte.",
      gravel: "Remote mountain tracks connect Zapotec villages, cloud forests, and mezcal distilleries in Mexico's most culturally rich state.",
      both: "Valley pavement climbs give way to mountain gravel — finish every ride at a mezcalería in one of Mexico's best food cities.",
    },
    bestSeason: "October–April (dry season)",
    tips: "Oaxaca City is at 5,000 ft — rides climb higher. The food scene is world-class. Learn basic Spanish. Hire a local guide for remote gravel routes. Rainy season (June–Sept) makes dirt roads impassable.",
    rides: {
      road: [
        { name: "Hierve el Agua", distance: "45 mi", climbing: "4,200 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Climb from the valley floor to petrified waterfalls overlooking the Mitla Valley." },
        { name: "Tlacolula Valley Loop", distance: "35 mi", climbing: "1,800 ft", estimatedTime: "2.5 hrs", difficulty: "Easy", description: "Rolling valley roads through Sunday market towns, ancient Zapotec ruins, and mezcal villages." },
        { name: "Monte Albán Ridge", distance: "22 mi", climbing: "2,800 ft", estimatedTime: "2 hrs", difficulty: "Moderate", description: "Short but steep climb to the pre-Columbian hilltop city with 360-degree views." },
      ],
      gravel: [
        { name: "Pueblos Mancomunados", distance: "30 mi", climbing: "4,500 ft", estimatedTime: "5 hrs", difficulty: "Epic", description: "High-altitude trails connecting Zapotec cloud forest villages in the Sierra Norte at 10,000 ft." },
        { name: "Mezcal Route Dirt Roads", distance: "25 mi", climbing: "2,000 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Backroads linking palenques (mezcal distilleries) through agave fields in the Tlacolula Valley." },
        { name: "Sierra Sur Descent", distance: "40 mi", climbing: "1,500 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Massive net-downhill from the highlands toward the Pacific coast through pine and tropical forests." },
      ],
      both: [
        { name: "Hierve el Agua", distance: "45 mi", climbing: "4,200 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Climb from the valley floor to petrified waterfalls overlooking the Mitla Valley." },
        { name: "Pueblos Mancomunados", distance: "30 mi", climbing: "4,500 ft", estimatedTime: "5 hrs", difficulty: "Epic", description: "High-altitude trails connecting Zapotec cloud forest villages in the Sierra Norte at 10,000 ft." },
        { name: "Tlacolula Valley Loop", distance: "35 mi", climbing: "1,800 ft", estimatedTime: "2.5 hrs", difficulty: "Easy", description: "Rolling valley roads through Sunday market towns, ancient Zapotec ruins, and mezcal villages." },
      ],
    },
    tags: ["oaxaca", "mexico", "sierra norte", "mezcal", "central america", "latin america"],
  },
  {
    name: "Swiss & French Alps",
    region: "alps",
    description: {
      road: "The Holy Grail: Tour de France cols, pristine tarmac, and Alpine scenery that never gets old.",
      gravel: "High-altitude military roads, alpine pasture tracks, and cols fermés (closed passes) offer gravel at altitude.",
      both: "Ride the legendary cols on tarmac in the morning, then explore unpaved alpine tracks in the afternoon.",
    },
    bestSeason: "June–September",
    tips: "Major cols are snow-free from June. Swiss trains are bike-friendly for one-way rides. French side is cheaper for lodging and food. Bring warm layers — descents are cold even in summer.",
    rides: {
      road: [
        { name: "Alpe d'Huez 21 Bends", distance: "30 mi", climbing: "3,800 ft", estimatedTime: "2.5 hrs", difficulty: "Hard", description: "The most famous climb in cycling: 21 numbered switchbacks from Bourg-d'Oisans to 1,850m." },
        { name: "Col du Galibier", distance: "52 mi", climbing: "6,200 ft", estimatedTime: "5 hrs", difficulty: "Epic", description: "Ride from Valloire over the 2,642m Galibier and descend to Briançon — Tour de France royalty." },
        { name: "Lake Geneva to Gruyères", distance: "45 mi", climbing: "3,400 ft", estimatedTime: "3.5 hrs", difficulty: "Moderate", description: "Vineyard-terraced lakeside riding transitioning to Swiss pre-alpine hills and fondue country." },
      ],
      gravel: [
        { name: "Col du Parpaillon", distance: "28 mi", climbing: "4,600 ft", estimatedTime: "4 hrs", difficulty: "Epic", description: "Legendary unpaved military road climbing to 2,780m through a dark summit tunnel in the Hautes-Alpes." },
        { name: "Tour du Mont Blanc Gravel", distance: "35 mi", climbing: "4,000 ft", estimatedTime: "5 hrs", difficulty: "Hard", description: "Alpine pasture tracks around the Mont Blanc massif with glacier views and mountain hut stops." },
        { name: "Savoie Cheese Trail", distance: "22 mi", climbing: "2,400 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Farm tracks connecting alpine cheese makers in the Beaufortain valley with Beaufort tastings." },
      ],
      both: [
        { name: "Alpe d'Huez 21 Bends", distance: "30 mi", climbing: "3,800 ft", estimatedTime: "2.5 hrs", difficulty: "Hard", description: "The most famous climb in cycling: 21 numbered switchbacks from Bourg-d'Oisans to 1,850m." },
        { name: "Col du Parpaillon", distance: "28 mi", climbing: "4,600 ft", estimatedTime: "4 hrs", difficulty: "Epic", description: "Legendary unpaved military road climbing to 2,780m through a dark summit tunnel in the Hautes-Alpes." },
        { name: "Lake Geneva to Gruyères", distance: "45 mi", climbing: "3,400 ft", estimatedTime: "3.5 hrs", difficulty: "Moderate", description: "Vineyard-terraced lakeside riding transitioning to Swiss pre-alpine hills and fondue country." },
      ],
    },
    tags: ["alps", "swiss", "france", "europe", "tour de france", "mountain", "col"],
  },
  {
    name: "Dolomites, Italy",
    region: "dolomites",
    description: {
      road: "Towering pink spires, legendary Giro d'Italia passes, and roads carved into vertical cliff faces.",
      gravel: "Former WWI military roads at altitude, high-alpine meadow tracks, and hut-to-hut gravel touring in a UNESCO World Heritage landscape.",
      both: "Ride the Sella Ronda passes on tarmac, then explore the alta via gravel tracks above the tree line.",
    },
    bestSeason: "June–September",
    tips: "Base in Bolzano, Bressanone, or Corvara. Sellaronda bike day (car-free passes) in June is unmissable. Rifugios (mountain huts) serve lunch. Cable cars can shortcut big climbs.",
    rides: {
      road: [
        { name: "Sella Ronda Loop", distance: "34 mi", climbing: "4,600 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Four legendary passes in a loop — Gardena, Sella, Pordoi, and Campolongo — through the heart of the Dolomites." },
        { name: "Stelvio from Prato", distance: "50 mi", climbing: "5,900 ft", estimatedTime: "5 hrs", difficulty: "Epic", description: "48 switchbacks climbing to 2,758m — the second-highest paved pass in the Alps." },
        { name: "Tre Cime di Lavaredo", distance: "38 mi", climbing: "3,200 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Ride to the base of the iconic three peaks with the final km on a scenic toll road." },
      ],
      gravel: [
        { name: "Great Dolomites Gravel", distance: "42 mi", climbing: "5,000 ft", estimatedTime: "6 hrs", difficulty: "Epic", description: "Alta via gravel connecting rifugios through high meadows beneath the Tofana and Lagazuoi peaks." },
        { name: "Val Pusteria Forest Roads", distance: "30 mi", climbing: "2,400 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Shaded forest gravel along the Drava river valley with frequent mountain hut stops." },
        { name: "Fanes-Senes-Braies Circuit", distance: "25 mi", climbing: "3,200 ft", estimatedTime: "4 hrs", difficulty: "Hard", description: "Natural park gravel through high plateaus, past turquoise lakes, and WWI military remnants." },
      ],
      both: [
        { name: "Sella Ronda Loop", distance: "34 mi", climbing: "4,600 ft", estimatedTime: "3.5 hrs", difficulty: "Hard", description: "Four legendary passes in a loop — Gardena, Sella, Pordoi, and Campolongo — through the heart of the Dolomites." },
        { name: "Great Dolomites Gravel", distance: "42 mi", climbing: "5,000 ft", estimatedTime: "6 hrs", difficulty: "Epic", description: "Alta via gravel connecting rifugios through high meadows beneath the Tofana and Lagazuoi peaks." },
        { name: "Tre Cime di Lavaredo", distance: "38 mi", climbing: "3,200 ft", estimatedTime: "3 hrs", difficulty: "Moderate", description: "Ride to the base of the iconic three peaks with the final km on a scenic toll road." },
      ],
    },
    tags: ["dolomites", "italy", "europe", "giro", "mountain", "unesco"],
  },
];

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function matchesLocation(entry: DestinationEntry, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (entry.region.includes(q)) return true;
  if (entry.name.toLowerCase().includes(q)) return true;
  return entry.tags.some((tag) => tag.includes(q));
}

function selectDestinations(
  location: string,
  ridingType: RidingType,
): Destination[] {
  const matched = DESTINATIONS.filter((d) => matchesLocation(d, location));
  const pool = matched.length > 0 ? matched : DESTINATIONS;

  const selected = pool.slice(0, 3);
  return selected.map((entry) => ({
    name: entry.name,
    description: entry.description[ridingType],
    bestSeason: entry.bestSeason,
    tips: entry.tips,
    rides: entry.rides[ridingType],
  }));
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const ridingType = typeof body.ridingType === "string" ? body.ridingType.trim().toLowerCase() : "";
  if (!VALID_RIDING_TYPES.includes(ridingType as RidingType)) {
    return NextResponse.json({ error: "ridingType must be one of: road, gravel, both." }, { status: 400 });
  }

  const goalMetric = typeof body.goalMetric === "string" ? body.goalMetric.trim().toLowerCase() : "";
  if (!VALID_GOAL_METRICS.includes(goalMetric as GoalMetric)) {
    return NextResponse.json({ error: "goalMetric must be one of: miles, climbing, hours." }, { status: 400 });
  }

  const goalAmount = Number(body.goalAmount);
  if (!Number.isFinite(goalAmount) || goalAmount <= 0) {
    return NextResponse.json({ error: "goalAmount must be a positive number." }, { status: 400 });
  }

  const location = typeof body.location === "string" ? body.location.trim() : "";

  const destinations = selectDestinations(location, ridingType as RidingType);
  if (destinations.length === 0) {
    return NextResponse.json(
      { error: "No destinations found for that search. Try a different location." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, destinations });
}
