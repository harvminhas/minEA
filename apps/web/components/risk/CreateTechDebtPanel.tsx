"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { PickAffectedDialog } from "@/components/risk/PickAffectedDialog";
import {
  buildTargetResolutionOptions,
  buildTechDebtProperties,
  debtStatusToObjectStatus,
  SEVERITY_STYLE,
  targetResolutionLabel,
  TECH_DEBT_EFFORT,
  TECH_DEBT_SEVERITY,
  TECH_DEBT_STATUS,
  TECH_DEBT_TYPES,
} from "@/lib/tech-debt-utils";
import type { MinEAObject, TechDebtAffectsRef, TechDebtProperties } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: (techDebtId: string) => void;
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
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 pr-8"
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

function initFromTechDebt(item?: MinEAObject) {
  const props = (item?.properties ?? {}) as TechDebtProperties;
  const resolutionOptions = buildTargetResolutionOptions();
  const defaultResolution = resolutionOptions[0]?.value ?? "no_target";
  return {
    title: item?.name ?? "",
    description: item?.description ?? "",
    tags: (item?.tags ?? []).join(", "),
    severity: props.severity ?? "medium",
    debtType: props.debt_type ?? "eol_software",
    debtTypeOther: props.debt_type_other ?? "",
    debtStatus: props.debt_status ?? "open",
    affects: props.affects ?? null,
    owner: item?.owner ?? "",
    identifiedBy: props.identified_by ?? "",
    targetResolution: props.target_resolution ?? defaultResolution,
    effortEstimate: props.effort_estimate ?? "",
  };
}

async function syncTechDebtRelationships(
  orgSlug: string,
  workspaceSlug: string,
  techDebtId: string,
  affects: TechDebtAffectsRef | null,
  token: string
) {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: techDebtId },
    token
  );

  for (const rel of existing) {
    if (rel.from_type === "tech_debt" && rel.type === "affects") {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  if (affects && (affects.object_kind === "application" || affects.object_kind === "component")) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "affects",
        from_object_id: techDebtId,
        from_type: "tech_debt",
        to_object_id: affects.object_id,
        to_type: affects.object_kind,
      },
      token
    );
  }
}

function affectsLabel(affects: TechDebtAffectsRef | null): string {
  if (!affects) return "";
  const kind =
    affects.object_kind === "application"
      ? "System"
      : affects.object_kind === "component"
        ? "Component"
        : "Product";
  return `${affects.object_name} (${kind})`;
}

