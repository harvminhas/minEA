"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { apiV1Url } from "@/lib/api-base";

const INTEREST_OPTIONS = [
  { value: "business", label: "Business plan" },
  { value: "demo", label: "Product demo" },
  { value: "onboarding", label: "Guided onboarding" },
  { value: "other", label: "Something else" },
] as const;

interface Props {
  defaultInterest?: string;
}

export function ContactForm({ defaultInterest = "business" }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [interest, setInterest] = useState(defaultInterest);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in your name, email, and message.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(apiV1Url("/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || null,
          team_size: teamSize.trim() || null,
          interest,
          message: message.trim(),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : "Something went wrong. Please try again."
        );
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40";

  if (submitted) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
          <Check size={22} className="text-emerald-400" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Message received</h2>
        <p className="text-sm text-white/55 max-w-sm mx-auto">
          Thanks for reaching out. We&apos;ll get back to you at{" "}
          <span className="text-white/80">{email}</span> shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-left">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="contact-name" className="block text-sm font-medium text-white/70 mb-1.5">
            Name <span className="text-white/40">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className={inputClass}
            autoComplete="name"
            disabled={submitting}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-sm font-medium text-white/70 mb-1.5">
            Work email <span className="text-white/40">*</span>
          </label>
          <input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@company.com"
            className={inputClass}
            autoComplete="email"
            disabled={submitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="contact-company" className="block text-sm font-medium text-white/70 mb-1.5">
            Company
          </label>
          <input
            id="contact-company"
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className={inputClass}
            autoComplete="organization"
            disabled={submitting}
          />
        </div>
        <div>
          <label htmlFor="contact-team-size" className="block text-sm font-medium text-white/70 mb-1.5">
            Team size
          </label>
          <input
            id="contact-team-size"
            type="text"
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
            placeholder="e.g. 5–20 people"
            className={inputClass}
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-interest" className="block text-sm font-medium text-white/70 mb-1.5">
          I&apos;m interested in
        </label>
        <select
          id="contact-interest"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          className={inputClass}
          disabled={submitting}
        >
          {INTEREST_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-slate-900">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-white/70 mb-1.5">
          Message <span className="text-white/40">*</span>
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your team and what you're looking to accomplish…"
          rows={5}
          className={`${inputClass} resize-y min-h-[120px]`}
          disabled={submitting}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full sm:w-auto inline-flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
      >
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
