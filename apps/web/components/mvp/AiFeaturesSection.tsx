"use client";

import { useState } from "react";
import { AI_FEATURE_CATALOG, AI_JOBS, type AiCatalogEntry, type AiFeature, type AiFeatureStatus, type MinEAObject, type YesNoUnknown } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useFeatureSave } from "@/lib/ai/use-feature-save";
import type { FieldEdge } from "@/lib/fields/save";
import { catalogEntriesFor, catalogEntry } from "@/lib/ai/catalog";
import {
  addCustomFeature,
  agentsTouching,
  aiColumnLabel,
  confirmFeature,
  featureCostLabel,
  featureFlags,
  readFeatures,
  removeFeature,
  setFeatureSeats,
  suggestedFeatures,
  updateFeature,
  type FeatureChanges,
} from "@/lib/ai/features";
import { readCostLines } from "@/lib/cost/math";

const STATUS_BUTTONS: { value: AiFeatureStatus; label: string }[] = [
  { value: "on", label: "On" },
  { value: "piloting", label: "Piloting" },
  { value: "off", label: "Off" },
];
const AUDIENCE = [
  { value: "everyone", label: "Everyone" },
  { value: "some_groups", label: "Some groups" },
  { value: "admins", label: "Admins only" },
];
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function checkedLabel(checked: string): string {
  const match = checked.match(/^(\d{4})-(\d{2})/);
  return match ? `catalog checked ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "";
}

function pricingLabel(entry: AiCatalogEntry): string {
  if (entry.pricing.model === "included") return "Included";
  if (entry.pricing.model === "usage") return `Usage-based · ${entry.pricing.note}`;
  return entry.pricing.seat_month_usd != null ? `Paid add-on · $${entry.pricing.seat_month_usd} /user/mo` : "Paid add-on";
}

function jobLabel(entry: AiCatalogEntry): string {
  return AI_JOBS.find((job) => job.value === entry.job)?.label.toLowerCase() ?? "";
}

function confirmedLabel(feature: AiFeature): string {
  if (!feature.confirmed_at) return "";
  const date = new Date(feature.confirmed_at);
  const day = Number.isNaN(date.getTime()) ? "" : ` · ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  return `Confirmed${feature.confirmed_by ? ` by ${feature.confirmed_by}` : ""}${day}`;
}

const yesNoTone = (value: YesNoUnknown) => (value === "yes" ? "text-[#b42318]" : value === "no" ? "text-[#15803d]" : "text-[#b45309]");

