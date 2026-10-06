"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
import type { MinEAObject, Relationship, TechDebtHostKind } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { connectionPhrase, groupImpactHits, impactOf } from "@/lib/impact/relationship-impact";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { useAuth } from "@/lib/auth-context";
import { isCatalogObjectId } from "@/lib/mvp-paths";
import { useTenancy } from "@/lib/tenancy";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { SystemDiagramModal } from "@/components/application/SystemDiagram";
import { SystemDiagramPreview } from "@/components/application/SystemDiagramPreview";
import { isSystemObjectType } from "@/lib/platform-relationship-utils";
import { REGISTRY, recordTypeOf } from "@/lib/fields/registry";
import { vendorRollup, type CatalogRow } from "@/lib/model-catalog";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog, type WorkspaceCatalog } from "@/lib/use-model-catalog";
import { usePermissions } from "@/lib/use-permissions";
import { relationshipsForIds, sameNamePartyIds } from "@/lib/relationships-for-object";
import { formatRelationshipTriple } from "@/lib/relationship-display";
import { suppliedByVendorClear } from "@/lib/fields/shared-links";
import { planTypeSwitch, readableTypeConflict, type TypeSwitchPlan } from "@/lib/type-switch";
import { ObjectRelationshipsTab } from "@/components/objects/ObjectRelationshipsTab";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import { toast } from "@/hooks/use-toast";
import { HostLink } from "@/components/mvp/HostLink";
import { InlineField, RecordFields, toFieldEdges } from "@/components/mvp/InfraEditors";
import { askPath } from "@/lib/mvp-paths";
import { Pill } from "@/components/mvp/pills";

