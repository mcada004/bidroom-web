"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useAuth } from "@/src/context/AuthContext";
import { auth } from "@/src/lib/firebase";

export default function Header() {
  const router = useRouter();
  const { user, loading } = useAuth();

  async function handleSignOut() {
    await signOut(auth);
    router.push("/");
  }

  return (
    <header className="top-nav">
      <div className="nav-left">
        <Link className="brand" href="/">
          Bidroom
        </Link>

        {!loading && user ? (
          <nav className="nav-menu" aria-label="Primary">
            <Link className="pill" href="/my-trips">
              My Trips
            </Link>
            <Link className="pill" href="/create-trip">
              Create Trip
            </Link>
            <Link className="pill" href="/account">
              My Account
            </Link>
          </nav>
        ) : null}
      </div>

      <div className="nav-actions">
        {loading ? null : user ? (
          <button className="button secondary" onClick={handleSignOut}>
            Sign out
          </button>
        ) : (
          <Link className="button secondary" href="/login">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
