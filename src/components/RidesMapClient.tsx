"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import maplibregl from "maplibre-gl";
import RidesFilterControls from "@/src/components/RidesFilterControls";
import type { DerivedRideListing, RideDirectorySnapshot, RideRegionSlug } from "@/src/lib/groupRides";
import { filterRides } from "@/src/lib/ridesFiltering";

type Props = {
  snapshot: RideDirectorySnapshot;
};

type RideFeature = GeoJSON.Feature<
  GeoJSON.Point,
  {
    id: string;
    title: string;
    organizer: string;
    sourceUrl: string;
    sourceLabel: string;
    nextOccurrenceLabel: string;
    metroArea: string;
    distance: string;
    schedule: string;
    locationPrecision: string;
  }
>;

const SOURCE_ID = "rides";
const CLUSTERS_LAYER_ID = "rides-clusters";
const CLUSTER_COUNT_LAYER_ID = "rides-cluster-count";
const UNCLUSTERED_LAYER_ID = "rides-unclustered";

const rasterStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
};

function createFeature(ride: DerivedRideListing): RideFeature | null {
  if (ride.latitude === null || ride.longitude === null) return null;

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [ride.longitude, ride.latitude],
    },
    properties: {
      id: ride.id,
      title: ride.title,
      organizer: ride.organizer,
      sourceUrl: ride.sourceUrl,
      sourceLabel: ride.sourceLabel,
      nextOccurrenceLabel: ride.nextOccurrenceLabel,
      metroArea: ride.metroArea,
      distance: ride.distance,
      schedule: ride.schedule,
      locationPrecision: ride.locationPrecision,
    },
  };
}

function buildGeoJson(rides: DerivedRideListing[]): GeoJSON.FeatureCollection<GeoJSON.Point, RideFeature["properties"]> {
  return {
    type: "FeatureCollection",
    features: rides.map((ride) => createFeature(ride)).filter((feature): feature is RideFeature => Boolean(feature)),
  };
}

function makePopupNode(feature: RideFeature["properties"]) {
  const wrapper = document.createElement("div");
  wrapper.className = "rides-map-popup";

  const title = document.createElement("h3");
  title.className = "rides-map-popup-title";
  title.textContent = feature.title;
  wrapper.appendChild(title);

  const org = document.createElement("div");
  org.className = "rides-map-popup-org";
  org.textContent = feature.organizer;
  wrapper.appendChild(org);

  const meta = document.createElement("div");
  meta.className = "rides-map-popup-meta";
  const metaLines = [
    feature.metroArea,
    feature.nextOccurrenceLabel,
    feature.distance,
    feature.schedule,
    feature.locationPrecision === "exact" ? "Exact start point" : "Approximate map point",
  ];
  for (const line of metaLines) {
    const row = document.createElement("div");
    row.textContent = line;
    meta.appendChild(row);
  }
  wrapper.appendChild(meta);

  const link = document.createElement("a");
  link.href = feature.sourceUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = feature.sourceLabel;
  link.className = "link";
  wrapper.appendChild(link);

  return wrapper;
}

