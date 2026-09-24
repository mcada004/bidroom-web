import type { Metadata } from "next";
import TrainingDashboard from "@/src/components/TrainingDashboard";
import "./training.css";
export const metadata: Metadata = { title: "Training & Fuel | Bidroom", description: "Your private training and fueling dashboard.", robots: { index: false, follow: false } };
export default function TrainingPage() { return <TrainingDashboard />; }
