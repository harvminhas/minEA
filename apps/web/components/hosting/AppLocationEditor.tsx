"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import {
  choiceFromApp,
  findServer,
  planLocationChange,
  type LocationChoice,
  type ServerOption,
} from "@/lib/setup/hosting-choice";
import { LocationChips } from "@/components/hosting/LocationChips";
import {
  EMPTY_DETAIL,
  cloudProvider,
  findTenant,
  linkRegion,
  planTenantSave,
  providerGroupLabel,
  tenantOptions,
  tenantProperties,
  type HostingDetail,
} from "@/lib/hosting/cloud";
import { usePermissions } from "@/lib/use-permissions";

/** The org's servers & infrastructure that an app can run on ("model" records). */
export function useServerOptions(): (ServerOption & { id: string })[] {
  const catalog = useModelCatalog();
  return useMemo(
    () => (catalog.data?.objects ?? []).filter((object) => object.type === "model").map((object) => ({ id: object.id, name: object.name })),
    [catalog.data?.objects],
  );
}

type Shown = { choice: LocationChoice; serverName?: string };

/**
 * The four choices for one saved app, saved straight away (Hosting & location, app record).
 * hosting_model is the single source of truth for the chip; runs-on links to servers only name
 * the server for "Our server". Leaving "Our server" removes those links (asks first if several).
 * Optimistic: the chip moves at once, a small "Saved" tick confirms, an error puts it back.
 */
