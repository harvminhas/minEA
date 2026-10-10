"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { apiV1Url } from "@/lib/api-base";
import { useOptionalAuth } from "@/lib/auth-context";
import { BUSINESS_MIN_LICENCES } from "@/lib/billing/plans";
import {
  BUSINESS_REQUEST_ENDPOINT,
  BUSINESS_REQUEST_THANKS,
  businessRequestBody,
  validateBusinessRequest,
  type BusinessBillingPeriod,
  type BusinessPaymentMethod,
  type BusinessRequestErrors,
} from "@/lib/billing/business-request";

interface Props {
  theme?: "light" | "dark";
  orgSlug?: string | null;
  source?: string | null;
  /** Shown after a successful submit, e.g. to close a dialog. */
  onDone?: () => void;
}

const THEMES = {
  light: {
    label: "text-gray-700",
    input:
      "border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:ring-indigo-500",
    hint: "text-gray-400",
    error: "text-red-600",
    choice: "border-gray-300 text-gray-700",
    choiceOn: "border-indigo-500 bg-indigo-50 text-indigo-700",
    done: "text-gray-700",
  },
  dark: {
    label: "text-white/70",
    input:
      "border-white/15 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400 focus:ring-indigo-400",
    hint: "text-white/40",
    error: "text-red-300",
    choice: "border-white/15 text-white/70",
    choiceOn: "border-indigo-400 bg-indigo-500/20 text-white",
    done: "text-white/80",
  },
} as const;

/**
 * Business plan "Get started" form. Works signed out; signed in, the work email is prefilled
 * from the account. Submits to POST /api/v1/contact/business.
 */
export function BusinessGetStartedForm({ theme = "light", orgSlug, source, onDone }: Props) {
  const t = THEMES[theme];
  const auth = useOptionalAuth();
  const accountEmail = auth?.user?.email ?? "";
  const [name, setName] = useState(auth?.user?.displayName ?? "");
  const [emailEdited, setEmailEdited] = useState<string | null>(null);
  const email = emailEdited ?? accountEmail;
  const [company, setCompany] = useState("");
  const [licences, setLicences] = useState(String(BUSINESS_MIN_LICENCES));
  const [billingPeriod, setBillingPeriod] = useState<BusinessBillingPeriod>("annual");
  const [paymentMethod, setPaymentMethod] = useState<BusinessPaymentMethod>("invoice");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<BusinessRequestErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = { name, email, company, licences, billingPeriod, paymentMethod, message, orgSlug, source };
    const found = validateBusinessRequest(input);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiV1Url(BUSINESS_REQUEST_ENDPOINT), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(businessRequestBody(input)),
      });
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div data-testid="business-request-done" className={`flex items-start gap-3 text-sm ${t.done}`}>
        <Check size={18} className="mt-0.5 flex-shrink-0 text-emerald-500" />
        <div>
          <p>{BUSINESS_REQUEST_THANKS}</p>
          {onDone && (
            <button type="button" onClick={onDone} className="mt-3 font-medium text-indigo-500 hover:underline">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  const field = `mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${t.input}`;
  const choice = (on: boolean) =>
    `flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${on ? t.choiceOn : t.choice}`;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="business-get-started-form">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={`block text-sm font-medium ${t.label}`}>
          Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          {errors.name && <span className={`mt-1 block text-xs ${t.error}`}>{errors.name}</span>}
        </label>
        <label className={`block text-sm font-medium ${t.label}`}>
          Work email
          <input
            className={field}
            type="email"
            value={email}
            onChange={(e) => setEmailEdited(e.target.value)}
            autoComplete="email"
          />
          {errors.email && <span className={`mt-1 block text-xs ${t.error}`}>{errors.email}</span>}
        </label>
        <label className={`block text-sm font-medium ${t.label}`}>
          Company
          <input
            className={field}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoComplete="organization"
          />
          {errors.company && <span className={`mt-1 block text-xs ${t.error}`}>{errors.company}</span>}
        </label>
        <label className={`block text-sm font-medium ${t.label}`}>
          Licences needed
          <input
            className={field}
            type="number"
            min={BUSINESS_MIN_LICENCES}
            step={1}
            value={licences}
            onChange={(e) => setLicences(e.target.value)}
          />
          <span className={`mt-1 block text-xs ${errors.licences ? t.error : t.hint}`}>
            {errors.licences ?? `${BUSINESS_MIN_LICENCES} or more. Viewers are free.`}
          </span>
        </label>
      </div>

      <fieldset>
        <legend className={`text-sm font-medium ${t.label}`}>Billing</legend>
        <div className="mt-1 flex gap-2">
          {(["monthly", "annual"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={billingPeriod === v} onClick={() => setBillingPeriod(v)} className={choice(billingPeriod === v)}>
              {v === "monthly" ? "Monthly" : "Annual"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={`text-sm font-medium ${t.label}`}>Pay by</legend>
        <div className="mt-1 flex gap-2">
          {(["card", "invoice"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={paymentMethod === v} onClick={() => setPaymentMethod(v)} className={choice(paymentMethod === v)}>
              {v === "card" ? "Card" : "Invoice"}
            </button>
          ))}
        </div>
      </fieldset>

      <label className={`block text-sm font-medium ${t.label}`}>
        Message <span className={`font-normal ${t.hint}`}>(optional)</span>
        <textarea className={field} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>

      {submitError && (
        <p role="alert" className={`text-sm ${t.error}`}>
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-70"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        Send request
      </button>
    </form>
  );
}
