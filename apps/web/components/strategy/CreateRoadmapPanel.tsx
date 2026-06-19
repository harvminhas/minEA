"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { LinkDebtDialog } from "@/components/strategy/LinkDebtDialog";
import { PickProductDialog } from "@/components/strategy/PickProductDialog";
import {
  buildRoadmapProperties,
  isoToMonthInput,
  monthInputToEndDate,
  monthInputToStartDate,
  RELATIVE_DURATION_OPTIONS,
  roadmapStatusToObjectStatus,
  ROADMAP_KINDS,
  ROADMAP_STATUS,
  INVESTMENT_CATEGORIES,
  defaultInvestmentCategory,
  TECH_DEBT_EFFORT,
  TIMELINE_UNITS,
  type TimelineUnit,
} from "@/lib/roadmap-utils";
import { aiRoleFromProperties } from "@/lib/ai-role-utils";
import { AiRoleField } from "@/components/ui/AiRoleField";
import type { AiRole, MinEAObject, RoadmapDebtRef, RoadmapItemProperties, RoadmapProductRef } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  defaultProduct?: RoadmapProductRef | null;
  defaultOwner?: string;
  lockProduct?: boolean;
  debtCandidates?: RoadmapDebtRef[];
  onClose: () => void;
  onSuccess: (roadmapId: string) => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 pr-8"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
        ▾
      </span>
    </div>
  );
}

