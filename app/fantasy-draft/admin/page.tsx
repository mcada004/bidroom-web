import type { Metadata } from "next";
import FantasyRoomDashboard from "@/src/components/FantasyRoomDashboard";
import "../fantasy-draft.css";
import "./admin.css";

export const metadata: Metadata = { title: "Private Draft Room Dashboard | Bidroom", robots: { index: false, follow: false } };
export default function Page() { return <FantasyRoomDashboard />; }
