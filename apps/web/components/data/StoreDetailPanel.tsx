"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { dataApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AssignDataLinkDialog } from "@/components/data/AssignDataLinkDialog";
import {
  DataDetailShell,
  DataFieldLabel,
  DataFormFooter,
  DataSelect,
} from "@/components/data/DataDetailShell";
import { DataDetailRightPanel } from "@/components/data/DataDetailRightPanel";
import { DataLinksPanel, type AssignTarget } from "@/components/data/DataLinksPanel";
import { initials, storeLinkSections, ROLE_TAG_STYLE } from "@/lib/data-utils";
import { cn } from "@/lib/utils";

interface Props {
  storeId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function StoreDetailPanel({ storeId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(storeId);

  const [storeType, setStoreType] = useState("relational_db");
  const [technology, setTechnology] = useState("");
  const [health, setHealth] = useState("healthy");
  const [description, setDescription] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  const { data: store, isLoading } = useQuery({
    queryKey: ["data-store", orgSlug, workspaceSlug, storeId],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getStore(orgSlug, workspaceSlug, storeId, token!);
    },
    enabled,
  });

  useEffect(() => {
    if (!store) return;
    setStoreType(store.store_type ?? "relational_db");
    setTechnology(store.technology ?? "");
    setHealth(store.health ?? "healthy");
    setDescription(store.description ?? "");
  }, [store]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return dataApi.updateStore(orgSlug, workspaceSlug, storeId, {
        store_type: storeType,
        technology: technology || null,
        health,
        description: description || null,
      }, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-store", orgSlug, workspaceSlug, storeId] });
      onUpdate();
      onClose();
    },
  });

  const addLink = async (target: AssignTarget, selectedId: string, roleTag?: string) => {
    const token = await getToken();
    if (target.linkKind === "governed_by" && target.entityKind === "data_domain") {
      await dataApi.updateStore(orgSlug, workspaceSlug, storeId, {
        data_domain_id: selectedId,
      }, token!);
    } else {
      await dataApi.addStoreLink(orgSlug, workspaceSlug, storeId, {
        entity_kind: target.entityKind,
        entity_id: selectedId,
        link_kind: target.linkKind,
        role_tag: roleTag,
      }, token!);
    }
    queryClient.invalidateQueries({ queryKey: ["data-store", orgSlug, workspaceSlug, storeId] });
  };

  if (isLoading || !store) {
    return (
      <DataDetailShell
        breadcrumb="Data · Store"
        title="Loading…"
        onClose={onClose}
        left={<p className="p-6 text-sm text-gray-400">Loading…</p>}
        right={<div />}
      />
    );
  }

  const healthStyle = ROLE_TAG_STYLE[health] ?? ROLE_TAG_STYLE.healthy;

  return (
    <>
      <DataDetailShell
        breadcrumb="Data · Store"
        title={store.name}
        badge={
          <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize", healthStyle)}>
            {health.replace(/_/g, " ")}
          </span>
        }
        onClose={onClose}
        left={
          <>
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white bg-emerald-600">
                  <Database size={18} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{store.name}</p>
                  <p className="text-xs text-gray-400">
                    {storeType.replace(/_/g, " ")}
                    {technology ? ` · ${technology}` : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
              <div>
                <DataFieldLabel>Store Type</DataFieldLabel>
                <DataSelect
                  value={storeType}
                  onChange={setStoreType}
                  options={[
                    { value: "relational_db", label: "Relational DB" },
                    { value: "document_db", label: "Document DB" },
                    { value: "data_warehouse", label: "Data Warehouse" },
                    { value: "data_lake", label: "Data Lake" },
                    { value: "file_store", label: "File Store" },
                    { value: "cache", label: "Cache" },
                  ]}
                />
              </div>

              <div>
                <DataFieldLabel>Technology</DataFieldLabel>
                <input
                  value={technology}
                  onChange={(e) => setTechnology(e.target.value)}
                  placeholder="PostgreSQL 15 · AWS RDS"
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              <div>
                <DataFieldLabel>Health</DataFieldLabel>
                <DataSelect
                  value={health}
                  onChange={setHealth}
                  options={[
                    { value: "healthy", label: "Healthy" },
                    { value: "at_risk", label: "At risk" },
                    { value: "degraded", label: "Degraded" },
                  ]}
                />
              </div>

              <div>
                <DataFieldLabel>Description</DataFieldLabel>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>

            <DataFormFooter onSave={() => saveMutation.mutate()} saving={saveMutation.isPending} />
          </>
        }
        right={
          <DataDetailRightPanel
            objectId={storeId}
            objectName={store.name}
            objectKind="data_store"
            onRefresh={() => {
              queryClient.invalidateQueries({
                queryKey: ["data-store", orgSlug, workspaceSlug, storeId],
              });
              onUpdate();
            }}
            links={
              <DataLinksPanel
                sections={storeLinkSections(store.links)}
                headerText="What this store holds and who touches it"
                onAssign={setAssignTarget}
              />
            }
          />
        }
      />

      {assignTarget && (
        <AssignDataLinkDialog
          section={assignTarget}
          existingEntityIds={store.links
            .filter(
              (l) =>
                l.link_kind === assignTarget.linkKind && l.entity_kind === assignTarget.entityKind
            )
            .map((l) => l.entity_id)}
          onClose={() => setAssignTarget(null)}
          onAssign={(id, roleTag) => addLink(assignTarget, id, roleTag)}
        />
      )}
    </>
  );
}
