import type { Metadata } from "next";
import RidesCalendarClient from "@/src/components/RidesCalendarClient";
import { getRideDirectorySnapshot } from "@/src/server/ridesStore";

export const metadata: Metadata = {
  title: "Rides Calendar | Bidroom",
  description: "Calendar view of organized group bike rides across Northern and Southern California.",
};

export const revalidate = 3600;

export default async function RidesCalendarPage() {
  const snapshot = await getRideDirectorySnapshot();
  return <RidesCalendarClient snapshot={snapshot} />;
}
