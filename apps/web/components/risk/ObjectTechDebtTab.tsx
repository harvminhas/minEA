"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ObjectTechDebtSummary,
  ProductTechDebtItem,
  TechDebtAffectsRef,
  TechDebtHostKind,
} from "@minea/types";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import { TechDebtDetail } from "@/components/risk/TechDebtDetail";
import { DetailSection } from "@/components/ui/DetailPanel";
import { TECH_DEBT_SEVERITY_LABEL, SEVERITY_STYLE } from "@/lib/tech-debt-utils";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function TechDebtItemCard({
  item,
  onOpen,
}: {
  item: ProductTechDebtItem;
  onOpen: () => void;
}) {
  const sev = item.severity ?? "medium";
  const style = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE.medium;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3.5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span
          className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
            style.border,
            style.bg,
            style.text
          )}
        >
          {TECH_DEBT_SEVERITY_LABEL[sev] ?? sev}
        </span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">
          {item.debt_type_label} · {item.age_days}d open
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
      {item.remediation ? (
        <p className="text-[11px] text-indigo-600 mt-1.5">{item.remediation.roadmap_title}</p>
      ) : (
        <p className="text-[11px] text-gray-500 mt-1">
          {item.owner?.trim() ? `Open · ${item.owner}` : "Unassigned"}
        </p>
      )}
    </button>
  );
}

interface Props {
  objectId: string;
  objectName: string;
  objectKind: TechDebtHostKind;
  summary: ObjectTechDebtSummary | undefined;
  isLoading: boolean;
  defaultOwner?: string | null;
  onRefresh: () => void;
}

export function ObjectTechDebtTab({
  objectId,
  objectName,
  objectKind,
  summary,
  isLoading,
  defaultOwner,
  onRefresh,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const scopedObject: TechDebtAffectsRef = {
    object_id: objectId,
    object_name: objectName,
    object_kind: objectKind,
  };

  const items = summary?.items ?? [];
  const rollup = summary?.rollup_products ?? [];
  const openCount = summary?.open_count ?? 0;

  const refreshAll = () => {
    queryClient.invalidateQueries({
      queryKey: ["object-tech-debt", orgSlug, workspaceSlug, objectId],
    });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "tech_debt"] });
    queryClient.invalidateQueries({ queryKey: ["products", orgSlug, workspaceSlug] });
    onRefresh();
  };

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading tech debt…</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {openCount} open item{openCount === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-md px-2.5 py-1 hover:bg-indigo-50"
        >
          Add debt item
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic mb-6">No open tech debt on this object.</p>
      ) : (
        <div className="space-y-2 mb-6">
          {items.map((item) => (
            <TechDebtItemCard
              key={item.id}
              item={item}
              onOpen={() => setSelectedDebtId(item.id)}
            />
          ))}
        </div>
      )}

      {rollup.length > 0 && (
        <DetailSection title="Rolls up to">
          <div className="flex flex-wrap gap-1.5">
            {rollup.map((product) => (
              <span
                key={product.id}
                className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {product.name}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            These products inherit this object&apos;s debt in their rollup count.
          </p>
        </DetailSection>
      )}

      {showCreate && (
        <CreateTechDebtPanel
          scopedObject={scopedObject}
          defaultOwner={defaultOwner ?? undefined}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            refreshAll();
          }}
        />
      )}

      {selectedDebtId && (
        <TechDebtDetailLoader
          debtId={selectedDebtId}
          onClose={() => setSelectedDebtId(null)}
          onUpdate={refreshAll}
          onDelete={refreshAll}
        />
      )}
    </>
  );
}

function TechDebtDetailLoader({
  debtId,
  onClose,
  onUpdate,
  onDelete,
}: {
  debtId: string;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const { data: debt } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, debtId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, debtId, token!);
    },
  });

  if (!debt) return null;

  return (
    <TechDebtDetail
      techDebt={debt}
      onClose={onClose}
      onDelete={() => {
        onDelete();
        onClose();
      }}
      onUpdate={onUpdate}
    />
  );
}
