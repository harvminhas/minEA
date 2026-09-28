"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { objectsApi } from "@/lib/api-client";
import { VendorField } from "@/components/mvp/VendorField";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import type { CatalogRow } from "@/lib/model-catalog";
import {
  COST_TYPE_LABEL,
  type CostFrequency,
  type CostLine,
  type CostLineType,
  formatDollars,
  lineAnnualCents,
  lineTitle,
  parseLegacyAnnualCost,
  readCostLines,
  dollarsFromCents,
  totalCents,
  oneTimeCents,
  runCents,
} from "@/lib/cost/math";

const TYPES: CostLineType[] = [
  "subscription",
  "support_maintenance",
  "hosting",
  "services_one_time",
  "internal_estimate",
  "other",
];

export function QuickCost({ row, onSaved }: { row: CatalogRow; onSaved: () => void }) {
  const { getToken, user } = useAuth();
  const actor = user?.uid || "user";
  const { orgSlug, workspaceSlug } = useTenancy();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async (amount: string) => {
      const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
      if (!Number.isFinite(cents) || cents <= 0) throw new Error("Type an annual amount, e.g. 4500");
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const now = new Date().toISOString();
      const line: CostLine = {
        id: crypto.randomUUID(),
        type: "subscription",
        amount_cents: cents,
        frequency: "annual",
        calculation: { kind: "flat" },
        vendor: row.vendor || null,
        source: "estimate",
        created_at: now,
        created_by: actor,
        updated_at: now,
        updated_by: actor,
      };
      await objectsApi.update(orgSlug, workspaceSlug, row.id, { properties: { cost_lines: [line] } }, token);
    },
    onSuccess: () => {
      setOpen(false);
      setValue("");
      onSaved();
    },
    onError: (err: Error) => setError(err.message),
  });
  if (!open) {
    return (
      <button
        type="button"
        className="text-[13px] font-medium text-[#c2410c]"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        + Add
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        save.mutate(value);
      }}
    >
      <span className="text-[#6b7289]">$</span>
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="w-20 rounded border border-[#e6e8ee] px-1.5 py-1 text-[13px]"
        placeholder="4500"
      />
      <span className="text-[12px] text-[#8b90a0]">/yr</span>
      {error && <span className="text-[11px] text-[#c2410c]">{error}</span>}
    </form>
  );
}

