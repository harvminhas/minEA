"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const INDUSTRIES = ["SaaS / Software", "Marketplace", "Banking", "Retail / E-commerce", "Insurance", "Healthcare", "Other…"];
const SIZES = ["1–50", "51–200", "201–1,000", "1,000+"];

export type InterviewValues = {
  about: string;
  industry: string;
  size: string;
  services: string;
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
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [services, setServices] = useState("");
  const [website, setWebsite] = useState("");

  return (
    <section className="mb-4 max-w-[560px] rounded-xl border border-[#e6e8ee] p-5" data-testid="capability-interview">
      <h2 className="text-[15px] font-semibold text-[#1c2230]">
        {existing ? "Suggest activities under your map" : "Tell us about your business"}
      </h2>
      <p className="mt-1 mb-4 text-[13px] text-[#6b7289]">
        {existing
          ? "We'll only propose Level 3 activities under the domains and capabilities you already have. Nothing is saved until you accept."
          : "We'll suggest a 3-level map from what you do — domains, capabilities, and the work under each. You can rename, move or drop anything before it's saved."}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSuggest({ about, industry, size, services, website });
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
            className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-2 text-[13px] text-[#1c2230] outline-none focus:border-[#5b4ce6]"
            placeholder="e.g. Regional outpatient clinic group. We run 12 clinics and bill insurers and patients."
          />
        </label>
        <fieldset className="mb-3.5">
          <legend className="mb-1 text-[12.5px] font-medium text-[#3c4254]">
            Industry <span className="font-normal text-[#8b90a0]">optional — helps the suggestion</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {INDUSTRIES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setIndustry(industry === name ? "" : name)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12.5px]",
                  industry === name ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mb-3.5">
          <legend className="mb-1 text-[12.5px] font-medium text-[#3c4254]">
            Size <span className="font-normal text-[#8b90a0]">people, roughly</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {SIZES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSize(size === name ? "" : name)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12.5px]",
                  size === name ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="mb-3.5 block">
          <span className="mb-1 block text-[12.5px] font-medium text-[#3c4254]">
            Key products or services <span className="font-normal text-[#8b90a0]">optional</span>
          </span>
          <input
            value={services}
            onChange={(e) => setServices(e.target.value)}
            className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-2 text-[13px] outline-none focus:border-[#5b4ce6]"
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
            className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-2 text-[13px] outline-none focus:border-[#5b4ce6]"
          />
        </label>
        {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
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
      <p className="mt-4 text-[12px] text-[#8b90a0]">Nothing is saved until you accept the suggestion.</p>
    </section>
  );
}
