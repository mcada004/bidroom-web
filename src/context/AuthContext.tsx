"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";
import { getPreferredDisplayName } from "@/src/lib/authGuests";

type AuthValue = {
  user: User | null;
  loading: boolean;
  profileDisplayName: string | null;
  preferredDisplayName: string;
};

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  profileDisplayName: null,
  preferredDisplayName: "Participant",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUserProfile: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, (u) => {
      if (unsubUserProfile) {
        unsubUserProfile();
        unsubUserProfile = null;
      }

      setUser(u);

      if (!u) {
        setProfileDisplayName(null);
        setLoading(false);
        return;
      }

      unsubUserProfile = onSnapshot(
        doc(db, "users", u.uid),
        (snap) => {
          const data = snap.data() as { displayName?: unknown } | undefined;
          setProfileDisplayName(typeof data?.displayName === "string" ? data.displayName : null);
          setLoading(false);
        },
        () => {
          setProfileDisplayName(null);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubUserProfile) unsubUserProfile();
      unsub();
    };
  }, []);

  const preferredDisplayName = useMemo(
    () => getPreferredDisplayName(user, profileDisplayName),
    [user, profileDisplayName]
  );

  return (
    <AuthContext.Provider value={{ user, loading, profileDisplayName, preferredDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
