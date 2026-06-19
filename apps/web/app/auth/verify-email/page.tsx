"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

function VerifyEmailContent() {
  const { user, resendVerificationEmail, reloadUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") ?? "/home";

  const [message, setMessage] = useState<string | null>(null);
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoSent, setAutoSent] = useState(false);

  async function sendVerification() {
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
    if (autoSent || user?.emailVerified) return;
    setAutoSent(true);
    void sendVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [autoSent, user?.emailVerified]);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Verify your email</h1>
        <p className="text-sm text-gray-600 mb-4">
          We sent a verification link to <strong>{user?.email ?? "your email"}</strong>. Open it to
          unlock invites and other sensitive actions.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void sendVerification()}
            disabled={loading}
            className="w-full border border-gray-200 rounded-md py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? "Please wait…" : "Resend verification email"}
          </button>
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-medium"
          >
            I&apos;ve verified — continue
          </button>
        </div>

        {message && <p className="mt-4 text-xs text-gray-600">{message}</p>}
        {verifyLink && (
          <p className="mt-3 text-xs break-all">
            Verification link:{" "}
            <a href={verifyLink} className="text-indigo-600 underline">
              {verifyLink}
            </a>
          </p>
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
