"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/src/lib/firebase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormErrors = {
  firstName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

function validateSignUpForm(values: {
  firstName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): FormErrors {
  const errors: FormErrors = {};

  if (values.firstName.trim().length < 1) {
    errors.firstName = "First name is required.";
  }

  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export default function CreateAccountPage() {
  const router = useRouter();
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [busy, setBusy] = useState(false);

  function clearFieldError(field: keyof FormErrors) {
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setAccountExists(false);

    const nextErrors = validateSignUpForm({
      firstName,
      email,
      password,
      confirmPassword,
    });

    setErrors(nextErrors);
    if (nextErrors.confirmPassword) {
      window.alert("Passwords don't match. Please re-enter.");
      confirmPasswordRef.current?.focus();
      return;
    }

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedEmail = email.trim();

    setBusy(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);

      await updateProfile(credential.user, {
        displayName: trimmedFirstName,
      });

      await setDoc(
        doc(db, "users", credential.user.uid),
        {
          firstName: trimmedFirstName,
          email: trimmedEmail,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      router.push("/create-trip");
    } catch (error: unknown) {
      if (error instanceof FirebaseError) {
        if (error.code === "auth/email-already-in-use") {
          setAccountExists(true);
          setErrorMessage("An account with this email already exists.");
        } else if (error.code === "auth/invalid-email") {
          setErrors((prev) => ({ ...prev, email: "Please enter a valid email address." }));
        } else if (error.code === "auth/weak-password") {
          setErrors((prev) => ({
            ...prev,
            password: "Password must be at least 8 characters.",
          }));
        } else {
          setErrorMessage("We couldn't create your account right now. Please try again.");
        }
      } else {
        setErrorMessage("We couldn't create your account right now. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Create account</h1>
        <p className="hero-subtitle">
          Set up your account to start creating and managing group trip auctions.
        </p>
      </section>

      <section className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <label className="label">
            First name
            <input
              className="input"
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value);
                clearFieldError("firstName");
              }}
              autoComplete="given-name"
              placeholder="Alex"
            />
          </label>
          {errors.firstName ? <p className="notice">{errors.firstName}</p> : null}

          <label className="label">
            Email
            <input
              className="input"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearFieldError("email");
              }}
              autoComplete="email"
              placeholder="you@email.com"
            />
          </label>
          {errors.email ? <p className="notice">{errors.email}</p> : null}

          <label className="label">
            Password
            <input
              className="input"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError("password");
                clearFieldError("confirmPassword");
              }}
              autoComplete="new-password"
              type="password"
              placeholder="At least 8 characters"
            />
          </label>
          {errors.password ? <p className="notice">{errors.password}</p> : null}

          <label className="label">
            Confirm password
            <input
              ref={confirmPasswordRef}
              className="input"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                clearFieldError("confirmPassword");
              }}
              autoComplete="new-password"
              type="password"
              placeholder="Re-enter password"
            />
          </label>
          {errors.confirmPassword ? <p className="notice">{errors.confirmPassword}</p> : null}

          <div className="row">
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Creating account..." : "Create account"}
            </button>
            <Link className="button secondary" href="/login">
              Back to login
            </Link>
          </div>

          {errorMessage ? <p className="notice">{errorMessage}</p> : null}

          {accountExists ? (
            <p className="notice">
              You can sign in from the <Link className="link" href="/login">login page</Link>.
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
