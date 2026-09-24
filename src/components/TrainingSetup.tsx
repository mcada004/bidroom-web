"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/src/context/AuthContext";
import { TRAINING_OWNER_EMAIL, validateTrainingSnapshot } from "@/src/lib/training";
export default function TrainingSetup() {
  const { user, loading } = useAuth();
  const [connection, setConnection] = useState<{ keyId: string; publicKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file?: File) {
    if (!file || !user) return;
    setBusy(true); setError(null);
    try {
      if (file.size > 700000) throw new Error("Choose the compact training plan file.");
      const content = JSON.parse(await file.text());
      validateTrainingSnapshot(content);
      const response = await fetch("/api/training/connection", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(content) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setConnection(result.connection);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect the plan."); } finally { setBusy(false); }
  }
  if (loading) return <main className="page training-page"><p>Opening your account…</p></main>;
  if (!user) return <main className="page training-page"><h1>Connect your training plan</h1><p>Use your existing Bidroom login.</p><Link className="button" href="/login?next=/training/setup">Sign in to Bidroom</Link></main>;
  if (user.email?.toLowerCase() !== TRAINING_OWNER_EMAIL) return <main className="page training-page"><h1>Private training plan</h1><p>This dashboard belongs to a different account.</p></main>;
  return <main className="page training-page"><div className="training-heading"><h1>Connect your training plan</h1><Link href="/training" className="button secondary">Back to training</Link></div><section className="training-panel"><h2>{connection ? "Plan connected" : "One-time setup"}</h2><p>{connection ? "Your plan is saved privately to your Bidroom account." : "Load the prepared plan to connect your workouts and fueling to this account."}</p><label className="training-import-label">Prepared training plan<input type="file" accept=".json,application/json" disabled={busy} onChange={(e) => void upload(e.target.files?.[0])} /></label>{busy && <p role="status">Connecting your plan…</p>}{error && <p role="alert" className="training-error">{error}</p>}{connection && <><Link href="/training" className="button">Open training dashboard</Link><details className="training-connection-details"><summary>Update connection details</summary><p>This public encryption key lets the coaching workflow publish updates. Your private key stays in your account.</p><pre id="training-public-key">{JSON.stringify(connection, null, 2)}</pre></details></>}</section></main>;
}
