"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/src/lib/firebase";
import { useAuth } from "@/src/context/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading) return <main className="page">Loading…</main>;

  if (!user) {
    return (
      <main className="page">
        <section className="hero">
          <h1 className="hero-title">Effortless room bidding for group trips.</h1>
          <p className="hero-subtitle">
            Set the trip price, open the auction, and let your group bid on rooms. The split stays fair while the
            decisions feel easy.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="button" href="/login">
              Sign in to start
            </Link>
            <span className="pill">Invite codes supported</span>
          </div>
        </section>

        <section className="grid-2">
          <div className="card">
            <div className="section-title">How it works</div>
            <div className="stack">
              <div>
                <strong>Create a trip.</strong>
                <div className="muted">Set total cost, rooms, and auction rules in minutes.</div>
              </div>
              <div>
                <strong>Share the link.</strong>
                <div className="muted">Participants join instantly with a clean invite code.</div>
              </div>
              <div>
                <strong>Let the market decide.</strong>
                <div className="muted">Bids set priorities while the group total stays fixed.</div>
              </div>
            </div>
          </div>
          <div className="card soft">
            <div className="section-title">Built for clarity</div>
            <div className="stack">
              <div className="notice">Minimal controls, live leaderboard, and transparent final pricing.</div>
              <div className="row">
                <span className="pill">Anti-sniping</span>
                <span className="pill">Live results</span>
                <span className="pill">Manager controls</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Welcome back.</h1>
        <p className="hero-subtitle">Signed in as {user.email}. Ready to open a new auction?</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="button" href="/create-trip">
            Create a trip
          </Link>
          <button className="button secondary" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-title">Next steps</div>
        <div className="stack">
          <div>
            <strong>Create a new trip</strong>
            <div className="muted">Define rooms, auction rules, and send your invite.</div>
          </div>
          <div>
            <strong>Visit an existing trip</strong>
            <div className="muted">Use a shared invite link to join the live lobby.</div>
          </div>
        </div>
      </section>
    </main>
  );
}
