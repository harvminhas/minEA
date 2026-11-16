"use client";

import type { SuggestedDomain } from "@minea/types";

function updateDomain(domains: SuggestedDomain[], index: number, patch: Partial<SuggestedDomain>): SuggestedDomain[] {
  return domains.map((domain, i) => (i === index ? { ...domain, ...patch } : domain));
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
  title,
}: {
  domains: SuggestedDomain[];
  onChange: (next: SuggestedDomain[]) => void;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  warning?: string | null;
  existing?: boolean;
  title?: string;
}) {
  const capCount = domains.reduce((n, d) => n + d.capabilities.length, 0);
  const actCount = domains.reduce((n, d) => n + d.capabilities.reduce((m, c) => m + c.activities.length, 0), 0);

  const moveDomain = (from: number, to: number) => {
    if (to < 0 || to >= domains.length) return;
    const next = [...domains];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <section data-testid="capability-review">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold text-[#1c2230]">{title ?? "Suggested map"}</h2>
          <p className="text-[13px] text-[#6b7289]">
            {domains.length} domain{domains.length === 1 ? "" : "s"} · {capCount} capabilit{capCount === 1 ? "y" : "ies"} · {actCount} activit{actCount === 1 ? "y" : "ies"}
            {existing ? ". Only new activities will be added." : "."} Click a name to rename. Nothing is saved until you accept.
          </p>
        </div>
        <button type="button" onClick={onCancel} className="inline-flex h-8 items-center rounded-md border border-[#e6e8ee] px-3 text-[12.5px] text-[#4b5163]">
          Start over
        </button>
        <button
          type="button"
          disabled={busy || domains.length === 0}
          onClick={onAccept}
          className="inline-flex h-8 items-center rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Accept all"}
        </button>
      </div>
      {warning && <p className="mb-3 text-[12.5px] text-[#9a3412]">{warning}</p>}
      {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}
      <div className="space-y-2">
        {domains.map((domain, di) => (
          <article key={domain.id ?? `d${di}`} className="overflow-hidden rounded-xl border border-[#e6e8ee] bg-white">
            <header className="flex items-center gap-2 border-b border-[#f3f4f8] bg-[#fafafb] px-2.5 py-2">
              <button type="button" className="text-[#8b90a0]" aria-label="Move domain up" onClick={() => moveDomain(di, di - 1)}>::</button>
              <input
                aria-label="Domain name"
                value={domain.name}
                onChange={(e) => onChange(updateDomain(domains, di, { name: e.target.value }))}
                className="min-w-[140px] flex-1 border-0 bg-transparent text-[13.5px] font-semibold outline-none"
              />
              <span className="text-[11px] text-[#8b90a0]">{domain.capabilities.length} capabilities</span>
              <button
                type="button"
                className="text-[12px] text-[#5b4ce6]"
                onClick={() => {
                  const name = "New capability";
                  const caps = [...domain.capabilities, { name, id: null, activities: [] }];
                  onChange(updateDomain(domains, di, { capabilities: caps }));
                }}
              >
                + Capability
              </button>
              <button
                type="button"
                className="text-[12px] text-[#8b90a0] hover:text-[#b42318]"
                aria-label={`Remove ${domain.name}`}
                onClick={() => onChange(domains.filter((_, i) => i !== di))}
              >
                ×
              </button>
            </header>
            <div className="px-3 py-2 pl-6">
              {domain.capabilities.map((cap, ci) => (
                <div key={cap.id ?? `c${di}-${ci}`} className="mb-1">
                  <div className="flex items-center gap-2 py-1">
                    <input
                      aria-label="Capability name"
                      value={cap.name}
                      onChange={(e) => {
                        const capabilities = domain.capabilities.map((c, i) => (i === ci ? { ...c, name: e.target.value } : c));
                        onChange(updateDomain(domains, di, { capabilities }));
                      }}
                      className="min-w-[120px] border-0 bg-transparent text-[13px] font-semibold outline-none"
                    />
                    <span className="flex-1" />
                    <button
                      type="button"
                      className="text-[12px] text-[#8b90a0] hover:text-[#b42318]"
                      aria-label={`Remove ${cap.name}`}
                      onClick={() => {
                        const capabilities = domain.capabilities.filter((_, i) => i !== ci);
                        onChange(updateDomain(domains, di, { capabilities }));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5 pl-4">
                    {cap.activities.map((act, ai) => (
                      <span key={`${act}-${ai}`} className="inline-flex items-center gap-1 rounded-md border border-[#eef0f4] px-2 py-0.5">
                        <input
                          aria-label="Activity name"
                          value={act}
                          onChange={(e) => {
                            const activities = cap.activities.map((a, i) => (i === ai ? e.target.value : a));
                            const capabilities = domain.capabilities.map((c, i) => (i === ci ? { ...c, activities } : c));
                            onChange(updateDomain(domains, di, { capabilities }));
                          }}
                          className="w-[9rem] border-0 bg-transparent text-[12.5px] outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${act}`}
                          className="text-[#8b90a0] hover:text-[#b42318]"
                          onClick={() => {
                            const activities = cap.activities.filter((_, i) => i !== ai);
                            const capabilities = domain.capabilities.map((c, i) => (i === ci ? { ...c, activities } : c));
                            onChange(updateDomain(domains, di, { capabilities }));
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="rounded-md border border-dashed border-[#d6d3f0] px-2 py-0.5 text-[12.5px] text-[#5b4ce6]"
                      onClick={() => {
                        const capabilities = domain.capabilities.map((c, i) => (i === ci ? { ...c, activities: [...c.activities, "New activity"] } : c));
                        onChange(updateDomain(domains, di, { capabilities }));
                      }}
                    >
                      + Activity
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-1 rounded-md border border-dashed border-[#d6d3f0] px-2 py-0.5 text-[12.5px] text-[#5b4ce6]"
                onClick={() => onChange(updateDomain(domains, di, { capabilities: [...domain.capabilities, { name: "New capability", id: null, activities: [] }] }))}
              >
                + Capability
              </button>
            </div>
          </article>
        ))}
        <button
          type="button"
          className="rounded-md border border-dashed border-[#d6d3f0] px-3 py-1.5 text-[12.5px] text-[#5b4ce6]"
          onClick={() => onChange([...domains, { name: "New domain", id: null, capabilities: [] }])}
        >
          + Domain
        </button>
      </div>
    </section>
  );
}
