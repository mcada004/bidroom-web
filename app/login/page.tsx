"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { auth } from "@/src/lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [appleHint, setAppleHint] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSignUp() {
    setError(null);
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setAppleHint(false);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/");
    } catch (e: any) {
      setError(e?.message ?? "Google sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    setError(null);
    setAppleHint(false);
    setBusy(true);
    try {
      const provider = new OAuthProvider("apple.com");
      await signInWithPopup(auth, provider);
      router.push("/");
    } catch (e: any) {
      setAppleHint(true);
      setError(e?.message ?? "Apple sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Sign in</h1>
        <p className="hero-subtitle">
          Access your trips, manage auctions, and share invite links with your group.
        </p>
      </section>

      <section className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="stack">
          <div className="stack">
            <button className="button" disabled={busy} onClick={handleGoogle}>
              Continue with Google
            </button>
            <button className="button secondary" disabled={busy} onClick={handleApple}>
              Continue with Apple
            </button>
            {appleHint && (
              <div className="notice">
                Apple sign in requires the Apple provider to be enabled in Firebase Auth.
              </div>
            )}
          </div>

          <div className="row" style={{ justifyContent: "center" }}>
            <span className="pill">Or use email</span>
          </div>

          <label className="label">
            Email
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
            />
          </label>

          <label className="label">
            Password
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="password"
              autoComplete="current-password"
            />
          </label>

          <div className="row">
            <button className="button" disabled={busy} onClick={handleSignIn}>
              Sign in
            </button>
            <button className="button secondary" disabled={busy} onClick={handleSignUp}>
              Create account
            </button>
          </div>

          {error && <p className="notice">{error}</p>}
        </div>
      </section>
    </main>
  );
}
