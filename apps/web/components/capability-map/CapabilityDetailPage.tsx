"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { domainDetailPath } from "@/lib/capability-map-paths";
import { usePermissions } from "@/lib/use-permissions";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { buildCapabilityTree } from "@/lib/capability-tree";
import {
  capabilityDetailPath,
  capabilityMapHref,
  findCapabilityNode,
  asLinkableType,
  isLinkableApp,
  linksOn,
  planMoveRelationship,
  type AppLink,
  type AppRef,
  type RelLike,
} from "@/lib/capability-detail";
import {
  assessCapability,
  parseDisposition,
  suggestInvestmentPosture,
  type CapabilityRecord,
  type Disposition,
} from "@/lib/capability-assessment";
import type { AssessmentPatch } from "@/components/capability-map/CapabilityAssessmentFields";
import { displayFitness, serializeFunctionalAssessment, type FunctionalAssessment } from "@minea/types";
import { CapabilityDetailView } from "@/components/capability-map/CapabilityDetailView";
import { themeForDomain } from "@/lib/domain-theme";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import type { MinEAObject } from "@minea/types";
import { useStructureActions, type StructureTarget } from "@/components/capability-map/StructureActions";
import { useCapabilityMappedLinks } from "@/lib/use-capability-mapped-links";
import type { MappedScope } from "@/lib/capability-mapping";
import { recordPageTabFromSearch, recordPageTabQuery, type RecordPageTab } from "@/lib/record-tabs";
import { EntityOwnerLine } from "@/components/people/EntityOwnerLine";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";

