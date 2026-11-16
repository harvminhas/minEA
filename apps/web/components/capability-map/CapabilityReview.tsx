"use client";

import { useState } from "react";
import type { SuggestedCapability, SuggestedDomain } from "@minea/types";
import { cn } from "@/lib/utils";
import { decorateDomain, domainTheme } from "@/lib/domain-theme";
import { domainIcon } from "@/lib/capability-map-icons";

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
  initialStep,
  initialDomain,
  showcaseHover,
}: {
  domains: SuggestedDomain[];
  onChange: (next: SuggestedDomain[]) => void;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
  warning?: string | null;
  existing?: boolean;
  initialStep?: 1 | 2;
  initialDomain?: string;
  showcaseHover?: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(existing ? 2 : (initialStep ?? 1));
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainDraft, setDomainDraft] = useState("");
  const [addingCap, setAddingCap] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [adding, setAdding] = useState<{ domain: number; cap: number } | null>(null);
  const [draft, setDraft] = useState("");
  const startIndex = Math.max(0, domains.findIndex((d) => d.name === initialDomain));
  const [selected, setSelected] = useState(startIndex === -1 ? 0 : startIndex);

  const selectedIndex = Math.min(selected, Math.max(0, domains.length - 1));
  const active = domains[selectedIndex];

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
  const saveDomain = () => {
    const name = domainDraft.trim();
    if (name) onChange([...domains, decorateDomain({ name, capabilities: [] })]);
    setAddingDomain(false);
    setDomainDraft("");
  };
  const saveCap = () => {
    const name = capDraft.trim();
    if (name && active) {
      onChange(updateDomain(domains, selectedIndex, { capabilities: [...active.capabilities, { name, activities: [] }] }));
    }
    setAddingCap(false);
    setCapDraft("");
  };

  return (
    <section data-testid="capability-review">
      <div className="mb-3.5 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-baseline gap-2.5 text-[22px] font-semibold tracking-[-0.02em] text-[#1c2230]">
            {step === 1 ? "Your domains" : "Capabilities and activities"}
            {!existing && <span className="text-[12.5px] font-medium tracking-normal text-[#8b90a0]">{step} of 2</span>}
          </h2>
          <p className="mt-0.5 text-[13px] text-[#6b7289]">
            {step === 1
              ? `${domains.length} domain${domains.length === 1 ? "" : "s"}. Remove any that don’t apply, then continue.`
              : existing
                ? "Only new activities will be added."
                : "Review a domain if you want to change it — the rest will be used as suggested."}
          </p>
        </div>
        {step === 1 ? (
          <>
            <button type="button" onClick={onCancel} className="self-center text-[12.5px] font-medium text-[#5b4ce6]">
              Try again
            </button>
            <button
              type="button"
              data-testid="preview-step-next"
              disabled={busy || domains.length === 0}
              onClick={() => setStep(2)}
              className="inline-flex h-8 items-center self-center rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              Next
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="preview-step-back"
              onClick={() => (existing ? onCancel() : setStep(1))}
              className="self-center text-[12.5px] font-medium text-[#5b4ce6]"
            >
              {existing ? "Try again" : "Back"}
            </button>
            <button
              type="button"
              data-testid="preview-use-map"
              disabled={busy || domains.length === 0}
              onClick={onAccept}
              className="inline-flex h-8 items-center self-center rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Use this map"}
            </button>
          </>
        )}
      </div>
      {warning && <p className="mb-3 text-[12.5px] text-[#9a3412]">{warning}</p>}
      {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}

      {step === 1 ? (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2" data-testid="preview-domain-grid">
          {domains.map((domain, di) => {
            const item = decorateDomain(domain);
            const theme = domainTheme(item.color);
            const Icon = domainIcon(item.icon);
            return (
              <article
                key={domain.id ?? `d${di}`}
                data-testid="preview-domain-tile"
                data-hover={showcaseHover && di === 0 ? "true" : undefined}
                className="group/tile flex items-start gap-2.5 rounded-xl border border-[#e6e8ee] bg-white py-3 pl-3 pr-3.5"
                style={{ borderLeftWidth: 4, borderLeftColor: theme.accent }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: theme.tint, color: theme.ink }}
                  aria-hidden
                >
                  <Icon size={16} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1">
                    <h3 className="text-[13.5px] font-semibold leading-snug text-[#1c2230]">{domain.name}</h3>
                    <button
                      type="button"
                      aria-label={`Remove ${domain.name}`}
                      className="text-[16px] leading-none text-[#8b90a0] opacity-0 hover:text-[#b42318] group-hover/tile:opacity-100 group-hover/tile:text-[#b42318] data-[show=true]:opacity-100 data-[show=true]:text-[#b42318]"
                      data-show={showcaseHover && di === 0 ? "true" : undefined}
                      onClick={() => onChange(domains.filter((_, i) => i !== di))}
                    >
                      ×
                    </button>
                  </div>
                  {domain.description ? <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#6b7289]">{domain.description}</p> : null}
                </div>
              </article>
            );
          })}
          {addingDomain ? (
            <div className="flex min-h-[66px] items-center rounded-xl border border-dashed border-[#e6e8ee] px-3.5">
              <input
                data-testid="preview-add-domain-input"
                aria-label="New domain name"
                autoFocus
                value={domainDraft}
                onChange={(e) => setDomainDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveDomain();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setAddingDomain(false);
                    setDomainDraft("");
                  }
                }}
                onBlur={() => (domainDraft.trim() ? saveDomain() : (setAddingDomain(false), setDomainDraft("")))}
                className="w-full border-0 bg-transparent py-1 text-[13px] text-[#1c2230] outline-none"
                placeholder="Domain name"
              />
            </div>
          ) : (
            <button
              type="button"
              data-testid="preview-add-domain"
              onClick={() => {
                setAddingDomain(true);
                setDomainDraft("");
              }}
              className="flex min-h-[66px] items-center rounded-xl border border-dashed border-[#e6e8ee] px-3.5 text-left text-[13px] font-medium text-[#5b4ce6]"
            >
              <span className="mr-1.5 text-[15px] leading-none">+</span> Domain
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[280px_1fr]">
          <nav className="overflow-hidden rounded-xl border border-[#e6e8ee] bg-white" aria-label="Domains" data-testid="preview-domain-nav">
            {domains.map((domain, di) => {
              const item = decorateDomain(domain);
              const theme = domainTheme(item.color);
              const Icon = domainIcon(item.icon);
              const on = di === selectedIndex;
              const n = domain.capabilities.length;
              return (
                <button
                  key={domain.id ?? `n${di}`}
                  type="button"
                  onClick={() => setSelected(di)}
                  className={cn("flex w-full items-start gap-2 border-b border-[#f3f4f8] px-3 py-2.5 text-left last:border-b-0", on && "font-semibold")}
                  style={on ? { background: theme.tint, boxShadow: `inset 3px 0 0 ${theme.accent}` } : undefined}
                >
                  <span
                    className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md"
                    style={{ background: theme.tint, color: theme.ink }}
                    aria-hidden
                  >
                    <Icon size={12} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-[13px] leading-snug text-[#1c2230]", on && "font-semibold")}>{domain.name}</span>
                    <span className="mt-px block text-[11.5px] text-[#8b90a0]">
                      {n} capabilit{n === 1 ? "y" : "ies"}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
          {active ? (
            <div
              className="rounded-xl border border-[#e6e8ee] bg-white py-3.5 pl-3.5 pr-4"
              style={{ borderLeftWidth: 4, borderLeftColor: domainTheme(decorateDomain(active).color).accent }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: domainTheme(decorateDomain(active).color).tint, color: domainTheme(decorateDomain(active).color).ink }}
                  aria-hidden
                >
                  {(() => {
                    const Icon = domainIcon(decorateDomain(active).icon);
                    return <Icon size={13} strokeWidth={2} />;
                  })()}
                </span>
                <h3 className="text-[13.5px] font-semibold text-[#1c2230]">{active.name}</h3>
                <span className="text-[11.5px] text-[#8b90a0]">
                  {active.capabilities.length} capabilit{active.capabilities.length === 1 ? "y" : "ies"},{" "}
                  {active.capabilities.reduce((n, c) => n + c.activities.length, 0)} activit
                  {active.capabilities.reduce((n, c) => n + c.activities.length, 0) === 1 ? "y" : "ies"}
                </span>
              </div>
              <div className="grid gap-3">
                {active.capabilities.map((cap, ci) => (
                  <div key={cap.id ?? `c${selectedIndex}-${ci}`} className="group/cap" data-testid="preview-capability">
                    <div className="flex items-center gap-1">
                      <div className="text-[13px] font-medium text-[#1c2230]">{cap.name}</div>
                      <button
                        type="button"
                        aria-label={`Remove ${cap.name}`}
                        className="text-[15px] leading-none text-[#8b90a0] opacity-0 hover:text-[#b42318] group-hover/cap:opacity-100"
                        onClick={() => onChange(updateDomain(domains, selectedIndex, { capabilities: active.capabilities.filter((_, i) => i !== ci) }))}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      {cap.activities.map((act, ai) => (
                        <span key={`${act}-${ai}`} className="group/act inline-flex items-center text-[12.5px] text-[#4b5163]">
                          {act}
                          <button
                            type="button"
                            aria-label={`Remove ${act}`}
                            className="ml-0.5 text-[15px] leading-none text-[#8b90a0] opacity-0 hover:text-[#b42318] group-hover/act:opacity-100"
                            onClick={() =>
                              onChange(
                                updateDomain(domains, selectedIndex, {
                                  capabilities: updateCap(active, ci, { activities: cap.activities.filter((_, i) => i !== ai) }),
                                }),
                              )
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {adding?.domain === selectedIndex && adding.cap === ci ? (
                        <input
                          data-testid="preview-add-activity"
                          aria-label="New activity name"
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveAdd(selectedIndex, ci);
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              closeAdd();
                            }
                          }}
                          onBlur={() => (draft.trim() ? saveAdd(selectedIndex, ci) : closeAdd())}
                          className="w-[9.5rem] border-0 border-b border-[#5b4ce6] bg-transparent py-0 text-[12.5px] text-[#1c2230] outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          data-testid="preview-add-activity-btn"
                          aria-label={`Add an activity under ${cap.name}`}
                          className="text-[15px] leading-none text-[#5b4ce6]"
                          onClick={() => {
                            setAdding({ domain: selectedIndex, cap: ci });
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
              {addingCap ? (
                <input
                  data-testid="preview-add-capability-input"
                  aria-label="New capability name"
                  autoFocus
                  value={capDraft}
                  onChange={(e) => setCapDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCap();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setAddingCap(false);
                      setCapDraft("");
                    }
                  }}
                  onBlur={() => (capDraft.trim() ? saveCap() : (setAddingCap(false), setCapDraft("")))}
                  placeholder="Capability name"
                  className="mt-3.5 w-[12rem] border-0 border-b border-[#5b4ce6] bg-transparent py-0 text-[12.5px] text-[#1c2230] outline-none"
                />
              ) : (
                <button
                  type="button"
                  data-testid="preview-add-capability"
                  onClick={() => {
                    setAddingCap(true);
                    setCapDraft("");
                  }}
                  className="mt-3.5 text-[12.5px] font-medium text-[#5b4ce6]"
                >
                  + Capability
                </button>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-[#6b7289]">No domains left. Go back to add one, or try again.</p>
          )}
        </div>
      )}
    </section>
  );
}
