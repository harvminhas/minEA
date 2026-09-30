"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, X } from "lucide-react";
import type { TechDebtHostKind } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { connectionPhrase, groupImpactHits, impactOf } from "@/lib/impact/relationship-impact";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { CreatePlatformPanel } from "@/components/infrastructure/CreatePlatformPanel";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import { PLATFORM_SLA_LABEL } from "@/lib/platform-utils";
import type { CatalogRow } from "@/lib/model-catalog";
import { CostSection } from "@/components/mvp/CostSection";
import { AddChip, Pill } from "@/components/mvp/pills";

export function ModelDetailPanel({
  row,
  onClose,
}: {
  row: CatalogRow;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"details" | "debt" | "history">("details");
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const debt = useObjectTechDebtSummary(row.id, tab === "debt");
  const impactGraph = useImpactGraph();
  const dependents = impactOf(impactGraph.nodes, impactGraph.edges, row.id);

  const history = useQuery({
    queryKey: ["object-history", row.id],
    enabled: tab === "history" && Boolean(orgSlug && workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { entries: [] };
      return objectsApi.history(orgSlug, workspaceSlug, row.id, token);
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["model-catalog", orgSlug, workspaceSlug] });
  };

  const acceptVendor = useMutation({
    mutationFn: async (vendor: string) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return;
      const properties = { ...(row.object.properties ?? {}), vendor };
      await objectsApi.update(orgSlug, workspaceSlug, row.id, { properties }, token);
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return;
      await objectsApi.delete(orgSlug, workspaceSlug, row.id, token);
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
  });

  const props = (row.object.properties ?? {}) as Record<string, unknown>;
  const slaKey = typeof props.sla_target === "string" ? props.sla_target : "";
  const sla = PLATFORM_SLA_LABEL[slaKey] ?? "";

  if (editing) {
    const close = () => setEditing(false);
    const done = () => {
      setEditing(false);
      refresh();
    };
    if (row.kind === "runtime") {
      return <CreateRuntimePanel initialValues={row.object} onClose={close} onSuccess={done} />;
    }
    if (row.kind === "platform") {
      return <CreatePlatformPanel initialValues={row.object} onClose={close} onSuccess={done} />;
    }
    return (
      <ObjectForm
        objectType={row.object.type}
        initialValues={row.object}
        onClose={close}
        onSuccess={done}
      />
    );
  }

  return (
    <aside className="flex h-full w-[470px] flex-shrink-0 flex-col border-l border-[#e7e8ee] bg-white">
      <div className="flex items-start gap-3 border-b border-[#eef0f4] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[18px] font-semibold text-[#1c2230]">{row.name}</h2>
          <p className="mt-0.5 text-[13px] text-[#6b7289]">{row.typeLabel}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[11px] font-medium text-[#4b5163]">{row.typeLabel}</span>
            {row.lifecycleLabel && <Pill label={row.lifecycleLabel} tone="lifecycle" />}
            {row.criticalityLabel && <Pill label={row.criticalityLabel} tone="criticality" />}
            {row.missingCount > 0 && (
              <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold text-[#c2410c]">
                {row.missingCount} missing
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1.5 text-[#6b7289] hover:bg-[#f4f5f8]" title="Edit">
          <Pencil size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete ${row.name}?`)) remove.mutate();
          }}
          className="rounded-md p-1.5 text-[#6b7289] hover:bg-[#f4f5f8]"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[#6b7289] hover:bg-[#f4f5f8]" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-4 border-b border-[#eef0f4] px-5 text-[13px]">
        {(
          [
            ["details", "Details"],
            ["debt", `Tech debt${debt.data?.open_count ? ` ${debt.data.open_count}` : ""}`],
            ["history", "History"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border-b-2 py-2.5 ${tab === id ? "border-[#5b4ce6] font-semibold text-[#3f35b5]" : "border-transparent text-[#6b7289]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "details" && (
          <div className="space-y-6">
            <Section title="Hosting">
              <Field label="Hosted where" value={row.typeLabel} />
              <Field label="Location" value={row.subtitle} empty="Add location" onAdd={() => setEditing(true)} />
            </Section>
            <Section title="Contract">
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[13px] text-[#6b7289]">Vendor</span>
                <div className="text-right text-[13px] text-[#1c2230]">
                  {row.vendor ? (
                    row.vendor
                  ) : row.suggestion && !dismissed ? (
                    <span>
                      <AddChip label="Add vendor" onClick={() => setEditing(true)} />
                      <span className="mt-1 block text-[12px] text-[#8b90a0]">
                        Suggested: {row.suggestion}{" "}
                        <button type="button" className="text-[#5b4ce6]" onClick={() => acceptVendor.mutate(row.suggestion!)}>
                          Accept
                        </button>
                        {" · "}
                        <button type="button" className="text-[#6b7289]" onClick={() => setDismissed(true)}>
                          Dismiss
                        </button>
                      </span>
                    </span>
                  ) : (
                    <AddChip label="Add vendor" onClick={() => setEditing(true)} />
                  )}
                </div>
              </div>
              <Field label="Renewal date" value={row.renewalLabel} empty="Add renewal date" onAdd={() => setEditing(true)} />
              <Field label="Notice period" value="" empty="Coming soon" />
            </Section>
            <CostSection row={row} onSaved={refresh} />
            <Section title="Governance">
              <Field
                label="Owner"
                value={[row.ownerTeam, row.ownerPerson].filter(Boolean).join(" · ")}
                empty="Add owner"
                onAdd={() => setEditing(true)}
              />
              <Field label="Lifecycle" value={row.lifecycleLabel} empty="Add lifecycle" onAdd={() => setEditing(true)} />
              <Field label="Criticality" value={row.criticalityLabel} empty="Add criticality" onAdd={() => setEditing(true)} />
              <Field label="SLA target" value={sla} />
            </Section>
            <Section title="Depends on this">
              {impactGraph.isLoading && <p className="text-[13px] text-[#8b90a0]">Looking up what depends on this…</p>}
              {!impactGraph.isLoading && dependents.length === 0 && (
                <p className="text-[13px] text-[#8b90a0]">Nothing in your model depends on {row.name}.</p>
              )}
              {groupImpactHits(dependents).map((group) => (
                <div key={group.title} className="mt-2">
                  <p className="text-[12px] font-semibold text-[#3c4254]">
                    {group.title} · {group.hits.length}
                  </p>
                  {group.hits.map((hit) => (
                    <div key={hit.id} className="py-1.5 text-[13px]">
                      <div className="text-[#1c2230]">{hit.name}</div>
                      <p className="text-[12px] text-[#8b90a0]">{connectionPhrase(hit, impactGraph.nodes)}</p>
                    </div>
                  ))}
                </div>
              ))}
            </Section>
          </div>
        )}
        {tab === "debt" && (
          <ObjectTechDebtTab
            objectId={row.id}
            objectName={row.name}
            objectKind={row.object.type as TechDebtHostKind}
            summary={debt.data}
            isLoading={debt.isLoading}
            onRefresh={() => debt.refetch()}
          />
        )}
        {tab === "history" && (
          <div className="space-y-3">
            {(history.data?.entries ?? []).length === 0 && (
              <p className="text-[13px] text-[#8b90a0]">{history.isLoading ? "Loading history…" : "No history yet."}</p>
            )}
            {(history.data?.entries ?? []).map((entry) => (
              <div key={entry.id} className="border-b border-[#f0f1f5] py-2">
                <p className="text-[13px] text-[#1c2230]">
                  <span className="font-medium">{entry.actor_name}</span> {entry.action}
                  {entry.detail ? ` — ${entry.detail}` : ""}
                </p>
                <p className="text-[12px] text-[#8b90a0]">{new Date(entry.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">{title.toUpperCase()}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  empty,
  onAdd,
}: {
  label: string;
  value?: string;
  empty?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[13px] text-[#6b7289]">{label}</span>
      {value ? (
        <span className="text-right text-[13px] text-[#1c2230]">{value}</span>
      ) : onAdd && empty && empty !== "Coming soon" ? (
        <AddChip label={empty.replace(/^Add /, "")} onClick={onAdd} />
      ) : (
        <span className="text-[13px] text-[#b0b4c0]">{empty ?? "—"}</span>
      )}
    </div>
  );
}
