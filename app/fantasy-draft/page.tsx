import type { Metadata } from "next";
import FantasyDraftBoard from "@/src/components/FantasyDraftBoard";
import "./fantasy-draft.css";

export const metadata: Metadata = {
  title: "2026 Fantasy Draft Board | Bidroom",
  description: "Brian's live 2026 fantasy-football draft board.",
};

export default function FantasyDraftPage() {
  return <FantasyDraftBoard />;
}
