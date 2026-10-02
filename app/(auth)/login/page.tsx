"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveDestination } from "@/lib/auth-destination";

type Mode = "signin" | "signup";

function LoginForm() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchTo(nextMode: Mode) {
    if (submitting || signedIn) return;
    setMode(nextMode);
    setError(null);
    setNotice(null);
  }

  /// On success we deliberately do NOT reset `submitting` — the button stays
  /// in its loading state until navigation happens, so there is no flicker.
  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = createClient();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });

      console.log("[auth:signup]", {
        hasSession: !!data.session,
        hasUser: !!data.user,
        error: error?.message,
      });

      if (error) {
        setSubmitting(false);
        setError(error.message);
        return;
      }

      if (data.session) {
        const userId = data.user?.id;
        const dest = userId
          ? await resolveDestination(userId, supabase)
          : "/me";
        setSignedIn(true);
        router.push(dest);
        router.refresh();
        return;
      }

      if (data.user && !data.session) {
        // Email confirmation is on: the account exists but there is no
        // session yet. Flip the tab and keep the email in place.
        setSubmitting(false);
        setMode("signin");
        setError(null);
        setNotice("Account created. Please sign in.");
        setPassword("");
        setConfirm("");
        return;
      }

      setSubmitting(false);
      setError("Unknown state, try signing in");
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const supabase = createClient();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log("[auth:signin]", {
        hasSession: !!data.session,
        hasUser: !!data.user,
        error: error?.message,
      });

      if (error) {
        setSubmitting(false);
        setError(error.message);
        return;
      }

      if (data.session) {
        const userId = data.user?.id;
        const dest = userId
          ? await resolveDestination(userId, supabase)
          : "/me";
        setSignedIn(true);
        router.push(dest);
        router.refresh();
        return;
      }

      if (data.user && !data.session) {
        setSubmitting(false);
        setError("Signed in without a session. Please try again.");
        return;
      }

      setSubmitting(false);
      setError("Unknown state, try signing in");
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Unexpected error.");
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 px-4 py-2 font-body text-base font-semibold transition-colors ${
      active
        ? "bg-terracotta text-paper"
        : "bg-transparent text-inkfaded hover:text-ink"
    }`;

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="font-heading text-5xl">Learnova</h1>
        <p className="mt-2 text-inkfaded">
          An AI tutor that learns how you learn.
        </p>
      </div>

      <div className="card">
        <div className="mb-5 flex gap-1 rounded-sm border border-walnut p-1">
          <button
            type="button"
            onClick={() => switchTo("signin")}
            className={tabClass(mode === "signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchTo("signup")}
            className={tabClass(mode === "signup")}
          >
            Sign up
          </button>
        </div>

        <form
          onSubmit={mode === "signup" ? handleSignUp : handleSignIn}
          className="flex flex-col gap-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-inkfaded">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-inkfaded">Password</span>
            <input
              type="password"
              name="password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </label>

          {mode === "signup" && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-inkfaded">
                Confirm password
              </span>
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </label>
          )}

          {error && (
            <p className="rounded-sm bg-paperdark px-3 py-2 text-sm text-terracotta">
              {error}
            </p>
          )}

          {notice && (
            <p className="rounded-sm bg-paperdark px-3 py-2 text-sm text-moss">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || signedIn}
            className="btn-primary"
          >
            {submitting || signedIn
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-inkfaded">
        <Link href="/" className="underline hover:text-ink">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <LoginForm />
    </main>
  );
}