export function CostLinesEditor({
  lines,
  vendor,
  legacyDollars,
  actor,
  onChange,
}: {
  lines: CostLine[];
  vendor: string;
  legacyDollars: number | null;
  actor: string;
  onChange: (lines: CostLine[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const total = dollarsFromCents(totalCents(lines));
  const oneTime = dollarsFromCents(oneTimeCents(lines));

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12px] font-medium text-gray-600">Cost</span>
        {!adding && (
          <button type="button" className="text-[12px] font-medium text-[#5b4ce6]" onClick={() => setAdding(true)}>
            + Add cost line
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <p className="mb-2 text-[13px] text-[#1c2230]">
          {formatDollars(total)}/yr
          {oneTime > 0 ? ` · ${formatDollars(oneTime)} one-time` : ""}
        </p>
      )}
      {lines.length === 0 && legacyDollars != null && !adding && (
        <p className="mb-2 text-[12px] text-[#6b7289]">
          Annual cost {formatDollars(legacyDollars)} is on the item. Add a line to keep it or replace it.
        </p>
      )}
      {lines.length === 0 && legacyDollars == null && !adding && (
        <p className="mb-2 text-[12px] text-[#8b90a0]">No cost recorded yet.</p>
      )}
      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="flex items-start justify-between gap-2 rounded-lg border border-[#eef0f4] px-3 py-2 text-[13px]">
            <div>
              <div className="font-medium text-[#1c2230]">{lineTitle(line)}</div>
              <div className="text-[12px] text-[#6b7289]">
                {COST_TYPE_LABEL[line.type]}
                {line.vendor ? ` · ${line.vendor}` : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium text-[#1c2230]">
                {line.frequency === "one_time"
                  ? formatDollars(dollarsFromCents(line.amount_cents ?? 0))
                  : `${formatDollars(dollarsFromCents(lineAnnualCents(line)))}/yr`}
              </div>
              <button type="button" className="text-[12px] text-[#6b7289]" onClick={() => onChange(lines.filter((item) => item.id !== line.id))}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {adding && (
        <CostLineForm
          vendor={vendor}
          legacyDollars={lines.length === 0 ? legacyDollars : null}
          saving={false}
          error=""
          actor={actor}
          onCancel={() => setAdding(false)}
          onSave={(created, keepLegacy) => {
            const next = [...lines];
            if (keepLegacy && legacyDollars != null && lines.length === 0) next.push(legacyLine(legacyDollars, vendor, actor));
            next.push(created);
            onChange(next);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

export function CostSection({ row, onSaved }: { row: CatalogRow; onSaved: () => void }) {
  const { getToken, user } = useAuth();
  const actor = user?.uid || "user";
  const { orgSlug, workspaceSlug } = useTenancy();
  const properties = (row.object.properties ?? {}) as Record<string, unknown>;
  const lines = readCostLines(properties) ?? [];
  const legacy = lines.length ? null : parseLegacyAnnualCost(properties.annual_cost);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async (next: CostLine[]) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      await objectsApi.update(orgSlug, workspaceSlug, row.id, { properties: { cost_lines: next } }, token);
    },
    onSuccess: () => {
      setAdding(false);
      setError("");
      onSaved();
    },
    onError: (err: Error) => setError(err.message || "Could not save the cost line."),
  });

  const total = dollarsFromCents(totalCents(lines));
  const internal = dollarsFromCents(totalCents(lines) - runCents(lines));
  const oneTime = dollarsFromCents(oneTimeCents(lines));

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">COST</h3>
        {!adding && (
          <button type="button" className="text-[13px] font-medium text-[#5b4ce6]" onClick={() => setAdding(true)}>
            + Add cost line
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <div className="mb-3 rounded-xl border border-[#e6e8ee] px-3 py-3">
          <div className="text-[13px] text-[#6b7289]">Annual cost</div>
          <div className="text-[22px] font-semibold text-[#1c2230]">{formatDollars(total)}/yr</div>
          {internal > 0 && <div className="text-[12px] text-[#8b90a0]">incl. ~{formatDollars(internal)} internal (est.)</div>}
          {oneTime > 0 && <div className="text-[12px] text-[#8b90a0]">{formatDollars(oneTime)} one-time · not in annual</div>}
        </div>
      )}
      {lines.length === 0 && legacy != null && !adding && (
        <p className="mb-2 text-[13px] text-[#1c2230]">
          Annual cost {formatDollars(legacy)} from the annual cost field. Add a line to replace it, or keep it as its own line.
        </p>
      )}
      {lines.length === 0 && legacy == null && !adding && (
        <p className="text-[13px] text-[#8b90a0]">No cost recorded yet.</p>
      )}
      <div className="space-y-2">
        {lines.map((line) => (
          <div key={line.id} className="rounded-lg border border-[#eef0f4] px-3 py-2 text-[13px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-[#1c2230]">{lineTitle(line)}</div>
                <div className="text-[12px] text-[#6b7289]">
                  {COST_TYPE_LABEL[line.type]}
                  {line.vendor ? ` · ${line.vendor}` : ""}
                  {line.source === "estimate" ? " · Estimate" : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium text-[#1c2230]">
                  {line.frequency === "one_time"
                    ? formatDollars(dollarsFromCents(line.amount_cents ?? 0))
                    : `${formatDollars(dollarsFromCents(lineAnnualCents(line)))}/yr`}
                </div>
                <button
                  type="button"
                  className="text-[12px] text-[#6b7289]"
                  onClick={() => save.mutate(lines.filter((item) => item.id !== line.id))}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {adding && (
        <CostLineForm
          vendor={row.vendor}
          legacyDollars={lines.length === 0 ? legacy : null}
          saving={save.isPending}
          error={error}
          onCancel={() => {
            setAdding(false);
            setError("");
          }}
          actor={actor}
          onSave={(created, keepLegacy) => {
            const next = [...lines];
            if (keepLegacy && legacy != null) next.push(legacyLine(legacy, row.vendor, actor));
            next.push(created);
            save.mutate(next);
          }}
        />
      )}
      <p className="mt-2 text-[12px] text-[#8b90a0]">Amounts in US$. Vendor spend is the recurring total, excluding internal time and one-time cost.</p>
    </section>
  );
}

function legacyLine(dollars: number, vendor: string, actor: string): CostLine {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "subscription",
    label: "Annual cost",
    amount_cents: Math.round(dollars * 100),
    frequency: "annual",
    calculation: { kind: "flat" },
    vendor: vendor || null,
    source: "estimate",
    created_at: now,
    created_by: actor,
    updated_at: now,
    updated_by: actor,
    migrated_from: "annual_cost",
  };
}

function CostLineForm({
  vendor,
  legacyDollars,
  saving,
  error,
  actor,
  onCancel,
  onSave,
}: {
  vendor: string;
  legacyDollars: number | null;
  saving: boolean;
  error: string;
  actor: string;
  onCancel: () => void;
  onSave: (line: CostLine, keepLegacy: boolean) => void;
}) {
  const [type, setType] = useState<CostLineType>("subscription");
  const [label, setLabel] = useState("");
  const [calc, setCalc] = useState<"flat" | "per_user" | "pct_of_license">("flat");
  const [amount, setAmount] = useState("");
  const [seats, setSeats] = useState("");
  const [unit, setUnit] = useState("");
  const [pct, setPct] = useState("");
  const [license, setLicense] = useState("");
  const [frequency, setFrequency] = useState<CostFrequency>("annual");
  const [lineVendor, setLineVendor] = useState(vendor);
  const [source, setSource] = useState<"estimate" | "quote" | "invoice">("estimate");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [keepLegacy, setKeepLegacy] = useState(true);
  const [more, setMore] = useState(false);
  const [localError, setLocalError] = useState("");

  const internal = type === "internal_estimate";
  const oneTime = type === "services_one_time";
  const flatAmount = internal || oneTime || calc === "flat";
  const preview = previewCents({
    type,
    label,
    calc,
    amount,
    seats,
    unit,
    pct,
    license,
    frequency: oneTime ? "one_time" : frequency,
    vendor: lineVendor,
    source,
    paidOn,
    actor,
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  if (typeof document === "undefined") return null;

  const fieldClass = "mt-1 w-full rounded-lg border border-[#e6e8ee] px-2.5 py-2 text-[14px] text-[#1c2230]";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#1c2230]/45 px-4 pt-[10vh]">
      <form
        role="dialog"
        aria-labelledby="add-cost-line-title"
        className="max-h-[80vh] w-full max-w-[420px] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const line = buildLine({
            type,
            label,
            calc,
            amount,
            seats,
            unit,
            pct,
            license,
            frequency: oneTime ? "one_time" : frequency,
            vendor: internal ? "" : lineVendor,
            source: internal ? "estimate" : source,
            paidOn,
            actor,
          });
          if (!line) {
            setLocalError(flatAmount ? "Enter an amount first." : "Fill in the calculation first.");
            return;
          }
          setLocalError("");
          onSave(line, keepLegacy);
        }}
      >
        <h2 id="add-cost-line-title" className="text-[18px] font-semibold text-[#1c2230]">
          Add a cost line
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-[#6b7289]">
          {internal
            ? "Staff time. It stays on the item and is left out of vendor spend."
            : oneTime
              ? "A one-time service. It stays on the item and is left out of the annual total."
              : `A ${COST_TYPE_LABEL[type].toLowerCase()}, ${calc === "per_user" ? "priced per user" : calc === "pct_of_license" ? "taken as a percent of the licence" : "as a flat amount"}, ${frequency === "monthly" ? "billed every month" : "once a year"}.`}
        </p>

        {legacyDollars != null && (
          <div className="mt-4 rounded-xl bg-[#f7f7fb] p-3">
            <p className="text-[13px] text-[#1c2230]">This item already has {formatDollars(legacyDollars)} recorded.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKeepLegacy(true)}
                className={`rounded-lg px-2 py-2 text-[12px] font-medium ${keepLegacy ? "bg-[#5b4ce6] text-white" : "bg-white text-[#4b5163]"}`}
              >
                Keep it and add this
              </button>
              <button
                type="button"
                onClick={() => setKeepLegacy(false)}
                className={`rounded-lg px-2 py-2 text-[12px] font-medium ${!keepLegacy ? "bg-[#5b4ce6] text-white" : "bg-white text-[#4b5163]"}`}
              >
                Replace it
              </button>
            </div>
          </div>
        )}

        {flatAmount ? (
          <label className="mt-5 block">
            <span className="text-[13px] font-medium text-[#1c2230]">Amount</span>
            <span className="mt-1 flex items-center gap-2 rounded-xl border-2 border-[#5b4ce6] px-3">
              <span className="text-[18px] text-[#6b7289]">$</span>
              <input
                autoFocus
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="4500"
                className="w-full bg-transparent py-3 text-[28px] font-semibold text-[#1c2230] outline-none"
              />
              <span className="shrink-0 text-[13px] text-[#6b7289]">{oneTime ? "once" : frequency === "monthly" ? "/mo" : "/yr"}</span>
            </span>
          </label>
        ) : calc === "per_user" ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="text-[13px] font-medium text-[#1c2230]">
              Seats
              <input autoFocus value={seats} onChange={(event) => setSeats(event.target.value)} inputMode="numeric" className={fieldClass} />
            </label>
            <label className="text-[13px] font-medium text-[#1c2230]">
              US$ / user / month
              <input value={unit} onChange={(event) => setUnit(event.target.value)} inputMode="decimal" className={fieldClass} />
            </label>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="text-[13px] font-medium text-[#1c2230]">
              Percent
              <input autoFocus value={pct} onChange={(event) => setPct(event.target.value)} inputMode="decimal" className={fieldClass} />
            </label>
            <label className="text-[13px] font-medium text-[#1c2230]">
              Licence US$ / yr
              <input value={license} onChange={(event) => setLicense(event.target.value)} inputMode="decimal" className={fieldClass} />
            </label>
          </div>
        )}

        {preview != null && (
          <p className="mt-2 text-[14px] font-medium text-[#1c2230]">
            {oneTime ? `${formatDollars(dollarsFromCents(preview))} one-time, not in the annual total` : `Adds ${formatDollars(dollarsFromCents(preview))}/yr`}
          </p>
        )}

        <button type="button" className="mt-4 text-[13px] font-medium text-[#5b4ce6]" onClick={() => setMore((open) => !open)}>
          {more ? "Hide options" : "Change type, billing, or vendor"}
        </button>

        {more && (
          <div className="mt-3 space-y-3 border-t border-[#eef0f4] pt-3">
            <label className="block text-[12px] text-[#6b7289]">
              Type
              <select value={type} onChange={(event) => setType(event.target.value as CostLineType)} className={fieldClass}>
                {TYPES.map((item) => (
                  <option key={item} value={item}>
                    {COST_TYPE_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-[#6b7289]">
              Name <span className="text-[#8b90a0]">optional</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} className={fieldClass} />
            </label>
            {!oneTime && !internal && (
              <label className="block text-[12px] text-[#6b7289]">
                Calculation
                <select value={calc} onChange={(event) => setCalc(event.target.value as "flat" | "per_user" | "pct_of_license")} className={fieldClass}>
                  <option value="flat">Flat amount</option>
                  <option value="per_user">Per user</option>
                  <option value="pct_of_license">Percent of licence</option>
                </select>
              </label>
            )}
            {!oneTime && calc === "flat" && !internal && (
              <label className="block text-[12px] text-[#6b7289]">
                Billing
                <select value={frequency} onChange={(event) => setFrequency(event.target.value as CostFrequency)} className={fieldClass}>
                  <option value="annual">Once a year</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
            )}
            {oneTime && (
              <label className="block text-[12px] text-[#6b7289]">
                When was it paid?
                <input type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className={fieldClass} />
              </label>
            )}
            {!internal && (
              <label className="block text-[12px] text-[#6b7289]">
                Vendor on this line
                <VendorField value={lineVendor} onChange={setLineVendor} placeholder="Start typing a vendor" className={fieldClass} />
              </label>
            )}
            {!internal && (
              <label className="block text-[12px] text-[#6b7289]">
                Source
                <select value={source} onChange={(event) => setSource(event.target.value as "estimate" | "quote" | "invoice")} className={fieldClass}>
                  <option value="estimate">Estimate</option>
                  <option value="quote">Quote</option>
                  <option value="invoice">Invoice</option>
                </select>
              </label>
            )}
          </div>
        )}

        {(localError || error) && <p className="mt-3 text-[13px] text-[#c2410c]">{localError || error}</p>}
        <button type="submit" disabled={saving} className="mt-5 w-full rounded-xl bg-[#5b4ce6] py-2.5 text-[14px] font-semibold text-white">
          {saving ? "Saving…" : "Add this line"}
        </button>
        <button type="button" onClick={onCancel} className="mt-1 w-full py-2 text-[13px] text-[#6b7289]">
          Cancel
        </button>
      </form>
    </div>,
    document.body
  );
}

function dollarsToCents(value: string): number | null {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || value.trim() === "") return null;
  return Math.round(amount * 100);
}

function buildLine(input: {
  type: CostLineType;
  label: string;
  calc: "flat" | "per_user" | "pct_of_license";
  amount: string;
  seats: string;
  unit: string;
  pct: string;
  license: string;
  frequency: CostFrequency;
  vendor: string;
  source: "estimate" | "quote" | "invoice";
  paidOn: string;
  actor: string;
}): CostLine | null {
  const now = new Date().toISOString();
  const internal = input.type === "internal_estimate";
  const oneTime = input.type === "services_one_time";
  const calcKind = internal || oneTime ? "flat" : input.calc;
  let calculation: CostLine["calculation"] = { kind: "flat" };
  let amountCents: number | undefined;
  if (calcKind === "flat") {
    const cents = dollarsToCents(input.amount);
    if (cents == null) return null;
    amountCents = cents;
  } else if (calcKind === "per_user") {
    const seatCount = Number(input.seats);
    const unitCents = dollarsToCents(input.unit);
    if (!Number.isInteger(seatCount) || seatCount < 1 || unitCents == null) return null;
    calculation = { kind: "per_user", seats: seatCount, unit_price_monthly_cents: unitCents };
  } else {
    const percent = Number(input.pct);
    const licenseCents = dollarsToCents(input.license);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100 || licenseCents == null) return null;
    calculation = { kind: "pct_of_license", pct_bp: Math.round(percent * 100), license_amount_cents: licenseCents };
  }
  return {
    id: crypto.randomUUID(),
    type: input.type,
    label: input.label.trim() || undefined,
    amount_cents: amountCents,
    frequency: oneTime ? "one_time" : input.frequency,
    calculation,
    vendor: internal ? null : input.vendor.trim() || null,
    source: internal ? "estimate" : input.source,
    one_time_date: oneTime ? input.paidOn : undefined,
    created_at: now,
    created_by: input.actor,
    updated_at: now,
    updated_by: input.actor,
  };
}

function previewCents(input: Parameters<typeof buildLine>[0]): number | null {
  const line = buildLine(input);
  if (!line) return null;
  return line.frequency === "one_time" ? line.amount_cents ?? 0 : lineAnnualCents(line);
}
