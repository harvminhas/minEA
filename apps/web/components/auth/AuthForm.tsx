"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { postAuthDestination, verificationPagePath } from "@/lib/auth-routes";
import { passwordSignInEnabled } from "@/lib/auth/flags";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { SocialSignIn } from "./SocialSignIn";
import { PasswordUsersNote } from "./ProviderButtons";

interface Props {
  mode: "sign-in" | "sign-up";
}

/**
 * Sign in / sign up: Google or Microsoft. The email/password form shows only when
 * NEXT_PUBLIC_PASSWORD_SIGNIN is on (default in `next dev`, off in production builds).
 */
export function AuthForm({ mode }: Props) {
  const { signInWithEmail, signUpWithEmail, refreshSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") ?? "/home";
  const showPassword = passwordSignInEnabled();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isSignIn = mode === "sign-in";

  async function goOn() {
    const sessionUser = await refreshSession();
    router.replace(postAuthDestination(redirectUrl, !sessionUser?.requiresEmailVerification));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignIn) {
        await signInWithEmail(email, password);
        await goOn();
        return;
      } else {
        await signUpWithEmail(email, password);
        router.replace(verificationPagePath(redirectUrl));
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-xl p-8 shadow-xl">
      <div className="mb-6">
        <BuboMapWordmark size="md" theme="light" />
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-1">
        {isSignIn ? "Sign in" : "Create your account"}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {isSignIn ? "Welcome back." : "Start mapping your IT landscape with your Google or Microsoft work account."}
      </p>

      <SocialSignIn onSignedIn={goOn} disabled={loading} />

      {showPassword ? (
        <>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-gray-400">or continue with email (test accounts)</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="password-form">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-medium transition-colors"
            >
              {loading ? "Please wait..." : isSignIn ? "Sign in" : "Create account"}
            </button>
          </form>
        </>
      ) : (
        <div className="mt-6">
          <PasswordUsersNote />
        </div>
      )}

      <p className="mt-6 text-sm text-gray-500 text-center">
        {isSignIn ? "No account yet?" : "Already have an account?"}{" "}
        <Link
          href={isSignIn ? `/auth/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}` : `/auth/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`}
          className="text-indigo-600 hover:text-indigo-700 font-medium"
        >
          {isSignIn ? "Sign up" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
