import type { Metadata } from "next";
import SharedFantasyDraftBoard from "@/src/components/SharedFantasyDraftBoard";
import "../fantasy-draft.css";
import "./shared-fantasy-draft.css";

export const metadata: Metadata = {
  title: "Live 2026 Fantasy Draft Room | Bidroom",
  description: "Brian's shared live fantasy-football draft board.",
};

export default function SharedFantasyDraftPage() {
  return <SharedFantasyDraftBoard />;
}
