import type { Metadata } from "next";
import RidesDirectoryClient from "@/src/components/RidesDirectoryClient";
import { getRideDirectorySnapshot } from "@/src/server/ridesStore";

export const metadata: Metadata = {
  title: "Group Bike Rides | Bidroom",
  description:
    "Curated organized group bike rides across the Bay Area, San Diego, Los Angeles, Santa Clarita, and Riverside.",
};

export const revalidate = 3600;

export default async function RidesPage() {
  const snapshot = await getRideDirectorySnapshot();
  return <RidesDirectoryClient snapshot={snapshot} />;
}
