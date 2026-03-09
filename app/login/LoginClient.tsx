"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  getAdditionalUserInfo,
} from "firebase/auth";
import { auth } from "@/src/lib/firebase";

function sanitizeNextPath(raw: string | null) {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

type LoginClientProps = {
  createAccountHref: string;
};

export default function LoginClient({ createAccountHref }: LoginClientProps) {
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

  function getGoogleErrorMessage(error: unknown) {
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case "auth/popup-blocked":
          return "The Google sign-in popup was blocked by the browser. Allow popups and try again.";
        case "auth/popup-closed-by-user":
          return "The Google sign-in popup was closed before finishing. Please try again.";
        case "auth/network-request-failed":
          return "Network error during Google sign-in. Check your connection and try again.";
        case "auth/unauthorized-domain":
          return "This domain is not allowed for Google sign-in in Firebase yet.";
        case "auth/operation-not-allowed":
          return "Google sign-in is not enabled in Firebase Auth yet.";
        default:
          return error.message || "Google sign in failed";
      }
    }

    return "Google sign in failed";
  }

  function getAppleErrorMessage(error: unknown) {
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case "auth/popup-blocked":
          return "The Apple sign-in popup was blocked by the browser. Allow popups and try again.";
        case "auth/popup-closed-by-user":
          return "The Apple sign-in popup was closed before finishing. Please try again.";
        case "auth/network-request-failed":
          return "Network error during Apple sign-in. Check your connection and try again.";
        case "auth/unauthorized-domain":
          return "This domain is not allowed for Apple sign-in in Firebase yet.";
        case "auth/operation-not-allowed":
          return "Apple sign-in is not enabled in Firebase Auth yet.";
        case "auth/invalid-credential":
          return "Apple sign-in was rejected because the Apple credentials or redirect settings do not match.";
        default:
          return error.message || "Apple sign in failed";
      }
    }

    return "Apple sign in failed";
  }

  function logGoogleError(error: unknown) {
    if (error instanceof FirebaseError) {
      console.error("[google-sign-in] failed", {
        code: error.code,
        message: error.message,
        customData: error.customData,
      });
      return;
    }

    if (error instanceof Error) {
      console.error("[google-sign-in] failed", {
        message: error.message,
        name: error.name,
      });
      return;
    }

    console.error("[google-sign-in] failed", { error });
  }

  function logAppleError(error: unknown) {
    if (error instanceof FirebaseError) {
      console.error("[apple-sign-in] failed", {
        code: error.code,
        message: error.message,
        customData: error.customData,
        credential: OAuthProvider.credentialFromError(error)
          ? {
              hasAccessToken: !!OAuthProvider.credentialFromError(error)?.accessToken,
              hasIdToken: !!OAuthProvider.credentialFromError(error)?.idToken,
            }
          : null,
      });
      return;
    }

    if (error instanceof Error) {
      console.error("[apple-sign-in] failed", {
        message: error.message,
        name: error.name,
      });
      return;
    }

    console.error("[apple-sign-in] failed", { error });
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
    console.log("[google-sign-in] button clicked", { nextPath });
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      console.log("[google-sign-in] popup start", {
        method: "signInWithPopup",
        providerId: provider.providerId,
      });
      const result = await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(result);
      console.log("[google-sign-in] success", {
        operationType: result.operationType,
        providerId: info?.providerId ?? provider.providerId,
        isNewUser: info?.isNewUser ?? null,
        uid: result.user.uid,
        email: result.user.email,
      });
      goToNext();
    } catch (e: unknown) {
      logGoogleError(e);
      setError(getGoogleErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleApple() {
    setError(null);
    setAppleHint(false);
    setBusy(true);
    console.log("[apple-sign-in] button clicked", { nextPath });
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      console.log("[apple-sign-in] provider created", {
        providerId: provider.providerId,
        scopes: ["email", "name"],
      });
      console.log("[apple-sign-in] popup start", {
        method: "signInWithPopup",
        providerId: provider.providerId,
      });
      const result = await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(result);
      const credential = OAuthProvider.credentialFromResult(result);
      console.log("[apple-sign-in] success", {
        operationType: result.operationType,
        providerId: info?.providerId ?? provider.providerId,
        isNewUser: info?.isNewUser ?? null,
        uid: result.user.uid,
        email: result.user.email,
        hasAccessToken: !!credential?.accessToken,
        hasIdToken: !!credential?.idToken,
      });
      goToNext();
    } catch (e: unknown) {
      logAppleError(e);
      setAppleHint(true);
      setError(getAppleErrorMessage(e));
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
            <Link className="button secondary" href={createAccountHref}>
              Create account
            </Link>
          </div>

          {error && <p className="notice">{error}</p>}
        </div>
      </section>
    </main>
  );
}