export default function RidesMapClient({ snapshot }: Props) {
  const [selectedRegion, setSelectedRegion] = useState<"all" | RideRegionSlug>("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [minMileage, setMinMileage] = useState("");
  const [maxMileage, setMaxMileage] = useState("");
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const hasFitInitialBoundsRef = useRef(false);

  const filteredRides = useMemo(
    () =>
      filterRides(snapshot, {
        region: selectedRegion,
        date: selectedDate,
        minMileage,
        maxMileage,
      }),
    [maxMileage, minMileage, selectedDate, selectedRegion, snapshot]
  );

  const mappableRides = useMemo(
    () => filteredRides.filter((ride) => ride.latitude !== null && ride.longitude !== null),
    [filteredRides]
  );
  const unmappableCount = filteredRides.length - mappableRides.length;
  const geoJson = useMemo(() => buildGeoJson(mappableRides), [mappableRides]);

  const openRidePopup = useEffectEvent((feature: RideFeature) => {
    const map = mapRef.current;
    if (!map) return;

    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ offset: 14 })
      .setLngLat(feature.geometry.coordinates as [number, number])
      .setDOMContent(makePopupNode(feature.properties))
      .addTo(map);
  });

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: rasterStyle,
      center: [-119.3, 35.8],
      zoom: 5.4,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: geoJson,
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 46,
      });

      map.addLayer({
        id: CLUSTERS_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#f0d7b4",
            8,
            "#dca867",
            20,
            "#9d6f35",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            22,
            8,
            28,
            20,
            34,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: {
          "text-color": "#171615",
        },
      });

      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#171615",
          "circle-radius": 7,
          "circle-stroke-color": "#fbf7f2",
          "circle-stroke-width": 2,
        },
      });

      map.on("click", CLUSTERS_LAYER_ID, async (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: [CLUSTERS_LAYER_ID] });
        const cluster = features[0];
        if (!cluster) return;

        const clusterId = cluster.properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (!source || clusterId === undefined) return;

        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom,
        });
      });

      map.on("click", UNCLUSTERED_LAYER_ID, (event) => {
        const feature = event.features?.[0] as RideFeature | undefined;
        if (!feature) return;
        openRidePopup(feature);
      });

      map.on("mouseenter", CLUSTERS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", CLUSTERS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", UNCLUSTERED_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", UNCLUSTERED_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [geoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateData = () => {
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(geoJson);
    };

    if (map.isStyleLoaded()) {
      updateData();
    } else {
      map.once("load", updateData);
    }
  }, [geoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mappableRides.length === 0) return;

    if (hasFitInitialBoundsRef.current && selectedRegion === "all" && !selectedDate && !minMileage && !maxMileage) {
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const ride of mappableRides) {
      if (ride.longitude === null || ride.latitude === null) continue;
      bounds.extend([ride.longitude, ride.latitude]);
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: 70,
        maxZoom: mappableRides.length === 1 ? 12 : 9,
        duration: 700,
      });
      hasFitInitialBoundsRef.current = true;
    }
  }, [mappableRides, maxMileage, minMileage, selectedDate, selectedRegion]);

  function clearFilters() {
    setSelectedRegion("all");
    setSelectedDate("");
    setMinMileage("");
    setMaxMileage("");
  }

  return (
    <div className="rides-page">
      <section className="hero">
        <h1 className="hero-title">Rides Map</h1>
        <p className="hero-subtitle">
          Zoom out to see clustered ride counts, zoom in to separate individual rides, and click a point to open the
          source page. Some map points are approximate when the ride source only gives a city, shop, or neighborhood.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="pill">{mappableRides.length} rides on map</span>
          <span className="pill">{unmappableCount} filtered rides without map points</span>
        </div>
      </section>

      <RidesFilterControls
        snapshot={snapshot}
        filters={{
          region: selectedRegion,
          date: selectedDate,
          minMileage,
          maxMileage,
        }}
        matchingCount={filteredRides.length}
        currentView="map"
        onRegionChange={setSelectedRegion}
        onDateChange={setSelectedDate}
        onMinMileageChange={setMinMileage}
        onMaxMileageChange={setMaxMileage}
        onClear={clearFilters}
      />

      <section className="rides-map-shell">
        <div className="card soft rides-map-legend">
          <div className="row">
            <span className="pill">Dark points = individual rides</span>
            <span className="pill">Gold circles = clusters</span>
            <span className="pill">Click clusters to zoom</span>
          </div>
          <p className="rides-map-note">
            Map tiles are currently served from OpenStreetMap raster tiles. If this page gets heavier traffic, swap in a
            dedicated production tile provider.
          </p>
        </div>

        {mappableRides.length === 0 ? (
          <section className="card rides-empty-state">
            <div className="stack" style={{ gap: 10 }}>
              <strong>No mappable rides match the current filters.</strong>
              <p className="muted" style={{ margin: 0 }}>
                Try a wider filter, or switch back to the list view to see rides that do not yet have coordinates.
              </p>
              <div className="row">
                <Link className="button secondary" href="/rides">
                  Back to list
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <div ref={mapContainerRef} className="rides-map-canvas" />
        )}
      </section>
    </div>
  );
}