function defaultDateBoundMonths(): { start: string; end: string } {
  const now = new Date();
  const start = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const endD = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1));
  const end = `${endD.getUTCFullYear()}-${String(endD.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end };
}

function initFromRoadmap(item?: MinEAObject) {
  const props = (item?.properties ?? {}) as RoadmapItemProperties;
  const defaults = defaultDateBoundMonths();
  const timelineMode =
    props.timeline_mode ??
    (props.timeline_duration && props.timeline_unit
      ? "relative"
      : props.timeline_start_date
        ? "date_bound"
        : "relative");

  return {
    title: item?.name ?? "",
    description: item?.description ?? "",
    tags: (item?.tags ?? []).join(", "),
    kind: props.roadmap_kind ?? "initiative",
    product: props.product ?? null,
    resolvesDebt: props.resolves_debt ?? [],
    owner: item?.owner ?? "",
    roadmapStatus: props.roadmap_status ?? "discovery",
    timelineMode: timelineMode as "date_bound" | "relative",
    timelineStartMonth: props.timeline_start_date
      ? isoToMonthInput(props.timeline_start_date)
      : defaults.start,
    timelineEndMonth: props.timeline_end_date
      ? isoToMonthInput(props.timeline_end_date)
      : defaults.end,
    timelineDuration: props.timeline_duration ?? 12,
    timelineUnit: (props.timeline_unit ?? "weeks") as TimelineUnit,
    effortEstimate: props.effort_estimate ?? "",
    cost: props.cost != null ? String(props.cost) : "",
    investmentCategory: props.investment_category ?? defaultInvestmentCategory(props.roadmap_kind ?? "epic"),
    blockedReason: props.blocked_reason ?? "",
    aiRole: aiRoleFromProperties(props.ai_role),
  };
}

async function syncRoadmapRelationships(
  orgSlug: string,
  workspaceSlug: string,
  roadmapId: string,
  resolvesDebt: RoadmapDebtRef[],
  token: string
) {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: roadmapId },
    token
  );

  for (const rel of existing) {
    if (rel.from_type === "roadmap_item" && rel.type === "resolves") {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  for (const debt of resolvesDebt) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "resolves",
        from_object_id: roadmapId,
        from_type: "roadmap_item",
        to_object_id: debt.debt_id,
        to_type: "tech_debt",
      },
      token
    );
  }
}

export function CreateRoadmapPanel({
  initialValues,
  defaultProduct,
  defaultOwner,
  lockProduct = false,
  debtCandidates,
  onClose,
  onSuccess,
}: Props) {
  const isEdit = !!initialValues;
  const init = initFromRoadmap(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState(init.title);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [kind, setKind] = useState<string>(init.kind);
  const [product, setProduct] = useState<RoadmapProductRef | null>(init.product ?? defaultProduct ?? null);
  const [resolvesDebt, setResolvesDebt] = useState<RoadmapDebtRef[]>(init.resolvesDebt);
  const ownership = useOwnershipForm({ ...init, owner: init.owner || defaultOwner || "" });
  const [roadmapStatus, setRoadmapStatus] = useState<string>(init.roadmapStatus);
  const [timelineMode, setTimelineMode] = useState<"date_bound" | "relative">(init.timelineMode);
  const [timelineStartMonth, setTimelineStartMonth] = useState(init.timelineStartMonth);
  const [timelineEndMonth, setTimelineEndMonth] = useState(init.timelineEndMonth);
  const [timelineDuration, setTimelineDuration] = useState(init.timelineDuration);
  const [timelineUnit, setTimelineUnit] = useState<TimelineUnit>(init.timelineUnit);
  const [effortEstimate, setEffortEstimate] = useState<string>(init.effortEstimate);
  const [cost, setCost] = useState(init.cost);
  const [investmentCategory, setInvestmentCategory] = useState(init.investmentCategory);
  const [aiRole, setAiRole] = useState<AiRole>(init.aiRole);
  const [blockedReason, setBlockedReason] = useState(init.blockedReason);
  const [error, setError] = useState<string | null>(null);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [showDebtDialog, setShowDebtDialog] = useState(false);

  useEffect(() => setMounted(true), []);

  const durationOptions = useMemo(
    () => RELATIVE_DURATION_OPTIONS[timelineUnit].map((n) => ({ value: String(n), label: String(n) })),
    [timelineUnit]
  );

  const properties = useMemo(() => {
    const parsedCost = cost.trim() ? Number(cost.replace(/,/g, "")) : null;
    return buildRoadmapProperties({
      kind,
      product,
      resolvesDebt,
      roadmapStatus,
      timelineMode,
      timelineStartDate:
        timelineMode === "date_bound" ? monthInputToStartDate(timelineStartMonth) : undefined,
      timelineEndDate:
        timelineMode === "date_bound" ? monthInputToEndDate(timelineEndMonth) : undefined,
      timelineDuration: timelineMode === "relative" ? timelineDuration : undefined,
      timelineUnit: timelineMode === "relative" ? timelineUnit : undefined,
      effortEstimate,
      cost: parsedCost != null && !Number.isNaN(parsedCost) ? parsedCost : null,
      investmentCategory,
      blockedReason: roadmapStatus === "blocked" ? blockedReason : null,
      aiRole,
    });
  }, [
    kind,
    product,
    resolvesDebt,
    roadmapStatus,
    timelineMode,
    timelineStartMonth,
    timelineEndMonth,
    timelineDuration,
    timelineUnit,
    effortEstimate,
    cost,
    investmentCategory,
    blockedReason,
    aiRole,
  ]);

  const canSubmit =
    title.trim().length > 0 && kind.trim().length > 0 && ownership.isValid;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!ownership.isValid) throw new Error("Owner is required");

      const body = {
        name: title.trim(),
        description: description.trim() || undefined,
        ...ownership.toPayload(),
        status: roadmapStatusToObjectStatus(roadmapStatus),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: properties as Record<string, unknown>,
      };

      if (isEdit && initialValues) {
        const item = await objectsApi.update(orgSlug, workspaceSlug, initialValues.id, body, token);
        await syncRoadmapRelationships(orgSlug, workspaceSlug, initialValues.id, resolvesDebt, token);
        return item;
      }

      const item = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "roadmap_item", ...body },
        token
      );
      await syncRoadmapRelationships(orgSlug, workspaceSlug, item.id, resolvesDebt, token);
      return item;
    },
    onSuccess: (item) => onSuccess(item.id),
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} roadmap item`),
  });

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={cn("fixed inset-0 bg-black/25", isEdit ? "z-[115]" : "z-[100]")} onClick={onClose} />

      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl flex flex-col overflow-hidden",
          isEdit ? "z-[120]" : "z-[110]"
        )}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit roadmap item" : "New roadmap item"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">A planned change on the strategy roadmap</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 pb-8 space-y-7">
            <section>
              <SectionHeader>Identity</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Type</FieldLabel>
                  <SelectField
                    value={kind}
                    onChange={(v) => {
                      setKind(v);
                      if (!isEdit) setInvestmentCategory(defaultInvestmentCategory(v));
                    }}
                    options={ROADMAP_KINDS.map((k) => ({ value: k.value, label: k.label }))}
                  />
                </div>
                <div>
                  <FieldLabel required>Title</FieldLabel>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Migrate auth-service off Java 8"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <FieldLabel>Outcome / description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What changes when this is done? What business or technical outcome does it deliver?"
                    rows={4}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="security, modernization"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Attachment</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel>For product</FieldLabel>
                  {lockProduct && product ? (
                    <div className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                      {product.product_name}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowProductDialog(true)}
                        className={cn(
                          "flex-1 text-left rounded-md border px-3 py-2 text-sm transition-colors",
                          product
                            ? "border-gray-200 text-gray-800 hover:border-violet-300"
                            : "border-dashed border-gray-300 text-gray-400 hover:border-violet-300"
                        )}
                      >
                        {product ? product.product_name : "None (optional)"}
                      </button>
                      {product && (
                        <button
                          type="button"
                          onClick={() => setProduct(null)}
                          className="p-2 rounded-md border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                          aria-label="Clear product"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1.5">Optional — link to a product when relevant</p>
                </div>

                <div>
                  <FieldLabel>Resolves debt</FieldLabel>
                  <div className="rounded-lg border border-gray-200 min-h-[44px] p-2.5 flex flex-wrap gap-1.5 items-center">
                    {resolvesDebt.map((debt) => {
                      const showWarning =
                        debt.severity === "high" || debt.severity === "critical";
                      return (
                        <span
                          key={debt.debt_id}
                          className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full max-w-full"
                        >
                          {showWarning && <AlertTriangle size={11} className="flex-shrink-0" />}
                          <span className="truncate">{debt.debt_name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setResolvesDebt((list) => list.filter((d) => d.debt_id !== debt.debt_id))
                            }
                            className="opacity-60 hover:opacity-100 flex-shrink-0"
                            aria-label={`Remove ${debt.debt_name}`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowDebtDialog(true)}
                      className="inline-flex items-center gap-1 text-xs text-violet-600 border border-dashed border-violet-300 px-2 py-0.5 rounded-full hover:bg-violet-50 transition-colors"
                    >
                      <Plus size={12} />
                      Link debt item
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Linking debt makes the business case visible on the product card
                  </p>
                </div>

                <div>
                  <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Investment</SectionHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <SelectField
                    value={investmentCategory}
                    onChange={setInvestmentCategory}
                    options={INVESTMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                  />
                </div>
                <div>
                  <FieldLabel>Effort</FieldLabel>
                  <SelectField value={effortEstimate} onChange={setEffortEstimate} options={TECH_DEBT_EFFORT} />
                </div>
              </div>
              <div className="mt-3">
                <FieldLabel>Cost (USD)</FieldLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Optional — estimates from effort"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Leave blank to estimate from effort × team rate (S $50K · M $200K · L $500K · XL $1M)
                </p>
              </div>
              <div className="mt-3">
                <AiRoleField value={aiRole} onChange={setAiRole} />
              </div>
            </section>

            <section>
              <SectionHeader>Timeline</SectionHeader>
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 text-xs mb-4">
                <button
                  type="button"
                  onClick={() => setTimelineMode("date_bound")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-colors",
                    timelineMode === "date_bound"
                      ? "bg-white text-gray-900 shadow-sm font-medium"
                      : "text-gray-500"
                  )}
                >
                  Date-bound
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineMode("relative")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-colors",
                    timelineMode === "relative"
                      ? "bg-white text-gray-900 shadow-sm font-medium"
                      : "text-gray-500"
                  )}
                >
                  Relative
                </button>
              </div>

              {timelineMode === "date_bound" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Start</FieldLabel>
                      <input
                        type="month"
                        value={timelineStartMonth}
                        onChange={(e) => {
                          const v = e.target.value;
                          setTimelineStartMonth(v);
                          if (v && timelineEndMonth < v) setTimelineEndMonth(v);
                        }}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <FieldLabel>End</FieldLabel>
                      <input
                        type="month"
                        value={timelineEndMonth}
                        min={timelineStartMonth}
                        onChange={(e) => setTimelineEndMonth(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Timeline anchored to calendar dates. Segments snap to real months.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <FieldLabel>Duration</FieldLabel>
                      <SelectField
                        value={String(timelineDuration)}
                        onChange={(v) => setTimelineDuration(Number(v))}
                        options={durationOptions}
                      />
                    </div>
                    <div>
                      <FieldLabel>Unit</FieldLabel>
                      <SelectField
                        value={timelineUnit}
                        onChange={(v) => {
                          const unit = v as TimelineUnit;
                          setTimelineUnit(unit);
                          const opts = RELATIVE_DURATION_OPTIONS[unit];
                          if (!opts.includes(timelineDuration)) {
                            setTimelineDuration(opts[1] ?? opts[0]!);
                          }
                        }}
                        options={TIMELINE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    No dates committed yet. Timeline shows relative weeks/months/quarters from start.
                  </p>
                </div>
              )}

              <div className="mt-4">
                <FieldLabel>Status</FieldLabel>
                <SelectField value={roadmapStatus} onChange={setRoadmapStatus} options={ROADMAP_STATUS} />
              </div>
              {roadmapStatus === "blocked" && (
                <div className="mt-3">
                  <FieldLabel>Blocked reason</FieldLabel>
                  <input
                    value={blockedReason}
                    onChange={(e) => setBlockedReason(e.target.value)}
                    placeholder="e.g. vendor SLA"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              )}
            </section>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2 flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSubmit || saveMutation.isPending}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md disabled:bg-violet-300 disabled:text-violet-600 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save"
                : "Create"}
          </button>
        </div>
      </div>

      {showProductDialog && (
        <PickProductDialog
          selected={product}
          onClose={() => setShowProductDialog(false)}
          onApply={(next) => {
            setProduct(next);
            setShowProductDialog(false);
          }}
        />
      )}

      {showDebtDialog && (
        <LinkDebtDialog
          selected={resolvesDebt}
          candidates={debtCandidates}
          onClose={() => setShowDebtDialog(false)}
          onApply={(next) => {
            setResolvesDebt(next);
            setShowDebtDialog(false);
          }}
        />
      )}
    </>,
    document.body
  );
}
