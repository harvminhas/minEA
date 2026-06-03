"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus } from "lucide-react";
import type { MinEAObject, ObjectType } from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateDataPanel } from "@/components/data/CreateDataPanel";
import { EntityDetailPanel } from "@/components/data/EntityDetailPanel";
import { StoreDetailPanel } from "@/components/data/StoreDetailPanel";
import { DomainDetailPanel } from "@/components/data/DomainDetailPanel";
import {
  DATA_LAYER_COLOR,
  DOMAIN_ICON_STYLE,
  domainTopBadge,
  ENTITY_ICON_STYLE,
  entityTopBadge,
  formatDomainSubtitle,
  formatEntitySubtitle,
  formatSensitivityLabel,
  formatStoreSubtitle,
  formatTechnology,
  STORE_ICON_STYLE,
  storeTopBadge,
} from "@/lib/data-utils";
import type { DataDomainProperties } from "@minea/types";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

type DataListConfig = {
  objectType: ObjectType;
  title: string;
  titlePlural: string;
  createKind: "entity" | "store" | "domain";
};

const CONFIGS: Record<string, DataListConfig> = {
  "data-objects": {
    objectType: "data_object",
    title: "Data Entities",
    titlePlural: "entities",
    createKind: "entity",
  },
  "data-stores": {
    objectType: "data_store",
    title: "Data Stores",
    titlePlural: "stores",
    createKind: "store",
  },
  "data-domains": {
    objectType: "data_domain",
    title: "Data Domains",
    titlePlural: "domains",
    createKind: "domain",
  },
};

function PropertyRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={cn("text-right truncate max-w-[60%] font-medium text-gray-900", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function CardFooter({ item }: { item: MinEAObject }) {
  return (
    <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
      <Clock size={12} className="flex-shrink-0" />
      <span>
        Updated{item.updated_by_name ? ` by ` : " "}
        {item.updated_by_name && (
          <span className="font-semibold text-gray-600">{item.updated_by_name}</span>
        )}
        {item.updated_by_name ? " " : ""}
        {formatUpdatedAgo(item.updated_at)}
      </span>
    </div>
  );
}

function EntityCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const badge = entityTopBadge(item);
  const capCount = item.capability_count ?? 0;

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-amber-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0",
              ENTITY_ICON_STYLE
            )}
          >
            E
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{formatEntitySubtitle(item)}</p>
          </div>
        </div>
        {badge && (
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0", badge.className)}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow
          label="Data domain"
          value={item.data_domain_name ?? "—"}
          valueClassName={!item.data_domain_name ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="System of record"
          value={item.system_of_record_name ?? "—"}
          valueClassName={!item.system_of_record_name ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow label="Capabilities" value={String(capCount)} />
        <PropertyRow label="Sensitivity" value={formatSensitivityLabel(item)} />
      </div>

      <CardFooter item={item} />
    </div>
  );
}

function StoreCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const badge = storeTopBadge(item);
  const entityCount = item.governed_entity_count ?? 0;

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-amber-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0",
              STORE_ICON_STYLE
            )}
          >
            S
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{formatStoreSubtitle(item)}</p>
          </div>
        </div>
        {badge && (
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0", badge.className)}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow
          label="Technology"
          value={formatTechnology(item)}
          valueClassName={formatTechnology(item) === "—" ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Data domain"
          value={item.data_domain_name ?? "—"}
          valueClassName={!item.data_domain_name ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow label="Data entities" value={String(entityCount)} />
        <PropertyRow
          label="Hosting system"
          value={item.hosting_system_name ?? "—"}
          valueClassName={!item.hosting_system_name ? "font-normal text-gray-400" : undefined}
        />
      </div>

      <CardFooter item={item} />
    </div>
  );
}

function DomainCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as DataDomainProperties;
  const badge = domainTopBadge(item);
  const entityCount = item.governed_entity_count ?? 0;
  const storeCount = item.governed_store_count ?? 0;
  const steward = props.steward_name?.trim() || "—";

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-amber-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0",
              DOMAIN_ICON_STYLE
            )}
          >
            D
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{formatDomainSubtitle(item)}</p>
          </div>
        </div>
        {badge && (
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0", badge.className)}>
            {badge.label}
          </span>
        )}
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow
          label="Owning team"
          value={props.owning_team ?? "—"}
          valueClassName={!props.owning_team ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow
          label="Data steward"
          value={steward}
          valueClassName={steward === "—" ? "font-normal text-gray-400" : undefined}
        />
        <PropertyRow label="Data entities" value={String(entityCount)} />
        <PropertyRow label="Data stores" value={String(storeCount)} />
      </div>

      <CardFooter item={item} />
    </div>
  );
}

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

  const renderCard = (item: MinEAObject) => {
    const onOpen = () => setSelectedId(item.id);
    if (config.createKind === "entity") {
      return <EntityCard key={item.id} item={item} onOpenDetail={onOpen} />;
    }
    if (config.createKind === "store") {
      return <StoreCard key={item.id} item={item} onOpenDetail={onOpen} />;
    }
    return <DomainCard key={item.id} item={item} onOpenDetail={onOpen} />;
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => renderCard(item))}
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
