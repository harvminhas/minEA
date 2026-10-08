"use client";

import { useState } from "react";
import { SignInError, useAuth, type SignInResult } from "@/lib/auth-context";
import { PROVIDER_LABEL, type ExistingAccountAdvice, type SocialProvider } from "@/lib/auth/errors";
import { ExistingAccountPanel, ProviderButtons } from "./ProviderButtons";

interface Props {
  /** Called once signed in (and, when it applies, after linking the pending credential). */
  onSignedIn: (result: SignInResult) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Continue with Google / Continue with Microsoft, with the errors people actually hit:
 * cancelled or blocked pop-ups, Microsoft not enabled yet, and an email that already has an
 * account under another method. In that last case the person signs in the old way here
 * (the password form appears only if that's an option) and the new credential is linked.
 */
export function SocialSignIn({ onSignedIn, disabled }: Props) {
  const { signInWithProvider, signInWithEmail, pendingLink } = useAuth();
  const [busy, setBusy] = useState<SocialProvider | "password" | null>(null);
  const [error, setError] = useState<{ text: string; soft: boolean } | null>(null);
  const [advice, setAdvice] = useState<ExistingAccountAdvice | null>(null);
  const [password, setPassword] = useState("");
  const [linkEmail, setLinkEmail] = useState("");

  async function finish(result: SignInResult) {
    setAdvice(null);
    await onSignedIn(result);
  }

  function fail(err: unknown) {
    if (err instanceof SignInError) {
      if (err.advice) {
        setAdvice(err.advice);
        setLinkEmail(err.info.email ?? "");
        setError(null);
        return;
      }
      setError({ text: err.info.message, soft: err.info.kind === "cancelled" });
      return;
    }
    setError({ text: err instanceof Error ? err.message : "Sign-in failed. Please try again.", soft: false });
  }

  async function handleProvider(provider: SocialProvider) {
    setError(null);
    setBusy(provider);
    try {
      await finish(await signInWithProvider(provider));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function handlePasswordLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("password");
    try {
      await finish(await signInWithEmail(linkEmail, password));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const offerPassword = !!advice?.options.includes("password");

  return (
    <div className="space-y-3">
      <ProviderButtons
        busy={busy}
        disabled={disabled}
        highlight={advice?.options ?? []}
        onSelect={(provider) => void handleProvider(provider)}
      />

      {advice && <ExistingAccountPanel advice={advice} />}

      {offerPassword && (
        <form onSubmit={handlePasswordLink} className="space-y-2" data-testid="link-password-form">
          <p className="text-xs text-gray-600">
            Signed up with an email and password? Enter them once to connect{" "}
            {PROVIDER_LABEL[pendingLink?.provider ?? "microsoft"]}.
          </p>
          <input
            type="email"
            required
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            placeholder="you@company.com"
            autoComplete="email"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
            placeholder="Password"
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
          >
            {busy === "password" ? "Please wait…" : "Sign in and connect"}
          </button>
        </form>
      )}

      {error && (
        <p role={error.soft ? "status" : "alert"} className={`text-xs ${error.soft ? "text-gray-500" : "text-red-600"}`}>
          {error.text}
        </p>
      )}
    </div>
  );
}
