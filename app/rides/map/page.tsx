import type { Metadata } from "next";
import RidesMapClient from "@/src/components/RidesMapClient";
import { getRideDirectorySnapshot } from "@/src/server/ridesStore";

export const metadata: Metadata = {
  title: "Rides Map | Bidroom",
  description: "Map view of organized group bike rides across Northern and Southern California.",
};

export const revalidate = 3600;

export default async function RidesMapPage() {
  const snapshot = await getRideDirectorySnapshot();
  return <RidesMapClient snapshot={snapshot} />;
}
