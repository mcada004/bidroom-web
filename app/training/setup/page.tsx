import type { Metadata } from "next";
import TrainingSetup from "@/src/components/TrainingSetup";
import "../training.css";
export const metadata: Metadata = { title: "Connect Training | Bidroom", robots: { index: false, follow: false } };
export default function TrainingSetupPage() { return <TrainingSetup />; }