export function CreateTechDebtPanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromTechDebt(initialValues);
  const targetResolutionOptions = useMemo(() => {
    const options = buildTargetResolutionOptions();
    if (
      init.targetResolution &&
      !options.some((o) => o.value === init.targetResolution)
    ) {
      options.unshift({
        value: init.targetResolution,
        label: targetResolutionLabel(init.targetResolution),
      });
    }
    return options;
  }, [init.targetResolution]);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState(init.title);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [severity, setSeverity] = useState<string>(init.severity);
  const [debtType, setDebtType] = useState<string>(init.debtType);
  const [debtTypeOther, setDebtTypeOther] = useState(init.debtTypeOther);
  const [debtStatus, setDebtStatus] = useState<string>(init.debtStatus);
  const [affects, setAffects] = useState<TechDebtAffectsRef | null>(init.affects);
  const [owner, setOwner] = useState(init.owner);
  const [identifiedBy, setIdentifiedBy] = useState(init.identifiedBy);
  const [targetResolution, setTargetResolution] = useState(init.targetResolution);
  const [effortEstimate, setEffortEstimate] = useState<string>(init.effortEstimate);
  const [error, setError] = useState<string | null>(null);
  const [showAffectsDialog, setShowAffectsDialog] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const properties = useMemo(
    () =>
      buildTechDebtProperties({
        severity,
        debtType,
        debtTypeOther,
        debtStatus,
        affects,
        identifiedBy,
        targetResolution,
        effortEstimate,
      }),
    [
      severity,
      debtType,
      debtTypeOther,
      debtStatus,
      affects,
      identifiedBy,
      targetResolution,
      effortEstimate,
    ]
  );

  const canSubmit =
    title.trim().length > 0 &&
    severity.trim().length > 0 &&
    debtType.trim().length > 0 &&
    !!affects &&
    owner.trim().length > 0 &&
    (debtType !== "other" || debtTypeOther.trim().length > 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!affects) throw new Error("Affected object is required");
      if (!owner.trim()) throw new Error("Owner is required");

      const body = {
        name: title.trim(),
        description: description.trim() || undefined,
        owner: owner.trim(),
        status: debtStatusToObjectStatus(debtStatus),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: properties as Record<string, unknown>,
      };

      if (isEdit && initialValues) {
        const item = await objectsApi.update(orgSlug, workspaceSlug, initialValues.id, body, token);
        await syncTechDebtRelationships(orgSlug, workspaceSlug, initialValues.id, affects, token);
        return item;
      }

      const item = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "tech_debt", ...body },
        token
      );
      await syncTechDebtRelationships(orgSlug, workspaceSlug, item.id, affects, token);
      return item;
    },
    onSuccess: (item) => onSuccess(item.id),
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} tech debt item`),
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
              {isEdit ? "Edit tech debt item" : "New tech debt item"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              A known issue carrying ongoing cost or risk
            </p>
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
                  <FieldLabel required>Title</FieldLabel>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. auth-service on EOL Java 8"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's the issue? Why does it matter? What's the risk if unaddressed?"
                    rows={4}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="eol, security, java"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Classification</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Severity</FieldLabel>
                  <div className="grid grid-cols-4 gap-2">
                    {TECH_DEBT_SEVERITY.map((s) => {
                      const style = SEVERITY_STYLE[s.value];
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setSeverity(s.value)}
                          className={cn(
                            "rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                            severity === s.value
                              ? cn(style.border, style.bg, style.text, "ring-1")
                              : "border-gray-200 text-gray-600 hover:border-gray-300"
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Severity drives the health indicator on the affected object&apos;s card
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel required>Type</FieldLabel>
                    <SelectField value={debtType} onChange={setDebtType} options={TECH_DEBT_TYPES} />
                  </div>
                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <SelectField value={debtStatus} onChange={setDebtStatus} options={TECH_DEBT_STATUS} />
                  </div>
                </div>

                {debtType === "other" && (
                  <div>
                    <FieldLabel required>Other type</FieldLabel>
                    <input
                      value={debtTypeOther}
                      onChange={(e) => setDebtTypeOther(e.target.value)}
                      placeholder="Describe the debt type"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionHeader>Attachment</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Affects</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setShowAffectsDialog(true)}
                    className={cn(
                      "w-full text-left rounded-md border px-3 py-2 text-sm transition-colors",
                      affects
                        ? "border-gray-200 text-gray-800 hover:border-red-300"
                        : "border-dashed border-gray-300 text-gray-400 hover:border-red-300"
                    )}
                  >
                    {affects ? affectsLabel(affects) : "Search products, systems, components…"}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Attach to the thing it most directly affects — rolls up to Product automatically
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel required>Owner (team)</FieldLabel>
                    <input
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                      list="tech-debt-owner-options"
                      placeholder="Search team…"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <datalist id="tech-debt-owner-options">
                      {(teamsData?.items ?? []).map((team) => (
                        <option key={team.id} value={team.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <FieldLabel>Identified by</FieldLabel>
                    <input
                      value={identifiedBy}
                      onChange={(e) => setIdentifiedBy(e.target.value)}
                      placeholder="e.g. security audit Q1"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Timeline</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel>Target resolution</FieldLabel>
                  <SelectField
                    value={targetResolution}
                    onChange={setTargetResolution}
                    options={targetResolutionOptions}
                  />
                </div>
                <div>
                  <FieldLabel>Effort estimate</FieldLabel>
                  <SelectField
                    value={effortEstimate}
                    onChange={setEffortEstimate}
                    options={TECH_DEBT_EFFORT}
                  />
                </div>
              </div>
            </section>

            <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <Link2 size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Link to a roadmap item from the detail page once it&apos;s planned.
              </p>
            </div>

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
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md disabled:bg-red-300 disabled:text-red-600 disabled:cursor-not-allowed transition-colors"
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

      {showAffectsDialog && (
        <PickAffectedDialog
          selected={affects}
          onClose={() => setShowAffectsDialog(false)}
          onApply={(next) => {
            setAffects(next);
            setShowAffectsDialog(false);
          }}
        />
      )}
    </>,
    document.body
  );
}
