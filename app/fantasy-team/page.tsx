import type { Metadata } from "next";
import Link from "next/link";
import FantasyDraftBoard from "@/src/components/FantasyDraftBoard";
import "../fantasy-draft/fantasy-draft.css";
import "./fantasy-team.css";

export const metadata: Metadata = {
  title: "My 2026 Fantasy Team | Bidroom",
  description: "Brian's live 2026 fantasy-football roster.",
};

export default function FantasyTeamPage() {
  return (
    <div className="fantasy-team-page">
      <header className="fantasy-team-hero">
        <div>
          <p>2026 fantasy roster</p>
          <h1>My Team</h1>
          <span>Every player marked D on your draft board appears here automatically.</span>
        </div>
        <Link className="button secondary" href="/fantasy-draft">Back to Draft Board</Link>
      </header>
      <div className="fantasy-team-only">
        <FantasyDraftBoard rosterOnly />
      </div>
    </div>
  );
}
