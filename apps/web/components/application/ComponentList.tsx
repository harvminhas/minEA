"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateComponentPanel } from "@/components/application/CreateComponentPanel";
import { ComponentDetail } from "@/components/application/ComponentDetail";
import {
  APPLICATION_LAYER_COLOR,
  COMPONENT_TYPE_LABEL,
} from "@/lib/component-utils";
import { aiRoleLabel } from "@/lib/ai-role-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { AiRole, ComponentProperties, MinEAObject } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";

const COMPONENT_STATUS_STYLE: Record<string, string> = {
  planned: "bg-stone-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  retiring: "bg-amber-50 text-amber-700",
  retired: "bg-red-50 text-red-500",
};

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-700 text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function getInitial(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function ComponentCard({
  item,
  onOpenDetail,
}: {
  item: MinEAObject;
  onOpenDetail: () => void;
}) {
  const props = (item.properties ?? {}) as ComponentProperties;
  const systems = props.systems ?? [];
  const tags = item.tags ?? [];
  const typeLabel = COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type ?? null;
  const status = item.status ?? "planned";
  const aiRole = aiRoleLabel(props.ai_role as AiRole | undefined);

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: APPLICATION_LAYER_COLOR }}
          >
            {getInitial(item.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            {typeLabel && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{typeLabel}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
            COMPONENT_STATUS_STYLE[status] ?? COMPONENT_STATUS_STYLE.planned
          )}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      {/* Key-value rows */}
      <div className="space-y-1.5 text-xs">
        {props.tech_stack && <PropertyRow label="Tech stack" value={props.tech_stack} />}
        {props.platform?.platform_name && (
          <PropertyRow label="Platform" value={props.platform.platform_name} />
        )}
        {item.owner && <PropertyRow label="Owner" value={item.owner} />}
        <PropertyRow label="AI role" value={aiRole} />
      </div>

      {/* Part of (systems) */}
      {systems.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-1.5">Part of</p>
          <div className="flex flex-wrap gap-1.5">
            {systems.slice(0, 3).map((s) => (
              <span
                key={s.system_id}
                className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
              >
                {s.system_name}
              </span>
            ))}
            {systems.length > 3 && (
              <span className="text-xs text-gray-400 self-center">+{systems.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{item.updated_by_name ? ` by ${item.updated_by_name}` : ""}{" "}
          {formatUpdatedAgo(item.updated_at)}
        </span>
      </div>
    </div>
  );
}

export function ComponentList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const componentsQueryKey = ["objects", orgSlug, workspaceSlug, "component"] as const;

  const { data, isLoading } = useQuery({
    queryKey: componentsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: componentsQueryKey });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${APPLICATION_LAYER_COLOR}20`, color: APPLICATION_LAYER_COLOR }}
          >
            Application Layer
          </span>
          <h1 className="text-lg font-semibold text-gray-900">Components</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New component
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
            <p className="text-gray-400 text-sm mb-3">No components yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-indigo-600 hover:underline text-sm">
              Create the first component →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <ComponentCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateComponentPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <ComponentDetail
          component={selected}
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