export function CapabilityDetailPage({ capabilityId }: { capabilityId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const highlightId = params.get("activity");
  const tab = recordPageTabFromSearch(params.get("tab"), params.get("focus"));
  const focusOwner = params.get("focus") === "owner";
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canEdit, canCreate } = usePermissions();
  const catalog = useModelCatalog();
  const queryClient = useQueryClient();
  const objects = catalog.data?.objects ?? [];
  const [leaving, setLeaving] = useState(false);
  const onDeleted = useCallback(
    (target: StructureTarget) => {
      if (target.id === capabilityId) {
        setLeaving(true);
        router.replace(capabilityMapHref(basePath, { workspace: "architect", domain: target.domainId }));
        return;
      }
      if (target.id === highlightId) {
        router.replace(capabilityDetailPath(basePath, capabilityId));
      }
    },
    [basePath, capabilityId, highlightId, router],
  );
  const structure = useStructureActions(objects, { onDeleted });
  const edges = (catalog.data?.relationships ?? []) as RelLike[];
  const rows = catalog.data?.rows ?? [];

  const tree = useMemo(() => buildCapabilityTree(objects, edges, rows), [objects, edges, rows]);
  const node = useMemo(() => findCapabilityNode(tree, capabilityId), [tree, capabilityId]);
  const domain = useMemo(() => {
    const domainId = node?.domainId;
    if (!domainId) return undefined;
    return objects.find((item) => item.id === domainId);
  }, [node?.domainId, objects]);
  const domainName = domain?.name ?? "";
  const theme = useMemo(() => themeForDomain(domain), [domain]);

  const apps = useMemo(() => {
    const list: AppRef[] = [];
    for (const object of objects) {
      if (isLinkableApp(object)) list.push({ id: object.id, name: object.name, type: object.type, status: object.status });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [objects]);
  const appMap = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);

  const targetIds = useMemo(() => (node ? [node.id, ...node.children.map((child) => child.id)] : []), [node]);
  const linksByTarget = useMemo(() => {
    const map = new Map<string, AppLink[]>();
    for (const id of targetIds) map.set(id, linksOn(id, edges, appMap));
    return map;
  }, [targetIds, edges, appMap]);

  const activityNode = useMemo(() => {
    if (!node || !highlightId) return null;
    return node.children.find((child) => child.id === highlightId) ?? null;
  }, [node, highlightId]);
  const pageNode = activityNode ?? node;
  const scopes = useMemo<MappedScope[]>(() => {
    if (!node) return [];
    if (activityNode) return [{ id: activityNode.id, name: activityNode.name, level: "activity" as const }];
    return [
      { id: node.id, name: node.name, level: "capability" as const },
      ...node.children.map((child) => ({ id: child.id, name: child.name, level: "activity" as const })),
    ];
  }, [node, activityNode]);
  const mapped = useCapabilityMappedLinks(scopes, node?.id);

  const [addFor, setAddFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const recordId = activityNode?.id ?? capabilityId;
  const recordObject = objects.find((item) => item.id === recordId);
  const debt = useObjectTechDebtSummary(recordId, Boolean(recordId));
  const history = useQuery({
    queryKey: ["object-history", orgSlug, workspaceSlug, recordId],
    enabled: Boolean(orgSlug && workspaceSlug && recordId),
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { entries: [] };
      return objectsApi.history(orgSlug, workspaceSlug, recordId, token);
    },
  });
  const setTab = (next: RecordPageTab) => {
    const query: { activity?: string | null; tab?: string; focus?: string | null } = {
      activity: highlightId,
      tab: recordPageTabQuery(next),
    };
    if (next !== "overview") query.focus = null;
    else if (focusOwner) query.focus = "owner";
    router.replace(capabilityDetailPath(basePath, capabilityId, query), { scroll: false });
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["relationships"] });
  };

  const run = async (work: (token: string) => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in to make changes.");
      await work(token);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = (link: AppLink) =>
    run(async (token) => {
      await relationshipsApi.delete(orgSlug, workspaceSlug, link.relId, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: link.relId });
    });

  const onMove = (link: AppLink, targetId: string) =>
    run(async (token) => {
      const rel = edges.find((item) => item.id === link.relId);
      if (!rel) return;
      const plan = planMoveRelationship(rel, targetId, edges);
      if (plan.kind === "noop") return;
      if (plan.kind === "create-then-delete") {
        const created = await relationshipsApi.create(
          orgSlug,
          workspaceSlug,
          {
            type: "supported_by",
            from_object_id: plan.fromObjectId,
            from_type: "capability",
            to_object_id: plan.toObjectId,
            to_type: asLinkableType(plan.toType),
            attributes: plan.attributes,
          },
          token
        );
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created });
      }
      await relationshipsApi.delete(orgSlug, workspaceSlug, plan.sourceRelId, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: plan.sourceRelId });
    });

  const onRename = (id: string, name: string) =>
    run(async (token) => {
      const updated = await objectsApi.update(orgSlug, workspaceSlug, id, { name }, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: updated });
    });

  const onSetDescription = (value: string) =>
    run(async (token) => {
      const updated = await objectsApi.update(orgSlug, workspaceSlug, recordId, { description: value }, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: updated });
    });

  const onSetFitness = (link: AppLink, fitness: "strong" | "adequate" | "weak") =>
    run(async (token) => {
      const updated = await relationshipsApi.updateAttributes(
        orgSlug,
        workspaceSlug,
        link.relId,
        { ...link.attributes, fitness },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: updated });
    });

  const onSetDisposition = (link: AppLink, disposition: Disposition) =>
    run(async (token) => {
      const updated = await relationshipsApi.updateAttributes(
        orgSlug,
        workspaceSlug,
        link.relId,
        { ...link.attributes, disposition },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: updated });
    });

  const onSetAssessment = (patch: AssessmentPatch) =>
    run(async (token) => {
      const updated = await objectsApi.update(
        orgSlug,
        workspaceSlug,
        capabilityId,
        { properties: patch as Record<string, unknown> },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: updated });
    });

  const onSetFunctionalAssessment = (link: AppLink, next: FunctionalAssessment) =>
    run(async (token) => {
      const fitness = displayFitness({ ...link.attributes, functional_assessment: serializeFunctionalAssessment(next) });
      const updated = await relationshipsApi.updateAttributes(
        orgSlug,
        workspaceSlug,
        link.relId,
        {
          ...link.attributes,
          functional_assessment: serializeFunctionalAssessment(next),
          ...(fitness ? { fitness } : {}),
        },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: updated });
    });

  const onAddActivity = (name: string) =>
    run(async (token) => {
      const created = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "capability",
          name,
          status: "active",
          properties: {
            domain_id: node?.domainId ?? undefined,
            parent_id: capabilityId,
            order_index: (node?.children.length ?? 0) + 1,
          },
        },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
    });

  if (catalog.isLoading && !node) {
    return (
      <div className="px-6 py-5">
        <p className="text-[13px] text-[#8b90a0]">Loading capability…</p>
      </div>
    );
  }

  if (!node) {
    if (leaving) {
      return (
        <div className="px-6 py-5" data-testid="capability-detail-leaving">
          <p className="text-[13px] text-[#8b90a0]">Returning to the map…</p>
        </div>
      );
    }
    return (
      <div className="px-6 py-5" data-testid="capability-detail">
        <p className="text-[13px] text-[#8b90a0]">This capability is not on the map.</p>
      </div>
    );
  }

  const viewNode = activityNode ?? node;
  const fromIds = activityNode ? [activityNode.id] : [node.id, ...node.children.map((child) => child.id)];
  const fromRecords = fromIds
    .map((id) => objects.find((item) => item.id === id))
    .filter((item): item is MinEAObject => Boolean(item));
  const fromObject = fromRecords.find((item) => item.id === addFor) ?? fromRecords[0];

  const capRecord = objects.find((item) => item.id === capabilityId) as CapabilityRecord | undefined;
  const assessment = assessCapability(capRecord, objects as CapabilityRecord[], edges);
  const dispositions = [...linksByTarget.values()]
    .flat()
    .map((link) => parseDisposition(link.attributes?.disposition))
    .filter((item): item is Disposition => Boolean(item));
  const suggestedPosture = suggestInvestmentPosture(assessment, node, dispositions);
  const relationshipCount = mapped.groups.reduce((sum, group) => sum + group.items.length, 0);
  const historyEntries = history.data?.entries ?? [];

  return (
    <>
      {structure.dialogs}
      <CapabilityDetailView
      node={viewNode}
      domainName={domainName}
      theme={theme}
      backHref={capabilityMapHref(basePath, { domain: node.domainId })}
      allDomainsHref={capabilityMapHref(basePath)}
      domainHref={orgSlug && workspaceSlug && node.domainId ? domainDetailPath(orgSlug, workspaceSlug, node.domainId) : null}
      activityPage={Boolean(activityNode)}
      parentHref={activityNode ? capabilityDetailPath(basePath, node.id) : undefined}
      parentName={activityNode ? node.name : undefined}
      moveRoot={node}
      tab={tab}
      onTab={setTab}
      relationshipCount={relationshipCount}
      openDebtCount={debt.data?.open_count ?? 0}
      historyCount={historyEntries.length}
      description={recordObject?.description ?? ""}
      onSetDescription={onSetDescription}
      ownerLine={
        <EntityOwnerLine
          objectId={viewNode.id}
          objectType="capability"
          object={recordObject}
          canEdit={canEdit}
          openEditor={focusOwner}
        />
      }
      techDebtPanel={
        <ObjectTechDebtTab
          objectId={viewNode.id}
          objectName={viewNode.name}
          objectKind="capability"
          summary={debt.data}
          isLoading={debt.isLoading}
          onRefresh={() => void debt.refetch()}
        />
      }
      historyPanel={
        <EntityHistoryPanel
          entries={historyEntries}
          isLoading={history.isLoading}
          emptyMessage="No history yet. Changes to this record will appear here."
        />
      }
      onOpenActivity={(activityId) =>
        router.push(capabilityDetailPath(basePath, node.id, { activity: activityId }))
      }
      highlightId={highlightId}
      linksByTarget={linksByTarget}
      canEdit={canEdit}
      canCreate={canCreate}
      error={error}
      onAdd={setAddFor}
      onRemove={(link) => void onRemove(link)}
      onMove={(link, targetId) => void onMove(link, targetId)}
      onRename={(id, name) => onRename(id, name)}
      onSetFitness={(link, fitness) => void onSetFitness(link, fitness)}
      onSetDisposition={(link, disposition) => void onSetDisposition(link, disposition)}
      assessment={assessment}
      suggestedPosture={suggestedPosture}
      onSetAssessment={(patch) => void onSetAssessment(patch)}
      catalogObjects={objects as CapabilityRecord[]}
      catalogEdges={edges}
      processes={mapped.processes}
      onSetFunctionalAssessment={(link, next) => void onSetFunctionalAssessment(link, next)}
      assessmentError={error}
      onAddActivity={(name) => onAddActivity(name)}
      structure={structure}
      relationshipGroups={mapped.groups}
      addDialog={
        addFor && fromObject ? (
          <RelationshipForm
            fromObject={fromObject}
            fromRecords={fromRecords}
            onClose={() => setAddFor(null)}
            onSuccess={() => {
              setAddFor(null);
              refresh();
              void queryClient.invalidateQueries({ queryKey: ["capability-mapping-lists"] });
              void queryClient.invalidateQueries({ queryKey: ["entity-accountabilities"] });
            }}
          />
        ) : null
      }
    />
    </>
  );
}
