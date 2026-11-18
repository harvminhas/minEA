"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
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
import { CapabilityDetailView } from "@/components/capability-map/CapabilityDetailView";
import { themeForDomain } from "@/lib/domain-theme";
import { AddRelationshipDialog } from "@/components/capability-map/AddRelationshipDialog";
import { useStructureActions, type StructureTarget } from "@/components/capability-map/StructureActions";

export function CapabilityDetailPage({ capabilityId }: { capabilityId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const highlightId = params.get("activity");
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canEdit, canCreate } = usePermissions();
  const catalog = useModelCatalog();
  const queryClient = useQueryClient();
  const objects = catalog.data?.objects ?? [];
  const [leaving, setLeaving] = useState(false);
  const onDeleted = useCallback(
    (target: StructureTarget) => {
      if (target.id !== capabilityId) return;
      setLeaving(true);
      router.replace(capabilityMapHref(basePath, { workspace: "architect", domain: target.domainId }));
    },
    [basePath, capabilityId, router],
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

  const linkedByApp = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [targetId, links] of linksByTarget) {
      for (const link of links) {
        const current = map.get(link.appId) ?? [];
        current.push(targetId);
        map.set(link.appId, current);
      }
    }
    return map;
  }, [linksByTarget]);

  const targetNames = useMemo(() => {
    const map = new Map<string, string>();
    if (!node) return map;
    map.set(node.id, node.name);
    for (const child of node.children) map.set(child.id, child.name);
    return map;
  }, [node]);

  const [addFor, setAddFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const onLink = (targetId: string, appId: string) =>
    run(async (token) => {
      const app = appMap.get(appId);
      const rel = await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "supported_by",
          from_object_id: targetId,
          from_type: "capability",
          to_object_id: appId,
          to_type: asLinkableType(app?.type),
          attributes: { fitness: "strong" },
        },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
      setAddFor(null);
    });

  const onCreate = (targetId: string, name: string) =>
    run(async (token) => {
      const app = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "application", name, status: "active", properties: {} },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: app });
      const rel = await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "supported_by",
          from_object_id: targetId,
          from_type: "capability",
          to_object_id: app.id,
          to_type: app.type,
          attributes: { fitness: "strong" },
        },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
      setAddFor(null);
    });

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

  const targets = [
    { id: node.id, name: node.name, level: "capability" as const },
    ...node.children.map((child) => ({ id: child.id, name: child.name, level: "activity" as const })),
  ];

  const capRecord = objects.find((item) => item.id === capabilityId) as CapabilityRecord | undefined;
  const assessment = assessCapability(capRecord, objects as CapabilityRecord[], edges);
  const dispositions = [...linksByTarget.values()]
    .flat()
    .map((link) => parseDisposition(link.attributes?.disposition))
    .filter((item): item is Disposition => Boolean(item));
  const suggestedPosture = suggestInvestmentPosture(assessment, node, dispositions);

  return (
    <>
      {structure.dialogs}
      <CapabilityDetailView
      node={node}
      domainName={domainName}
      theme={theme}
      backHref={capabilityMapHref(basePath, { domain: node.domainId })}
      allDomainsHref={capabilityMapHref(basePath)}
      detailsHref={capabilityDetailPath(basePath, node.id, { activity: highlightId, tab: "details" })}
      activityDetailsHref={(activityId) =>
        capabilityDetailPath(basePath, node.id, { activity: activityId, tab: "details", details: activityId })
      }
      onOpenDetails={(href) => router.push(href)}
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
      onAddActivity={(name) => onAddActivity(name)}
      structure={structure}
      addDialog={
        addFor ? (
          <AddRelationshipDialog
            targets={targets}
            defaultTargetId={addFor}
            apps={apps}
            linkedByApp={linkedByApp}
            targetNames={targetNames}
            busy={busy}
            error={error}
            onClose={() => setAddFor(null)}
            onLink={(targetId, appId) => onLink(targetId, appId)}
            onCreate={(targetId, name) => onCreate(targetId, name)}
          />
        ) : null
      }
    />
    </>
  );
}
