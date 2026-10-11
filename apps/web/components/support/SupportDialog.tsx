"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supportApi } from "@/lib/api-client";
import {
  SUPPORT_THANKS,
  SUPPORT_TOPICS,
  parseCheckoutSessionId,
  supportRequestBody,
  type SupportTopic,
} from "@/lib/support";

interface Props {
  orgSlug: string;
  onClose: () => void;
  initialTopic?: SupportTopic;
  initialMessage?: string;
  checkoutSessionId?: string | null;
  /** Where the form was opened from (billing, menu, checkout). */
  source?: string;
}

/** Short Help form. Org slug, email and any checkout session are attached automatically. */
export function SupportDialog({ orgSlug, onClose, initialTopic = "other", initialMessage = "", checkoutSessionId, source }: Props) {
  const { getToken, user } = useAuth();
  const [topic, setTopic] = useState<SupportTopic>(initialTopic);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const session = parseCheckoutSessionId(checkoutSessionId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError("Tell us a little about what's happening.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await supportApi.submit(orgSlug, supportRequestBody({ topic, message, checkoutSessionId: session, source }), token!);
      setDone(true);
    } catch {
      setError("We couldn't send that just now. Please try again, or email architect@bubomap.com.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        data-testid="support-dialog"
        className="fixed left-1/2 top-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 text-left text-gray-900 shadow-xl"
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h3 id="support-title" className="text-lg font-semibold">Get help</h3>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>
        {done ? (
          <div data-testid="support-done" className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <Check size={16} className="mt-0.5 flex-shrink-0 text-emerald-600" />
            <div>
              <p>{SUPPORT_THANKS}</p>
              <button type="button" onClick={onClose} className="mt-3 font-medium text-indigo-600 hover:underline">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-500">We&apos;ll reply by email.</p>
            <label className="block text-sm font-medium text-gray-700">
              Topic
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value as SupportTopic)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {SUPPORT_TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Message
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <dl data-testid="support-attached" className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <p className="mb-1 font-medium text-gray-600">Sent with your message</p>
              <div className="flex gap-2"><dt>Organisation:</dt><dd className="text-gray-700">{orgSlug}</dd></div>
              <div className="flex gap-2"><dt>Email:</dt><dd className="text-gray-700">{user?.email ?? "your account email"}</dd></div>
              {session && (
                <div className="flex gap-2"><dt>Checkout:</dt><dd className="break-all text-gray-700">{session}</dd></div>
              )}
            </dl>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-70"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Send
            </button>
          </form>
        )}
      </div>
    </>
  );
}
