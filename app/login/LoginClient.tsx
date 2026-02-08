"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { auth } from "@/src/lib/firebase";

function sanitizeNextPath(raw: string | null) {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [showResetForm, setShowResetForm] = useState(false);
  const [appleHint, setAppleHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const nextPath = sanitizeNextPath(searchParams.get("next"));

  function goToNext() {
    router.push(nextPath);
  }

  function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof FirebaseError && error.message) {
      return error.message;
    }
    return fallback;
  }

  function getResetErrorMessage(code?: string) {
    switch (code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/too-many-requests":
        return "Too many requests. Please wait a bit and try again.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      default:
        return "We couldn't send a reset link right now. Please try again.";
    }
  }

  async function handleSignUp() {
    setError(null);
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      goToNext();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Sign up failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      goToNext();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Sign in failed"));
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
      goToNext();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Google sign in failed"));
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
      goToNext();
    } catch (e: unknown) {
      setAppleHint(true);
      setError(getErrorMessage(e, "Apple sign in failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    setResetError(null);
    setResetSuccess(null);

    const trimmedEmail = resetEmail.trim();
    if (!trimmedEmail) {
      setResetError("Please enter a valid email address.");
      return;
    }

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSuccess("If an account exists for that email, you'll receive a reset link.");
    } catch (e: unknown) {
      const code = e instanceof FirebaseError ? e.code : undefined;
      if (code === "auth/user-not-found") {
        setResetSuccess("If an account exists for that email, you'll receive a reset link.");
      } else {
        setResetError(getResetErrorMessage(code));
      }
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
        {nextPath !== "/" ? (
          <p className="notice" style={{ maxWidth: 520, margin: "16px auto 0" }}>
            Sign in or create an account to continue.
          </p>
        ) : null}
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

          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              setShowResetForm((prev) => !prev);
              setResetError(null);
              setResetSuccess(null);
              if (!resetEmail.trim()) {
                setResetEmail(email.trim());
              }
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 14,
              textAlign: "left",
            }}
          >
            Forgot password?
          </button>

          {showResetForm && (
            <div className="stack">
              <label className="label">
                Reset email
                <input
                  className="input"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@email.com"
                  autoComplete="email"
                />
              </label>

              <div className="row">
                <button className="button secondary" disabled={busy} onClick={handlePasswordReset}>
                  Send reset link
                </button>
              </div>

              {resetError && <p className="notice">{resetError}</p>}
              {resetSuccess && <p className="notice">{resetSuccess}</p>}
            </div>
          )}

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
