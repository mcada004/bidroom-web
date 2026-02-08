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
      <Link className="brand" href="/">
        Bidroom
      </Link>

      <div className="nav-actions">
        {loading ? null : user ? (
          <>
            <Link className="button ghost" href="/create-trip">
              Create trip
            </Link>
            <button className="button secondary" onClick={handleSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link className="button secondary" href="/login">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