export function AiFeaturesSection({
  object,
  edges,
  names,
  readOnly,
}: {
  object: MinEAObject;
  edges: FieldEdge[];
  names: ReadonlyMap<string, string>;
  readOnly: boolean;
}) {
  const catalog = useModelCatalog();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const live = catalog.data?.objects.find((item) => item.id === object.id) ?? object;
  const person = user?.displayName || user?.email || "Someone";
  const actor = user?.uid || "user";
  const { save, error } = useFeatureSave(object.id, live);

  const features = readFeatures(live.properties);
  const suggestions = suggestedFeatures(live);
  const agents = agentsTouching(live.id, edges, names);
  const summary = aiColumnLabel(live);
  const change = (key: string, changes: FeatureChanges) => void save((current) => updateFeature(current, key, changes, person));

  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[#6b7289]">{summary || "No AI features recorded"}</span>
        {!readOnly && (
          <div className="relative">
            <button type="button" className="text-[12px] font-medium text-[#5b4ce6]" onClick={() => setAdding(true)}>
              + Add an AI feature
            </button>
            {adding && (
              <AddFeaturePopover
                host={live}
                stored={features}
                onCancel={() => setAdding(false)}
                onPick={(entry) => {
                  setAdding(false);
                  void save((current) => confirmFeature(current, entry, "on", person));
                }}
                onCustom={(name) => {
                  setAdding(false);
                  void save((current) => addCustomFeature(current, name, person));
                }}
              />
            )}
          </div>
        )}
      </div>

      {features.map((feature) =>
        feature.status === "unreviewed" ? (
          <ReviewCard
            key={feature.key}
            name={feature.name}
            host={live.name}
            entry={catalogEntry(feature.key)}
            readOnly={readOnly}
            onPick={(status) => change(feature.key, { status })}
            onRemove={() => void save((current) => removeFeature(current, feature.key))}
          />
        ) : (
          <FeatureCard
            key={feature.key}
            feature={feature}
            host={live}
            readOnly={readOnly}
            onChange={(changes) => change(feature.key, changes)}
            onSeats={(seats, priceCents) => void save((current) => setFeatureSeats(current, feature.key, seats, priceCents, actor))}
            onRemove={() => void save((current) => removeFeature(current, feature.key))}
          />
        )
      )}

      {suggestions.map((entry) => (
        <ReviewCard
          key={entry.key}
          name={entry.name}
          host={live.name}
          entry={entry}
          readOnly={readOnly}
          onPick={(status) => void save((current) => confirmFeature(current, entry, status, person))}
        />
      ))}

      {error && <p className="text-[12px] text-[#b42318]">{error}</p>}

      {agents.length > 0 && (
        <p className="text-[12px] text-[#6b7289]">
          Agents that touch {live.name}:{" "}
          {agents.map((agent, index) => (
            <span key={`${agent.id}-${agent.verb}`}>
              {index > 0 && " · "}
              <span className="font-medium text-[#5b4ce6]">{agent.name}</span> {agent.verb}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  readOnly,
  tone,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  readOnly: boolean;
  tone?: string;
  onChange: (value: string) => void;
}) {
  const shown = options.find((option) => option.value === value)?.label ?? "Not set";
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-[#6b7289]">{label}</span>
      {readOnly ? (
        <span className={tone}>{shown}</span>
      ) : (
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`h-7 rounded-md border border-transparent bg-transparent px-1 text-right text-[13px] hover:border-[#e6e8ee] ${tone ?? ""}`}
        >
          {!value && <option value="">Not set</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function FeatureCard({
  feature,
  host,
  readOnly,
  onChange,
  onSeats,
  onRemove,
}: {
  feature: AiFeature;
  host: MinEAObject;
  readOnly: boolean;
  onChange: (changes: FeatureChanges) => void;
  onSeats: (seats: number, priceCents: number) => void;
  onRemove: () => void;
}) {
  const entry = catalogEntry(feature.key);
  const line = feature.cost_line_id ? (readCostLines(host.properties) ?? []).find((item) => item.id === feature.cost_line_id) : undefined;
  const perUser = line?.calculation.kind === "per_user" ? line.calculation : null;
  const [editingSeats, setEditingSeats] = useState(false);
  const [seats, setSeats] = useState("");
  const [price, setPrice] = useState("");
  const [seatError, setSeatError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const cost = featureCostLabel(feature, host.properties);
  const flags = featureFlags(feature, host);
  const canSeat = !readOnly && entry?.pricing.model !== "included" && entry?.pricing.model !== "usage";

  const openSeats = () => {
    setSeats(perUser ? String(perUser.seats) : "");
    const cents = perUser ? perUser.unit_price_monthly_cents : entry?.pricing.seat_month_usd != null ? entry.pricing.seat_month_usd * 100 : null;
    setPrice(cents == null ? "" : String(cents / 100));
    setSeatError("");
    setEditingSeats(true);
  };
  const saveSeats = () => {
    const count = Number(seats);
    const dollars = Number(price.replace(/[$,\s]/g, ""));
    if (!seats.trim() || !Number.isInteger(count) || count < 0) return setSeatError("Seats must be a whole number");
    if (count > 0 && (!price.trim() || !Number.isFinite(dollars) || dollars < 0)) return setSeatError("Type the price per user per month");
    setEditingSeats(false);
    onSeats(count, Math.round((Number.isFinite(dollars) ? dollars : 0) * 100));
  };

  return (
    <div className="rounded-lg border border-[#e6e8ee] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-[#1c2230]">{feature.name}</span>
        <div className="flex overflow-hidden rounded-md border border-[#e6e8ee] text-[12px]">
          {STATUS_BUTTONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={readOnly}
              onClick={() => option.value !== feature.status && onChange({ status: option.value })}
              className={option.value === feature.status ? "bg-[#5b4ce6] px-2 py-0.5 font-semibold text-white" : "px-2 py-0.5 text-[#6b7289]"}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {entry && <p className="mb-1 text-[12px] text-[#8b90a0]">{entry.data_note}</p>}
      <Choice label="Who can use it" value={feature.audience ?? ""} options={AUDIENCE} readOnly={readOnly} onChange={(value) => onChange({ audience: value as AiFeature["audience"] })} />
      <Choice
        label="Can see company data"
        value={feature.sees_company_data}
        options={YES_NO}
        readOnly={readOnly}
        tone={yesNoTone(feature.sees_company_data)}
        onChange={(value) => onChange({ sees_company_data: value as YesNoUnknown })}
      />
      <Choice
        label="Vendor trains on your data"
        value={feature.vendor_trains}
        options={YES_NO}
        readOnly={readOnly}
        tone={yesNoTone(feature.vendor_trains)}
        onChange={(value) => onChange({ vendor_trains: value as YesNoUnknown })}
      />
      <div className="flex items-start justify-between gap-3 py-0.5">
        <span className="text-[#6b7289]">Extra cost</span>
        {editingSeats ? (
          <div
            className="flex flex-wrap items-center justify-end gap-1"
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditingSeats(false);
              if (event.key === "Enter") saveSeats();
            }}
          >
            <input aria-label="Seats" autoFocus inputMode="numeric" value={seats} onChange={(event) => setSeats(event.target.value)} className="h-7 w-14 rounded-md border border-[#e6e8ee] px-1 text-right" />
            <span className="text-[#6b7289]">seats × $</span>
            <input aria-label="Price per user per month" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className="h-7 w-16 rounded-md border border-[#e6e8ee] px-1 text-right" />
            <span className="text-[#6b7289]">/user/mo</span>
            <button type="button" onClick={saveSeats} className="rounded-md bg-[#5b4ce6] px-2 py-0.5 text-[12px] font-semibold text-white">Save</button>
            <button type="button" onClick={() => setEditingSeats(false)} className="px-1 text-[12px] text-[#6b7289]">Cancel</button>
            {seatError && <p className="w-full text-right text-[12px] text-[#b42318]">{seatError}</p>}
          </div>
        ) : canSeat ? (
          <button type="button" onClick={openSeats} className="text-right font-medium text-[#1c2230]">
            {cost || "Add seats"}
          </button>
        ) : (
          <span className="text-right text-[#1c2230]">{cost || "—"}</span>
        )}
      </div>
      {flags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {flags.map((flag) => (
            <span
              key={`${flag.id}-${flag.severity}`}
              className={flag.severity === "high" ? "rounded-full bg-[#fee4e2] px-2 py-0.5 text-[11px] font-medium text-[#b42318]" : "rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-medium text-[#b45309]"}
            >
              {flag.id} · {flag.title}
            </span>
          ))}
        </div>
      )}
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#8b90a0]">
        <span>{confirmedLabel(feature)}</span>
        {!readOnly &&
          (confirmRemove ? (
            <span>
              Remove this AI feature{line ? " and its cost line" : ""}?{" "}
              <button type="button" className="font-medium text-[#b42318]" onClick={onRemove}>Remove</button>{" · "}
              <button type="button" onClick={() => setConfirmRemove(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)}>Remove</button>
          ))}
      </div>
    </div>
  );
}

function ReviewCard({
  name,
  host,
  entry,
  readOnly,
  onPick,
  onRemove,
}: {
  name: string;
  host: string;
  entry: AiCatalogEntry | null;
  readOnly: boolean;
  onPick: (status: AiFeatureStatus) => void;
  onRemove?: () => void;
}) {
  const buttons: { value: AiFeatureStatus; label: string }[] = onRemove ? STATUS_BUTTONS : [...STATUS_BUTTONS, { value: "unreviewed", label: "Not sure" }];
  const meta = entry ? [pricingLabel(entry), jobLabel(entry) && `job: ${jobLabel(entry)}`, checkedLabel(entry.checked)].filter(Boolean).join(" · ") : "";
  return (
    <div className="rounded-lg border border-dashed border-[#f5c46b] bg-[#fffbeb] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold text-[#1c2230]">{name}</span>
        <span className="rounded-full bg-[#fde68a] px-1.5 py-0.5 text-[10px] font-semibold text-[#92400e]">Unreviewed</span>
      </div>
      <p className="mb-2 text-[12px] text-[#b45309]">
        {entry ? `The catalog says this exists on ${host}. Is it turned on?` : "Is it turned on?"}
      </p>
      {!readOnly && (
        <div className="mb-1 flex flex-wrap gap-1">
          {buttons.map((option) => (
            <button key={option.value} type="button" onClick={() => onPick(option.value)} className="rounded-md border border-[#e6e8ee] bg-white px-2 py-0.5 text-[12px] text-[#1c2230] hover:border-[#5b4ce6]">
              {option.label}
            </button>
          ))}
          {onRemove && (
            <button type="button" onClick={onRemove} className="px-2 py-0.5 text-[12px] text-[#6b7289]">Remove</button>
          )}
        </div>
      )}
      {meta && <p className="text-[11px] text-[#8b90a0]">{meta}</p>}
    </div>
  );
}

function AddFeaturePopover({
  host,
  stored,
  onPick,
  onCustom,
  onCancel,
}: {
  host: MinEAObject;
  stored: AiFeature[];
  onPick: (entry: AiCatalogEntry) => void;
  onCustom: (name: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const taken = new Set(stored.map((item) => item.key));
  const forHost = new Set(catalogEntriesFor(host).map((entry) => entry.key));
  const term = query.trim().toLowerCase();
  const options = AI_FEATURE_CATALOG.filter((entry) => !taken.has(entry.key))
    .filter((entry) => !term || `${entry.name} ${entry.vendor}`.toLowerCase().includes(term))
    .sort((left, right) => Number(forHost.has(right.key)) - Number(forHost.has(left.key)))
    .slice(0, 8);
  return (
    <div className="relative">
      <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={onCancel} />
      <div
        className="absolute right-0 z-20 mt-1 w-[300px] rounded-lg border border-[#e6e8ee] bg-white p-2 text-left shadow-lg"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <input
          autoFocus
          aria-label="Search AI features"
          value={query}
          placeholder="Search, e.g. Copilot"
          onChange={(event) => setQuery(event.target.value)}
          className="mb-1 h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[13px]"
        />
        {options.map((entry) => (
          <button key={entry.key} type="button" onClick={() => onPick(entry)} className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#fafafb]">
            {entry.name} <span className="text-[12px] text-[#8b90a0]">· {entry.vendor}</span>
          </button>
        ))}
        {query.trim() && (
          <button type="button" onClick={() => onCustom(query)} className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-[#5b4ce6] hover:bg-[#fafafb]">
            + Add “{query.trim()}” as your own
          </button>
        )}
      </div>
    </div>
  );
}
