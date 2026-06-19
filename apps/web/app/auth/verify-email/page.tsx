"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function VerifyEmailContent() {
  const { user, isLoaded, sessionReady, resendVerificationEmail, reloadUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") ?? "/home";
  const token = searchParams.get("token");

  const [message, setMessage] = useState<string | null>(null);
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoSent, setAutoSent] = useState(false);
  const [tokenHandled, setTokenHandled] = useState(false);
  const [verifiedViaLink, setVerifiedViaLink] = useState(false);

  async function sendVerification() {
    if (!user) {
      setMessage("Sign in to send a verification email.");
      return;
    }
    setLoading(true);
    setMessage(null);
    setVerifyLink(null);
    try {
      const result = await resendVerificationEmail();
      setMessage(result.message);
      if (result.verification_link) setVerifyLink(result.verification_link);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send verification email");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || tokenHandled) return;
    setTokenHandled(true);
    setLoading(true);
    void (async () => {
      try {
        const result = await authApi.confirmEmailVerification(token);
        setVerifiedViaLink(true);
        setMessage(result.message);
        if (user) {
          await reloadUser();
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not verify email");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, tokenHandled, user, reloadUser]);

  useEffect(() => {
    if (!isLoaded || !sessionReady || token || autoSent || verifiedViaLink) return;
    if (!user) return;
    if (!user.requiresEmailVerification) {
      router.replace(redirectUrl);
      return;
    }
    setAutoSent(true);
    void sendVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when auth is ready
  }, [isLoaded, sessionReady, user, token, autoSent, verifiedViaLink, redirectUrl, router]);

  async function handleContinue() {
    setLoading(true);
    setMessage(null);
    try {
      await reloadUser();
      router.replace(redirectUrl);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded || !sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!user && !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Verify your email</h1>
          <p className="text-sm text-gray-600 mb-4">Sign in to send or resend your verification email.</p>
          <Link
            href={`/auth/sign-in?redirect_url=${encodeURIComponent("/auth/verify-email")}`}
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-4 py-2.5 text-sm font-medium"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const showResend = !token && !verifiedViaLink && user?.requiresEmailVerification;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          {verifiedViaLink ? "Email verified" : "Verify your email"}
        </h1>
        {verifiedViaLink ? (
          <p className="text-sm text-gray-600 mb-4">
            Your email is verified. Sign in or continue to minEA.
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-4">
            We sent a verification link to <strong>{user?.email ?? "your email"}</strong>. Open it to
            unlock invites and other sensitive actions.
          </p>
        )}

        <div className="space-y-2">
          {showResend && (
            <button
              type="button"
              onClick={() => void sendVerification()}
              disabled={loading}
              className="w-full border border-gray-200 rounded-md py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Resend verification email"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-medium"
          >
            {verifiedViaLink ? "Continue to minEA" : "I've verified — continue"}
          </button>
        </div>

        {message && (
          <p
            className={`mt-4 text-xs ${verifiedViaLink ? "text-green-700" : "text-gray-600"}`}
          >
            {message}
          </p>
        )}
        {verifyLink && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium mb-1">Local dev — verification link</p>
            <a href={verifyLink} className="text-indigo-700 underline break-all">
              {verifyLink}
            </a>
          </div>
        )}

        <p className="mt-6 text-sm text-gray-500 text-center">
          Wrong address?{" "}
          <Link href="/auth/sign-in" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Sign in with a different account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-gray-400">Loading…</p>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
