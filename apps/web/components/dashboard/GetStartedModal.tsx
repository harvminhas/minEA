"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { BuboMapMark } from "@/components/brand/BuboMapLogo";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { workspaceDashboardQueryKey } from "@/lib/use-workspace-dashboard";
import { AddDomainPickerDialog } from "@/components/capability-map/AddDomainPickerDialog";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  "Enterprise Architect",
  "Solutions Architect",
  "CTO / CIO",
  "VP / Director of Engineering",
  "Business Analyst",
  "Product Manager",
  "IT Manager",
  "Other",
];

const WIZARD_STEPS = [
  { id: 1, label: "Your org" },
  { id: 2, label: "Domains" },
  { id: 3, label: "Systems" },
  { id: 4, label: "Capabilities" },
  { id: 5, label: "Review" },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface DomainEntry {
  name: string;
  icon?: string;
  templateId?: string;
}

interface CapabilityRow {
  name: string;
  domainIndex: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  workspaceSlug: string;
  workspaceName: string;
}

// ─── Shared field components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
    />
  );
}

function SelectInput({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: readonly string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors pr-9",
          value ? "text-gray-900" : "text-gray-400"
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}

// ─── Step 1: Your org ─────────────────────────────────────────────────────────

function StepOrg({
  workspaceName,
  role,
  setRole,
}: {
  workspaceName: string;
  role: string;
  setRole: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tell us about your organisation</h2>
        <p className="text-sm text-gray-400 mt-1">
          This helps BuboMap suggest relevant domains and capabilities to get you started faster.
        </p>
      </div>
      <Field label="Workspace">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 select-none">
          {workspaceName}
        </div>
      </Field>
      <Field label="Your role">
        <SelectInput
          value={role}
          onChange={setRole}
          placeholder="Select your role…"
          options={ROLES}
        />
      </Field>
    </div>
  );
}

// ─── Step 2: Domains ─────────────────────────────────────────────────────────

function StepDomains({
  domains,
  onRemove,
  onOpenPicker,
}: {
  domains: DomainEntry[];
  onRemove: (i: number) => void;
  onOpenPicker: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Add your business domains</h2>
        <p className="text-sm text-gray-400 mt-1">
          Domains group capabilities by business area — e.g. Finance, Sales, Customer.
        </p>
      </div>

      {domains.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-5 py-8 flex flex-col items-center gap-3">
          <p className="text-sm text-gray-400">No domains added yet.</p>
          <button
            type="button"
            onClick={onOpenPicker}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus size={15} /> Add domain
          </button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {domains.map((d, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5"
              >
                <span className="flex-1 text-sm font-medium text-gray-800">{d.name}</span>
                {d.templateId && (
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Library</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onOpenPicker}
            className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
          >
            <Plus size={15} /> Add another domain
          </button>
        </>
      )}
    </div>
  );
}

// ─── Step 3: Systems ─────────────────────────────────────────────────────────

function StepSystems({
  systems,
  setSystems,
}: {
  systems: string[];
  setSystems: (v: string[]) => void;
}) {
  const add = () => setSystems([...systems, ""]);
  const remove = (i: number) => setSystems(systems.filter((_, idx) => idx !== i));
  const update = (i: number, v: string) => {
    const next = [...systems];
    next[i] = v;
    setSystems(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Add your key systems</h2>
        <p className="text-sm text-gray-400 mt-1">
          Systems are the tools and platforms your organisation runs on — e.g. Salesforce, SAP, custom apps.
        </p>
      </div>
      <div className="space-y-2.5">
        {systems.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <TextInput
              value={s}
              onChange={(v) => update(i, v)}
              placeholder={
                `e.g. ${["Salesforce", "SAP", "Jira", "AWS"][i] ?? "System name"}`
              }
              autoFocus={i === 0 && s === ""}
            />
            {systems.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {systems.length < 10 && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
        >
          <Plus size={15} /> Add system
        </button>
      )}
      <p className="text-xs text-gray-400">Optional — you can add systems later from the Repository.</p>
    </div>
  );
}

// ─── Step 4: Capabilities ─────────────────────────────────────────────────────

function StepCapabilities({
  capabilities,
  setCapabilities,
  domainNames,
}: {
  capabilities: CapabilityRow[];
  setCapabilities: (v: CapabilityRow[]) => void;
  domainNames: string[];
}) {
  const add = () => setCapabilities([...capabilities, { name: "", domainIndex: 0 }]);
  const remove = (i: number) => setCapabilities(capabilities.filter((_, idx) => idx !== i));
  const updateName = (i: number, name: string) => {
    const next = [...capabilities];
    next[i] = { ...next[i]!, name };
    setCapabilities(next);
  };
  const updateDomain = (i: number, domainIndex: number) => {
    const next = [...capabilities];
    next[i] = { ...next[i]!, domainIndex };
    setCapabilities(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Define capabilities</h2>
        <p className="text-sm text-gray-400 mt-1">
          Capabilities describe what your business does — e.g. Payments, Fraud detection, Customer onboarding.
        </p>
      </div>
      <div className="space-y-2.5">
        {capabilities.map((cap, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <TextInput
                value={cap.name}
                onChange={(v) => updateName(i, v)}
                placeholder={
                  `e.g. ${["Payments", "Customer onboarding", "Fraud detection", "Reporting"][i] ?? "Capability name"}`
                }
                autoFocus={i === 0 && cap.name === ""}
              />
            </div>
            {domainNames.length > 1 && (
              <div className="relative w-36 flex-shrink-0">
                <select
                  value={cap.domainIndex}
                  onChange={(e) => updateDomain(i, parseInt(e.target.value))}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors pr-7"
                >
                  {domainNames.map((name, di) => (
                    <option key={di} value={di}>
                      {name || `Domain ${di + 1}`}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>
            )}
            {capabilities.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {capabilities.length < 12 && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
        >
          <Plus size={15} /> Add capability
        </button>
      )}
      <p className="text-xs text-gray-400">Optional — you can add capabilities later from the Capability map.</p>
    </div>
  );
}

// ─── Step 5: Review ───────────────────────────────────────────────────────────

function StepReview({
  domains,
  filledSystems,
  filledCapabilities,
}: {
  domains: DomainEntry[];
  filledSystems: string[];
  filledCapabilities: CapabilityRow[];
  domainNames: string[];
}) {
  const total = domains.length + filledSystems.length + filledCapabilities.length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Ready to create</h2>
        <p className="text-sm text-gray-400 mt-1">
          {total} item{total !== 1 ? "s" : ""} will be added to your workspace.
        </p>
      </div>

      {domains.length > 0 && (
        <ReviewSection title="Domains" count={domains.length} color="indigo">
          {domains.map((d, i) => (
            <ReviewItem key={i} label={d.name} meta={d.templateId ? "Library" : undefined} />
          ))}
        </ReviewSection>
      )}

      {filledSystems.length > 0 && (
        <ReviewSection title="Systems" count={filledSystems.length} color="sky">
          {filledSystems.map((s, i) => (
            <ReviewItem key={i} label={s} />
          ))}
        </ReviewSection>
      )}

      {filledCapabilities.length > 0 && (
        <ReviewSection title="Capabilities" count={filledCapabilities.length} color="emerald">
          {filledCapabilities.map((cap, i) => (
            <ReviewItem
              key={i}
              label={cap.name}
              meta={domains[cap.domainIndex]?.name}
            />
          ))}
        </ReviewSection>
      )}

      {total === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-8 text-center">
          <p className="text-sm text-gray-400">Nothing entered yet — go back and add some items.</p>
        </div>
      )}
    </div>
  );
}

function ReviewSection({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: "indigo" | "sky" | "emerald";
  children: React.ReactNode;
}) {
  const dot: Record<string, string> = {
    indigo: "bg-indigo-400",
    sky: "bg-sky-400",
    emerald: "bg-emerald-400",
  };
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot[color])} />
        <span className="text-xs font-semibold text-gray-600">{title}</span>
        <span className="ml-auto text-xs text-gray-400">{count}</span>
      </div>
      <ul className="divide-y divide-gray-50">{children}</ul>
    </div>
  );
}

function ReviewItem({ label, meta }: { label: string; meta?: string }) {
  return (
    <li className="flex items-center justify-between px-4 py-2.5 text-sm text-gray-700">
      <span>{label}</span>
      {meta && <span className="text-xs text-gray-400">{meta}</span>}
    </li>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function GetStartedModal({ open, onClose, orgSlug, workspaceSlug, workspaceName }: Props) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [role, setRole] = useState("");
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [systems, setSystems] = useState<string[]>([""]);
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([{ name: "", domainIndex: 0 }]);
  const [domainPickerOpen, setDomainPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const filledSystems = systems.filter((s) => s.trim());
  const filledCapabilities = capabilities.filter((c) => c.name.trim());
  const domainNames = domains.map((d) => d.name);

  const canContinue = step !== 2 || domains.length > 0;

  const reset = () => {
    setStep(1);
    setRole("");
    setDomains([]);
    setSystems([""]);
    setCapabilities([{ name: "", domainIndex: 0 }]);
    setDomainPickerOpen(false);
    setError(null);
    setDone(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAddDomainFromLibrary = (name: string, icon: string, templateId: string) => {
    if (!domains.some((d) => d.name === name)) {
      setDomains((prev) => [...prev, { name, icon, templateId }]);
    }
    setDomainPickerOpen(false);
  };

  const handleCreateNewDomain = (name: string) => {
    if (!domains.some((d) => d.name === name)) {
      setDomains((prev) => [...prev, { name }]);
    }
    setDomainPickerOpen(false);
  };

  const handleCreate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // 1. Create domains sequentially to capture IDs in order
      const createdDomainIds: string[] = [];
      for (const d of domains) {
        const created = await objectsApi.create(
          orgSlug,
          workspaceSlug,
          { type: "business_domain", name: d.name, status: "active" },
          token
        );
        createdDomainIds.push(created.id);
      }

      // 2. Create systems in parallel
      await Promise.all(
        filledSystems.map((name) =>
          objectsApi.create(
            orgSlug,
            workspaceSlug,
            { type: "application", name: name.trim(), status: "active" },
            token
          )
        )
      );

      // 3. Create capabilities (each mapped to its domain by index)
      await Promise.all(
        filledCapabilities.map((cap) => {
          const domainId = createdDomainIds[cap.domainIndex] ?? createdDomainIds[0];
          return objectsApi.create(
            orgSlug,
            workspaceSlug,
            {
              type: "capability",
              name: cap.name.trim(),
              status: "active",
              properties: domainId ? { domain_id: domainId } : {},
            },
            token
          );
        })
      );

      await queryClient.invalidateQueries({
        queryKey: workspaceDashboardQueryKey(orgSlug, workspaceSlug),
      });

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  // ─── Success state ─────────────────────────────────────────────────────────
  if (done) {
    const total = domains.length + filledSystems.length + filledCapabilities.length;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-10 flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <Check size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Workspace ready!</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-xs">
            Created {total} item{total !== 1 ? "s" : ""} across your workspace. Head to the Capability
            map to start exploring.
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="mt-7 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    );
  }

  // ─── Wizard ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div
          className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full flex overflow-hidden"
          style={{ height: 540 }}
        >
          {/* Left sidebar */}
          <aside className="w-56 flex-shrink-0 bg-stone-50 border-r border-stone-100 flex flex-col">
            <div className="px-6 py-5 border-b border-stone-100">
              <BuboMapMark size={24} />
            </div>

            <nav className="flex-1 py-4 overflow-hidden">
              {WIZARD_STEPS.map((s, i) => {
                const isActive = s.id === step;
                const isPast = s.id < step;
                return (
                  <div key={s.id}>
                    <div className="flex items-center gap-3 px-5 py-2.5">
                      <span
                        className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors",
                          isActive
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                            : isPast
                            ? "bg-indigo-100 text-indigo-600"
                            : "border border-stone-300 text-stone-400"
                        )}
                      >
                        {isPast ? <Check size={12} /> : s.id}
                      </span>
                      <span
                        className={cn(
                          "text-[13px] transition-colors",
                          isActive
                            ? "font-semibold text-gray-900"
                            : isPast
                            ? "font-medium text-indigo-600"
                            : "text-stone-400"
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div className="ml-[34px] h-3.5 w-px bg-stone-200" />
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="px-6 py-5 border-t border-stone-100">
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
              >
                Skip setup
              </button>
            </div>
          </aside>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={handleClose}
              className="absolute top-4 right-4 h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X size={15} />
            </button>

            {/* Step content */}
            <div className="flex-1 overflow-y-auto px-8 py-7">
              {step === 1 && (
                <StepOrg workspaceName={workspaceName} role={role} setRole={setRole} />
              )}
              {step === 2 && (
                <StepDomains
                  domains={domains}
                  onRemove={(i) => setDomains((prev) => prev.filter((_, idx) => idx !== i))}
                  onOpenPicker={() => setDomainPickerOpen(true)}
                />
              )}
              {step === 3 && <StepSystems systems={systems} setSystems={setSystems} />}
              {step === 4 && (
                <StepCapabilities
                  capabilities={capabilities}
                  setCapabilities={setCapabilities}
                  domainNames={domainNames}
                />
              )}
              {step === 5 && (
                <StepReview
                  domains={domains}
                  filledSystems={filledSystems}
                  filledCapabilities={filledCapabilities}
                  domainNames={domainNames}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 border-t border-gray-100 px-8 py-4 flex items-center gap-4">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as typeof step)}
                  className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}

              <span className="flex-1 text-center text-xs text-gray-400">Step {step} of 5</span>

              {step < 5 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as typeof step)}
                  disabled={!canContinue}
                  className={cn(
                    "rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors",
                    canContinue
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isSubmitting || domains.length === 0}
                  className={cn(
                    "rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors",
                    domains.length > 0
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? "Creating…" : "Create & finish"}
                </button>
              )}
            </div>

            {error && <p className="px-8 pb-3 text-xs text-red-500 text-right">{error}</p>}
          </div>
        </div>
      </div>

      {/* Domain picker — renders on top of the wizard (z-[80/90] > z-50) */}
      {domainPickerOpen && (
        <AddDomainPickerDialog
          existingDomainNames={domainNames}
          onSelectLibrary={handleAddDomainFromLibrary}
          onCreateNew={handleCreateNewDomain}
          onClose={() => setDomainPickerOpen(false)}
        />
      )}
    </>
  );
}
