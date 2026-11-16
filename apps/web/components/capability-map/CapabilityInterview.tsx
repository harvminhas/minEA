"use client";

import { useState } from "react";

export type InterviewValues = {
  about: string;
  website: string;
};

export function CapabilityInterview({
  existing,
  busy,
  error,
  onSuggest,
  onAddYourself,
}: {
  existing?: boolean;
  busy?: boolean;
  error?: string;
  onSuggest: (values: InterviewValues) => void;
  onAddYourself?: () => void;
}) {
  const [about, setAbout] = useState("");
  const [website, setWebsite] = useState("");
  const canSubmit = about.trim().length > 0 && !busy;

  return (
    <section className="mb-4 max-w-[560px] rounded-xl border border-[#e6e8ee] p-5" data-testid="capability-interview">
      <h2 className="text-[15px] font-semibold text-[#1c2230]">
        {existing ? "Suggest activities under your map" : "Tell us about your business"}
      </h2>
      <p className="mt-1 mb-4 text-[13px] text-[#6b7289]">
        {existing
          ? "We'll only propose Level 3 activities under the domains and capabilities you already have. Nothing is saved until you use this map."
          : "We'll suggest a starting map from what you do. You can change names later."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSuggest({ about: about.trim(), website: website.trim() });
        }}
      >
        <label className="mb-3.5 block">
          <span className="mb-1 block text-[12.5px] font-medium text-[#3c4254]">
            What does the company do? <span className="font-normal text-[#8b90a0]">One or two sentences is enough.</span>
          </span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={3}
            required
            aria-label="What does the company do?"
            className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-2 text-[13px] text-[#1c2230] outline-none focus:border-[#5b4ce6]"
            placeholder="e.g. Regional outpatient clinic group. We run 12 clinics and bill insurers and patients."
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-[12.5px] font-medium text-[#3c4254]">
            Website <span className="font-normal text-[#8b90a0]">optional — we'll only read the public page</span>
          </span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            aria-label="Website"
            className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-2 text-[13px] outline-none focus:border-[#5b4ce6]"
          />
        </label>
        {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-8 items-center rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Suggesting…" : existing ? "Suggest activities" : "Suggest a capability map"}
          </button>
          {onAddYourself && (
            <button type="button" onClick={onAddYourself} className="text-[12.5px] font-medium text-[#5b4ce6]">
              Or add one capability yourself
            </button>
          )}
        </div>
      </form>
      <p className="mt-4 text-[12px] text-[#8b90a0]">Nothing is saved until you use the suggestion.</p>
    </section>
  );
}
