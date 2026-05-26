"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { MinEAObject, ObjectType } from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateDataPanel } from "@/components/data/CreateDataPanel";
import { EntityDetailPanel } from "@/components/data/EntityDetailPanel";
import { StoreDetailPanel } from "@/components/data/StoreDetailPanel";
import { DomainDetailPanel } from "@/components/data/DomainDetailPanel";
import { DATA_LAYER_COLOR, initials } from "@/lib/data-utils";

type DataListConfig = {
  objectType: ObjectType;
  title: string;
  titlePlural: string;
  createKind: "entity" | "store" | "domain";
  accentColors: string[];
  subtitle: (obj: MinEAObject) => string;
};

const CONFIGS: Record<string, DataListConfig> = {
  "data-objects": {
    objectType: "data_object",
    title: "Data Entities",
    titlePlural: "entities",
    createKind: "entity",
    accentColors: ["#8b5cf6", "#6366f1", "#0ea5e9"],
    subtitle: (o) => {
      const p = o.properties as Record<string, string>;
      return [p.classification, p.sensitivity].filter(Boolean).join(" · ") || "Entity";
    },
  },
  "data-stores": {
    objectType: "data_store",
    title: "Data Stores",
    titlePlural: "stores",
    createKind: "store",
    accentColors: ["#10b981", "#059669", "#14b8a6"],
    subtitle: (o) => {
      const p = o.properties as Record<string, string>;
      return [p.store_type?.replace(/_/g, " "), p.health?.replace(/_/g, " ")].filter(Boolean).join(" · ");
    },
  },
  "data-domains": {
    objectType: "data_domain",
    title: "Data Domains",
    titlePlural: "domains",
    createKind: "domain",
    accentColors: ["#f59e0b", "#d97706", "#eab308"],
    subtitle: (o) => {
      const p = o.properties as Record<string, string>;
      return p.owning_team ? `Owner: ${p.owning_team}` : "Domain";
    },
  },
};

export function DataLayerList({ typePath }: { typePath: string }) {
  const config = CONFIGS[typePath]!;
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, config.objectType],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: config.objectType }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, config.objectType] });
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: `${DATA_LAYER_COLOR}20`, color: DATA_LAYER_COLOR }}
            >
              Data Layer
            </span>
            <h1 className="text-lg font-semibold text-gray-900">{config.title}</h1>
            {data && (
              <span className="text-sm text-gray-400">
                {data.total} {data.total === 1 ? config.titlePlural.slice(0, -1) : config.titlePlural}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-md text-sm font-medium"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm mb-3">No {config.titlePlural} yet.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-amber-600 hover:underline text-sm"
              >
                Add your first {config.titlePlural.slice(0, -1)} →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="text-left bg-[#faf8f5] rounded-xl border border-gray-200/80 p-5 hover:border-amber-200 transition-colors w-full"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: config.accentColors[i % config.accentColors.length] }}
                    >
                      {initials(item.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{config.subtitle(item)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateDataPanel
          kind={config.createKind}
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selectedId && config.createKind === "entity" && (
        <EntityDetailPanel entityId={selectedId} onClose={() => setSelectedId(null)} onUpdate={refresh} />
      )}
      {selectedId && config.createKind === "store" && (
        <StoreDetailPanel storeId={selectedId} onClose={() => setSelectedId(null)} onUpdate={refresh} />
      )}
      {selectedId && config.createKind === "domain" && (
        <DomainDetailPanel domainId={selectedId} onClose={() => setSelectedId(null)} onUpdate={refresh} />
      )}
    </>
  );
}
