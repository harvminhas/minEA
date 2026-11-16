"use client";

import { useState } from "react";
import type { SuggestedCapability, SuggestedDomain } from "@minea/types";

function updateDomain(domains: SuggestedDomain[], index: number, patch: Partial<SuggestedDomain>): SuggestedDomain[] {
  return domains.map((domain, i) => (i === index ? { ...domain, ...patch } : domain));
}

function updateCap(domain: SuggestedDomain, index: number, patch: Partial<SuggestedCapability>): SuggestedCapability[] {
  return domain.capabilities.map((cap, i) => (i === index ? { ...cap, ...patch } : cap));
}

export function CapabilityReview({
  domains,
  onChange,
  onAccept,
  onCancel,
  busy,
  error,
  warning,
  existing,
}: {
  domains: SuggestedDomain[];
  onChange: (next: SuggestedDomain[]) => void;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  warning?: string | null;
  existing?: boolean;
}) {
  const [adding, setAdding] = useState<{ domain: number; cap: number } | null>(null);
  const [draft, setDraft] = useState("");
  const capCount = domains.reduce((n, d) => n + d.capabilities.length, 0);
  const actCount = domains.reduce((n, d) => n + d.capabilities.reduce((m, c) => m + c.activities.length, 0), 0);

  const closeAdd = () => {
    setAdding(null);
    setDraft("");
  };
  const saveAdd = (domainIndex: number, capIndex: number) => {
    const name = draft.trim();
    if (name) {
      const domain = domains[domainIndex];
      if (domain) {
        const cap = domain.capabilities[capIndex];
        if (cap) onChange(updateDomain(domains, domainIndex, { capabilities: updateCap(domain, capIndex, { activities: [...cap.activities, name] }) }));
      }
    }
    closeAdd();
  };

  return (
    <section data-testid="capability-review">
      <div className="mb-3.5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold text-[#1c2230]">Suggested map</h2>
          <p className="text-[13px] text-[#6b7289]">
            {domains.length} domain{domains.length === 1 ? "" : "s"}, {capCount} capabilit{capCount === 1 ? "y" : "ies"}, {actCount} activit{actCount === 1 ? "y" : "ies"}
            {existing ? ". Only new activities will be added." : ". Use it now — you can rename or rearrange anything later."}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-[12.5px] font-medium text-[#5b4ce6]">
          Try again
        </button>
        <button
          type="button"
          disabled={busy || domains.length === 0}
          onClick={onAccept}
          className="inline-flex h-8 items-center rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Use this map"}
        </button>
      </div>
      {warning && <p className="mb-3 text-[12.5px] text-[#9a3412]">{warning}</p>}
      {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2" data-testid="capability-preview-grid">
        {domains.map((domain, di) => {
          const acts = domain.capabilities.reduce((n, c) => n + c.activities.length, 0);
          return (
            <article key={domain.id ?? `d${di}`} className="rounded-xl border border-[#e6e8ee] bg-white px-3.5 py-3">
              <h3 className="text-[13.5px] font-semibold text-[#1c2230]">{domain.name}</h3>
              <p className="mb-2 text-[11.5px] text-[#8b90a0]">
                {domain.capabilities.length} capabilit{domain.capabilities.length === 1 ? "y" : "ies"}, {acts} activit{acts === 1 ? "y" : "ies"}
              </p>
              <div className="space-y-2">
                {domain.capabilities.map((cap, ci) => (
                  <div key={cap.id ?? `c${di}-${ci}`} className="group/cap" data-testid="preview-capability">
                    <div className="flex items-center gap-1">
                      <div className="text-[13px] font-medium text-[#1c2230]">{cap.name}</div>
                      <button
                        type="button"
                        aria-label={`Remove ${cap.name}`}
                        className="text-[13px] leading-none text-[#8b90a0] opacity-0 hover:text-[#b42318] group-hover/cap:opacity-100"
                        onClick={() => onChange(updateDomain(domains, di, { capabilities: domain.capabilities.filter((_, i) => i !== ci) }))}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pl-0">
                      {cap.activities.map((act, ai) => (
                        <span key={`${act}-${ai}`} className="group/act inline-flex items-center text-[12.5px] text-[#4b5163]">
                          {act}
                          <button
                            type="button"
                            aria-label={`Remove ${act}`}
                            className="ml-0.5 text-[12px] leading-none text-[#8b90a0] opacity-0 hover:text-[#b42318] group-hover/act:opacity-100"
                            onClick={() =>
                              onChange(
                                updateDomain(domains, di, {
                                  capabilities: updateCap(domain, ci, { activities: cap.activities.filter((_, i) => i !== ai) }),
                                }),
                              )
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {adding?.domain === di && adding.cap === ci ? (
                        <input
                          data-testid="preview-add-activity"
                          aria-label="New activity name"
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveAdd(di, ci);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              closeAdd();
                            }
                          }}
                          onBlur={() => (draft.trim() ? saveAdd(di, ci) : closeAdd())}
                          className="w-[9.5rem] border-0 border-b border-[#5b4ce6] bg-transparent py-0 text-[12.5px] text-[#1c2230] outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          data-testid="preview-add-activity-btn"
                          aria-label={`Add an activity under ${cap.name}`}
                          className="text-[15px] leading-none text-[#5b4ce6]"
                          onClick={() => {
                            setAdding({ domain: di, cap: ci });
                            setDraft("");
                          }}
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