export function AppLocationEditor({ app, compact = false }: { app: MinEAObject; compact?: boolean }) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const servers = useServerOptions();
  const { canEdit } = usePermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [optimistic, setOptimistic] = useState<Shown | null>(null);
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const serverIds = new Set(servers.map((server) => server.id));
  const serverLinks = (catalog.data?.relationships ?? [])
    .filter((rel) => rel.from_object_id === app.id && rel.type === "runs_on" && serverIds.has(rel.to_object_id))
    .map((rel) => ({ id: rel.id, serverId: rel.to_object_id }));
  const objects = catalog.data?.objects ?? [];
  const tenants = useMemo(() => tenantOptions(objects), [objects]);
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));
  const tenantLinks = (catalog.data?.relationships ?? [])
    .filter((rel) => rel.from_object_id === app.id && (rel.type === "runs_on" || rel.type === "built_on") && tenantIds.has(rel.to_object_id))
    .map((rel) => ({ id: rel.id, tenantId: rel.to_object_id, region: linkRegion(rel.attributes) }));
  const storedTenant = tenantLinks[0] ? objects.find((object) => object.id === tenantLinks[0]!.tenantId) : undefined;
  const storedDetail: HostingDetail = storedTenant
    ? {
        provider: cloudProvider((storedTenant.properties as Record<string, unknown> | undefined)?.cloud_provider)?.id ?? null,
        tenantName: storedTenant.name,
        tenantId: storedTenant.id,
        region: tenantLinks[0]!.region,
      }
    : EMPTY_DETAIL;
  const [draft, setDraft] = useState<HostingDetail | null>(null);
  const detail = draft ?? storedDetail;
  const props = (app.properties ?? {}) as Record<string, unknown>;
  const vendor = providerGroupLabel(String(props.vendor ?? ""));
  const stored: Shown = {
    choice: choiceFromApp(props.hosting_model),
    serverName: serverLinks.length ? servers.find((server) => server.id === serverLinks[0]!.serverId)?.name : undefined,
  };
  const [cloudPick, setCloudPick] = useState(false);
  const shown = optimistic ?? (picking ? { ...stored, choice: "own" as const } : cloudPick ? { choice: "own_cloud" as const } : stored);
  const strayLinks = stored.choice !== "own" && serverLinks.length > 0;

  const invalidate = () => {
    if (!orgSlug || !workspaceSlug) return;
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    void queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, app.id] });
    void queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["relationships"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-setup", orgSlug, workspaceSlug] });
  };

  const apply = async (next: Shown, plan: ReturnType<typeof planLocationChange> & { newServerName?: string }) => {
    if (!orgSlug || !workspaceSlug) return;
    if (plan.needsConfirm) {
      const names = serverLinks.map((link) => servers.find((server) => server.id === link.serverId)?.name ?? "a server").join(", ");
      if (!window.confirm(`${app.name} runs on ${names}. Remove these links?`)) return;
    }
    setOptimistic(next);
    setBusy(true);
    setError("");
    setSaved(false);
    const before = { object: app, links: (catalog.data?.relationships ?? []).filter((rel) => plan.removeLinkIds.includes(rel.id)) };
    // Optimistic cache: the record, the readiness count and the Runs on field move together.
    applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: { ...app, properties: { ...props, hosting_model: plan.hosting } } as MinEAObject });
    for (const id of plan.removeLinkIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      let serverId = plan.addServerId;
      if (plan.newServerName) {
        const created = await objectsApi.create(orgSlug, workspaceSlug, {
          type: "model",
          name: plan.newServerName,
          properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" },
        }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
        serverId = created.id;
      }
      if (serverId) {
        const link = await relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "runs_on",
          from_object_id: app.id,
          from_type: app.type,
          to_object_id: serverId,
          to_type: "model",
        }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: link });
      }
      for (const id of plan.removeLinkIds) await relationshipsApi.delete(orgSlug, workspaceSlug, id, token);
      if ((props.hosting_model ?? null) !== plan.hosting) {
        const savedObject = await objectsApi.update(orgSlug, workspaceSlug, app.id, { properties: { hosting_model: plan.hosting } }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: savedObject });
      }
      setSaved(true);
    } catch (err) {
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: before.object });
      for (const rel of before.links) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel as Relationship });
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setOptimistic(null);
      setBusy(false);
      invalidate();
    }
  };

  // Our cloud (or a SaaS tenant/region): save the tenant platform, the runs-on link and its region.
  const saveCloud = async (choice: "own_cloud" | "saas") => {
    if (!orgSlug || !workspaceSlug) return;
    const plan = planTenantSave(detail, tenantLinks, tenants, choice);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      let tenantId = plan.tenantId;
      if (plan.createTenant) {
        const created = await objectsApi.create(orgSlug, workspaceSlug, {
          type: "cloud_service",
          name: plan.createTenant,
          properties: tenantProperties(choice === "own_cloud" ? detail.provider ?? "other" : null, vendor || undefined),
        }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
        tenantId = created.id;
      }
      if (plan.updateLinkId) {
        const link = await relationshipsApi.updateAttributes(orgSlug, workspaceSlug, plan.updateLinkId, { region: plan.region || null }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: link });
      } else if (tenantId) {
        const link = await relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "runs_on",
          from_object_id: app.id,
          from_type: app.type,
          to_object_id: tenantId,
          to_type: "cloud_service",
          attributes: plan.region ? { region: plan.region } : {},
        }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: link });
      }
      for (const id of plan.removeLinkIds) {
        await relationshipsApi.delete(orgSlug, workspaceSlug, id, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
      }
      // Our cloud never keeps a stray server link; SaaS keeps nothing on servers either.
      for (const link of serverLinks) {
        await relationshipsApi.delete(orgSlug, workspaceSlug, link.id, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: link.id });
      }
      if ((props.hosting_model ?? null) !== choice) {
        const savedObject = await objectsApi.update(orgSlug, workspaceSlug, app.id, { properties: { hosting_model: choice } }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: savedObject });
      }
      setDraft(null);
      setCloudPick(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
      invalidate();
    }
  };

  const choose = (choice: LocationChoice) => {
    if (choice === "own") {
      setPicking(true); // saved once a server is picked
      setCloudPick(false);
      return;
    }
    setPicking(false);
    if (choice === "own_cloud") {
      setCloudPick(stored.choice !== "own_cloud");
      if (stored.choice !== "own_cloud") setDraft({ ...detail, provider: detail.provider ?? "azure", tenantName: detail.tenantName || "" });
      return;
    }
    setCloudPick(false);
    // Re-clicking the current choice is a no-op, unless stray server links remain (old data):
    // then it removes them, which is how a stuck "Our server" is restored.
    if (choice === stored.choice && !strayLinks) return;
    // Leaving SaaS / Our cloud for a server, people's computers or "Don't know" drops tenant links too.
    const links = choice === "saas" ? serverLinks : [...serverLinks, ...tenantLinks.map((link) => ({ id: link.id, serverId: link.tenantId }))];
    void apply({ choice }, planLocationChange({ hosting: props.hosting_model, serverLinks: links }, { choice }));
  };

  const pickServer = (name: string, existing?: ServerOption) => {
    setPicking(false);
    const match = (existing?.id ? existing : findServer(servers, name)) as (ServerOption & { id?: string }) | undefined;
    if (match?.id) {
      void apply({ choice: "own", serverName: match.name }, planLocationChange({ hosting: props.hosting_model, serverLinks }, { choice: "own", serverId: match.id }));
      return;
    }
    const plan = planLocationChange({ hosting: props.hosting_model, serverLinks }, { choice: "own", serverId: "__new__" });
    void apply({ choice: "own", serverName: name.trim() }, { ...plan, addServerId: null, newServerName: name.trim() });
  };

  return (
    <div className={compact ? "" : "rounded-xl border border-[#e6e8ee] p-3"} data-testid="app-location-editor">
      {!compact && (
        <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#6b7289]">
          Where does it run?
          {saved && <SavedTick />}
        </p>
      )}
      <LocationChips
        value={shown.choice}
        serverName={shown.choice === "own" ? shown.serverName : undefined}
        servers={servers}
        onChoose={choose}
        onPickServer={pickServer}
        disabled={busy || !canEdit}
        detail={detail}
        tenants={tenants}
        vendor={vendor || undefined}
        onDetail={(next) => setDraft(next)}
      />
      {(shown.choice === "own_cloud" || shown.choice === "saas") && draft && canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" data-testid="cloud-save" disabled={busy || (shown.choice === "own_cloud" && !detail.tenantName.trim())} onClick={() => void saveCloud(shown.choice as "own_cloud" | "saas")} className="rounded-lg bg-[#5b4ce6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50">Save</button>
          <button type="button" onClick={() => { setDraft(null); setCloudPick(false); }} className="text-[12px] text-[#6b7289]">Cancel</button>
        </div>
      )}
      {compact && saved && <SavedTick />}
      {strayLinks && !optimistic && (
        <p className="mt-1 text-[11px] text-[#92400e]">Still linked to {stored.serverName}. Click {hostingLabel(stored.choice)} again to remove the link.</p>
      )}
      {error && <p className="mt-1 text-[12px] text-[#b42318]">Couldn&apos;t save: {error}</p>}
    </div>
  );
}

function hostingLabel(choice: LocationChoice): string {
  return choice === "saas" ? "SaaS" : choice === "own_cloud" ? "Our cloud" : choice === "desktop" ? "On people's computers" : "Don't know";
}

function SavedTick() {
  return (
    <span data-testid="location-saved" role="status" className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#047857]">
      <Check size={12} /> Saved
    </span>
  );
}

