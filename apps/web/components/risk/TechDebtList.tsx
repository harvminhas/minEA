"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import { TechDebtDetail } from "@/components/risk/TechDebtDetail";
import {
  RISK_LAYER_COLOR,
  SEVERITY_STYLE,
  TECH_DEBT_SEVERITY_LABEL,
  TECH_DEBT_STATUS_LABEL,
  techDebtTypeLabel,
  targetResolutionLabel,
} from "@/lib/tech-debt-utils";
import type { MinEAObject, TechDebtProperties } from "@minea/types";
import { cn } from "@/lib/utils";

function TechDebtCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as TechDebtProperties;
  const typeLabel = techDebtTypeLabel(props);
  const severity = props.severity ?? "medium";
  const severityStyle = SEVERITY_STYLE[severity];

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="text-left bg-white rounded-xl border border-gray-200 hover:border-red-200 transition-colors w-full p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: RISK_LAYER_COLOR }}
        >
          <AlertTriangle size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate leading-tight">{item.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {props.severity && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium border",
                  severityStyle.border,
                  severityStyle.bg,
                  severityStyle.text
                )}
              >
                {TECH_DEBT_SEVERITY_LABEL[props.severity]}
              </span>
            )}
            {typeLabel && (
              <span className="text-[10px] bg-gray-50 text-gray-700 px-1.5 py-0.5 rounded-full font-medium">
                {typeLabel}
              </span>
            )}
            {props.debt_status && (
              <span className="text-[10px] text-gray-500">
                {TECH_DEBT_STATUS_LABEL[props.debt_status]}
              </span>
            )}
          </div>

          {props.affects && (
            <p className="text-[10px] text-gray-500 truncate mt-2">
              Affects: {props.affects.object_name}
            </p>
          )}

          {props.target_resolution && (
            <p className="text-[10px] text-gray-400 truncate mt-1">
              Target: {targetResolutionLabel(props.target_resolution)}
            </p>
          )}

          {item.owner && (
            <p className="text-[10px] text-gray-400 truncate mt-1">Owner: {item.owner}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function TechDebtList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const techDebtQueryKey = ["objects", orgSlug, workspaceSlug, "tech_debt"] as const;

  const { data, isLoading } = useQuery({
    queryKey: techDebtQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tech_debt" }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: techDebtQueryKey });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${RISK_LAYER_COLOR}20`, color: RISK_LAYER_COLOR }}
          >
            Risk Layer
          </span>
          <h1 className="text-lg font-semibold text-gray-900">Tech Debt</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New tech debt
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-3">No tech debt items yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-red-600 hover:underline text-sm">
              Create the first item →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <TechDebtCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateTechDebtPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <TechDebtDetail
          techDebt={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            setSelectedId(null);
            refresh();
          }}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