export function ModelDetailPanel({
  row,
  onClose,
}: {
  row: CatalogRow;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { canEdit, canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<ObjectDrawerTabId>("details");
  const [openField, setOpenField] = useState<string | null>(null);
  const debt = useObjectTechDebtSummary(row.id, tab === "tech_debt");
  const impactGraph = useImpactGraph();
  const catalog = useModelCatalog();
  const dependents = impactOf(impactGraph.nodes, impactGraph.edges, row.id);
  const recordType = recordTypeOf(row.object.type);
  const edges = toFieldEdges(impactGraph.relationships);
  const nameDef = recordType ? REGISTRY[recordType].find((field) => field.key === "name") : undefined;
  const partyIds = sameNamePartyIds(catalog.data?.objects ?? [], row.id, row.object.type, row.name);
  const relationshipCount = relationshipsForIds(catalog.data?.relationships ?? [], partyIds).length;
  const storedObject = isCatalogObjectId(row.id);
  useEffect(() => {
    if (!storedObject && (tab === "history" || tab === "tech_debt")) setTab("details");
  }, [storedObject, tab]);

  const history = useQuery({
    queryKey: ["object-history", row.id],
    enabled: tab === "history" && Boolean(orgSlug && workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return { entries: [] };
      return objectsApi.history(orgSlug, workspaceSlug, row.id, token);
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) return;
      await objectsApi.delete(orgSlug, workspaceSlug, row.id, token);
    },
    onSuccess: () => {
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeId: row.id });
      onClose();
    },
  });

  return (
    <aside className="flex h-full w-[470px] flex-shrink-0 flex-col border-l border-[#e7e8ee] bg-white">
      <div className="flex items-start gap-3 border-b border-[#eef0f4] px-5 py-4">
        <div className="min-w-0 flex-1">
          {nameDef ? (
            <InlineField def={nameDef} object={row.object} edges={edges} bare />
          ) : (
            <h2 className="truncate text-[18px] font-semibold text-[#1c2230]">{row.name}</h2>
          )}
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
        {canDelete && storedObject && (
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
        )}
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[#6b7289] hover:bg-[#f4f5f8]" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="border-b border-[#eef0f4]">
        <ObjectDrawerTabs
          activeTab={tab}
          onTabChange={setTab}
          showRelationships
          showHistory={storedObject}
          showTechDebt={storedObject}
          openDebtCount={debt.data?.open_count ?? 0}
          relationshipCount={relationshipCount}
          className="px-5"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tab === "details" && (
          <div className="space-y-6">
            <HostLink row={row} onAddHost={() => setOpenField("runs_on")} />
            {row.object.type === "model" && (
              <a href={askPath(basePath, `What breaks if ${row.name} goes down?`)} className="block rounded-lg bg-[#f4f3ff] px-3 py-2 text-[13px] font-medium text-[#3f35b5]">
                Impact if down: ask what breaks if {row.name} goes down →
              </a>
            )}
            {row.object.type === "external_party" && (
              <section>
                <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">SUPPLIED ITEMS</h3>
                {(() => {
                  const items = vendorRollup(catalog.data?.rows ?? []).find(
                    (vendor) => vendor.vendor.trim().toLowerCase() === row.name.trim().toLowerCase()
                  )?.items ?? [];
                  if (items.length === 0) return <p className="text-[13px] text-[#8b90a0]">Nothing lists this vendor yet.</p>;
                  return items.map((item) => (
                    <div key={item.id} className="py-1.5 text-[13px] text-[#1c2230]">{item.name}</div>
                  ));
                })()}
              </section>
            )}
            {(row.object.type === "application" || row.object.type === "solution" || row.object.type === "technical_capability" || row.object.type === "cloud_service") && (
              <TypeSwitch
                canEdit={canEdit}
                object={row.object}
                relationships={catalog.data?.relationships ?? []}
                objects={catalog.data?.objects ?? []}
              />
            )}
            {recordType && (
              <RecordFields
                type={recordType}
                object={row.object}
                edges={edges}
                row={row}
                omit={["name"]}
                openKey={openField}
                onOpenKey={setOpenField}
              />
            )}
            <section>
              <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">DEPENDS ON THIS</h3>
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
            </section>
          </div>
        )}
        {tab === "relationships" && <Relationships row={row} canEdit={canEdit} />}
        {tab === "tech_debt" && (
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

const SWITCHABLE = new Set(["application", "solution", "technical_capability", "cloud_service"]);

function TypeSwitch({
  canEdit,
  object,
  relationships,
  objects,
}: {
  canEdit: boolean;
  object: MinEAObject;
  relationships: Relationship[];
  objects: MinEAObject[];
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [ask, setAsk] = useState<TypeSwitchPlan | null>(null);
  const [forcedDrops, setForcedDrops] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canEdit || !SWITCHABLE.has(object.type)) return null;
  const next = object.type === "cloud_service" ? "application" : "cloud_service";
  const nameOf = (id: string) => objects.find((item) => item.id === id)?.name ?? "Untitled";
  const freshPlan = () => planTypeSwitch({
    objectId: object.id,
    objectName: object.name,
    currentType: object.type,
    nextType: next,
    relationships,
    nameOf,
  });
  const linkLine = (rel: Relationship) => {
    const otherId = rel.from_object_id === object.id ? rel.to_object_id : rel.from_object_id;
    return formatRelationshipTriple(rel, object.id, object.name, nameOf(otherId)).nameLine;
  };
  const save = async (plan: TypeSwitchPlan) => {
    if (!orgSlug || !workspaceSlug) return;
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const dropIds = [...new Set([...plan.invalid, ...plan.merged].map((item) => item.id).concat(forcedDrops))];
      const saved = await objectsApi.switchType(orgSlug, workspaceSlug, object.id, {
        type: next,
        drop_relationship_ids: dropIds,
      }, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved.object });
      for (const rel of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
      for (const id of saved.removed_relationship_ids) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
      setForcedDrops([]);
      setAsk(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not change type";
      const conflict = readableTypeConflict(message);
      if (conflict && orgSlug && workspaceSlug) {
        setError(conflict.message);
        setForcedDrops((current) => [...new Set([...current, ...conflict.ids])]);
        try {
          await queryClient.refetchQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
        } catch {
          // Re-plan from the catalog we already have.
        }
        const fresh = queryClient.getQueryData<WorkspaceCatalog>(catalogQueryKey(orgSlug, workspaceSlug));
        const rels = fresh?.relationships ?? relationships;
        const objs = fresh?.objects ?? objects;
        const names = (id: string) => objs.find((item) => item.id === id)?.name ?? "Untitled";
        setAsk(planTypeSwitch({
          objectId: object.id,
          objectName: object.name,
          currentType: object.type,
          nextType: next,
          relationships: rels,
          nameOf: names,
        }));
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    setError("");
    setAsk(freshPlan());
  };
  return (
    <div>
      <button type="button" className="text-[13px] font-medium text-[#3f35b5] disabled:opacity-50" disabled={busy} onClick={start}>
        Change type: Application ↔ Platform
      </button>
      {ask && (
        <div className="mt-2 rounded-lg border border-[#e6e8ee] p-3">
          <SwitchLines title="Kept" lines={ask.kept.map((rel) => ({ id: rel.id, line: linkLine(rel) }))} />
          <SwitchLines title="Remapped" lines={ask.remapped.map((rel) => ({ id: rel.id, line: linkLine(rel) }))} />
          <SwitchLines title="Removed" lines={ask.invalid} />
          {ask.merged.map((item) => (
            <p key={item.id} className="mt-2 text-[13px] text-[#4b5163]">{item.line}</p>
          ))}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} className="rounded-lg bg-[#5b4ce6] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50" onClick={() => void save(ask)}>
              {ask.invalid.length ? "Change type and remove them" : "Change type"}
            </button>
            <button type="button" className="text-[12px] text-[#6b7289]" onClick={() => { setAsk(null); setForcedDrops([]); }}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-[12px] text-[#b42318]">{error}</p>}
    </div>
  );
}

function SwitchLines({ title, lines }: { title: string; lines: { id: string; line: string }[] }) {
  return (
    <div className="mt-2 first:mt-0">
      <p className="text-[12px] font-semibold text-[#3c4254]">{title}</p>
      {lines.length === 0 ? (
        <p className="text-[13px] text-[#8b90a0]">None</p>
      ) : (
        <ul className="mt-1 list-disc pl-4 text-[13px] text-[#4b5163]">
          {lines.map((item) => <li key={item.id}>{item.line}</li>)}
        </ul>
      )}
    </div>
  );
}

function RelList({ title, items, empty }: { title: string; items: { id: string; name: string }[]; empty: string }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">{title.toUpperCase()}</h3>
      {items.length === 0 ? (
        <p className="text-[13px] text-[#8b90a0]">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="text-[13px] text-[#1c2230]">{item.name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Relationships({ row, canEdit }: { row: CatalogRow; canEdit: boolean }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const objects = catalog.data?.objects ?? [];
  const rels = catalog.data?.relationships ?? [];
  const nameOf = (id: string) => objects.find((item) => item.id === id)?.name ?? "Untitled";
  const relatedNameOverrides = Object.fromEntries(objects.map((item) => [item.id, item.name]));
  const partyIds = sameNamePartyIds(objects, row.id, row.object.type, row.name);
  const rowRelationships = relationshipsForIds(rels, partyIds);
  const storedObject = isCatalogObjectId(row.id);

  const refreshAfterWrite = () => {
    if (!orgSlug || !workspaceSlug) return;
    queryClient.invalidateQueries({ queryKey: ["relationships"] });
    queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, row.id] });
  };

  const open = () => setAdding(true);

  const remove = async (id: string) => {
    if (!orgSlug || !workspaceSlug) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const rel = rels.find((item) => item.id === id);
      await relationshipsApi.delete(orgSlug, workspaceSlug, id, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
      if (rel && suppliedByVendorClear(rel, row.id)) {
        const properties = { ...(row.object.properties ?? {}) };
        delete properties.vendor;
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: { ...row.object, properties } });
      }
      refreshAfterWrite();
    } catch (err) {
      toast({
        title: "Couldn't remove the connection",
        description: err instanceof Error ? err.message : "Could not remove",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    }
  };

  let lists = null;
  if (row.kind === "application") {
    const nameById = { ...relatedNameOverrides, [row.id]: row.name };
    const flows = objects.filter((item) => item.type === "integration_flow");
    lists = (
      <div>
        <h3 className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">RELATIONSHIP MAP</h3>
        <SystemDiagramPreview
          system={row.object}
          relationships={rels}
          nameById={nameById}
          flows={flows}
          onExpand={() => setExpanded(true)}
        />
        {expanded && (
          <SystemDiagramModal
            system={row.object}
            relationships={rels}
            flows={flows}
            onClose={() => setExpanded(false)}
            onAddConnection={canEdit ? () => { setExpanded(false); open(); } : undefined}
          />
        )}
      </div>
    );
  } else if (row.object.type === "model") {
    const linked = rels.filter(
      (rel) =>
        rel.to_object_id === row.id &&
        rel.type === "runs_on" &&
        (rel.from_type === "component" || rel.from_type === "integration_flow" || rel.from_type === "application")
    );
    lists = (
      <div className="space-y-4">
        <RelList title="Applications" items={linked.filter((rel) => rel.from_type === "application").map((rel) => ({ id: rel.from_object_id, name: nameOf(rel.from_object_id) }))} empty="No applications run on this server yet." />
        <RelList title="Components" items={linked.filter((rel) => rel.from_type === "component").map((rel) => ({ id: rel.from_object_id, name: nameOf(rel.from_object_id) }))} empty="No components run on this runtime yet." />
        <RelList title="Integrations" items={linked.filter((rel) => rel.from_type === "integration_flow").map((rel) => ({ id: rel.from_object_id, name: nameOf(rel.from_object_id) }))} empty="No integrations reference this runtime yet." />
      </div>
    );
  } else if (row.object.type === "cloud_service") {
    const systems = rels.filter(
      (rel) =>
        rel.to_object_id === row.id &&
        (rel.type === "built_on" || rel.type === "runs_on") &&
        (isSystemObjectType(rel.from_type) || rel.from_type === "application")
    );
    const components = rels.filter(
      (rel) => rel.to_object_id === row.id && rel.type === "built_on" && rel.from_type === "component"
    );
    lists = (
      <div className="space-y-4">
        <h3 className="text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">
          BUILT ON THIS PLATFORM ({systems.length + components.length})
        </h3>
        {systems.length === 0 && components.length === 0 ? (
          <p className="text-[13px] text-[#8b90a0]">No systems or components linked yet.</p>
        ) : (
          <>
            {systems.length > 0 && (
              <RelList title="Systems" items={systems.map((rel) => ({ id: rel.from_object_id, name: nameOf(rel.from_object_id) }))} empty="" />
            )}
            {components.length > 0 && (
              <RelList title="Components" items={components.map((rel) => ({ id: rel.from_object_id, name: nameOf(rel.from_object_id) }))} empty="" />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {lists}
      <ObjectRelationshipsTab
        objectId={row.id}
        objectName={row.name}
        objectType={row.object.type}
        relationships={rowRelationships}
        relatedNameOverrides={relatedNameOverrides}
        onAdd={canEdit && storedObject ? open : undefined}
        onRemove={canEdit && storedObject ? remove : undefined}
      />
      {adding && (
        <RelationshipForm
          fromObject={row.object}
          onClose={() => setAdding(false)}
          onSuccess={(rel) => {
            if (orgSlug && workspaceSlug) {
              applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
            }
            refreshAfterWrite();
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
