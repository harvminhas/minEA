"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { addApi } from "@/lib/api-client";
import { serverIdsAfter, whereBatch } from "@/lib/setup/where-batch";
import { useAuth } from "@/lib/auth-context";
import { AppAddPanel } from "@/components/add/AppAddPanel";
import type { AddReceipt } from "@/lib/setup/add-cards";
import { OwnerDatalists, PERSON_PICKS_ID, TEAM_PICKS_ID, useOwnerPicks } from "@/components/ownership/OwnerPicks";
import { canonicalOwner } from "@/lib/owner-picks";
import { licenceCount, perSeatLine, yearlyFor } from "@/lib/setup/licence-cost";
import { draftsFromCards } from "@/lib/setup/card-drafts";
import { useAppStore } from "@/lib/store";
import type { CostLine } from "@/lib/cost/math";
import {
  SAMPLE_COMPANY,
  defaultHosting,
  isSetupApp,
  normalizeTerm,
  setupMatch,
  planHosting,
  type HostingChoice,
  type MatchItem,
  type ToolRecord,
} from "@/lib/setup/match-tools";
import { SETUP_SCREENS, aiStepPatch, aiStepRows, replaceTypicalLine, setupCreate, storedSetupStep, type AiStepRow } from "@/lib/setup/add-plan";
import type { AiFeatureAudience } from "@minea/types";
import { modelPath } from "@/lib/mvp-paths";
import { SETUP_MIN, setupMeter, setupPill, setupState } from "@/lib/setup/setupMin";
import { LocationChips } from "@/components/hosting/LocationChips";
import { CLOUD_PROVIDERS, EMPTY_DETAIL, suggestsOwnCloud, type HostingDetail } from "@/lib/hosting/cloud";
import { useCloudPicker } from "@/lib/hosting/use-cloud-regions";
import { whereStepKeys } from "@/lib/setup/where-needed";
import { collectPendingTenants } from "@/lib/hosting/pending-tenants";
import type { LocationChoice } from "@/lib/setup/hosting-choice";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";

type Draft = MatchItem & {
  key: string;
  choice: HostingChoice;
  serverName: string;
  objectId?: string;
  ownerTeam: string;
  ownerName: string;
  renewal: string;
  licences: string;
  yearly: string;
  typical: boolean;
  /** Our cloud / SaaS: provider, tenant platform and region for the runs-on link. */
  detail?: HostingDetail;
};

function isApp(item: Draft): boolean {
  return isSetupApp(item);
}

function typicalLine(annual: number, vendor: string): CostLine {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "subscription",
    amount_cents: Math.round(annual * 100),
    frequency: "annual",
    calculation: { kind: "flat" },
    vendor: vendor || null,
    source: "estimate",
    notes: "typical",
    created_at: now,
    created_by: "setup",
    updated_at: now,
    updated_by: "setup",
  };
}

function displayName(item: { status: string; input: string; tool?: { name: string } | null }): string {
  return item.status === "matched" && item.tool ? item.tool.name : item.input;
}

function mergeDrafts(previous: Draft[], next: Draft[]): Draft[] {
  return next.map((item) => {
    const old = previous.find((row) => row.key === item.key);
    if (!old) return item;
    const keepTool = old.status === "matched" || old.status === "custom";
    return {
      ...item,
      status: old.status,
      tool: keepTool ? old.tool : item.tool,
      customBuilt: old.customBuilt,
      choice: old.choice,
      serverName: old.serverName,
      detail: old.detail,
      objectId: old.objectId,
      ownerTeam: old.ownerTeam,
      licences: old.licences,
      ownerName: old.ownerName,
      renewal: old.renewal,
      yearly: old.yearly,
      typical: old.typical,
    };
  });
}

function toDrafts(items: MatchItem[]): Draft[] {
  return items.map((item) => {
    const yearly = item.status === "matched" ? item.tool?.typicalAnnual : null;
    return {
      ...item,
      customBuilt: item.status === "custom",
      key: normalizeTerm(item.input),
      choice: defaultHosting(item),
      serverName: "",
      ownerTeam: "",
      licences: "",
      ownerName: "",
      renewal: "",
      yearly: yearly ? String(yearly) : "",
      typical: yearly != null,
    };
  });
}

function wizardChoice(choice: HostingChoice): LocationChoice {
  return choice === "saas" || choice === "own_cloud" || choice === "own" || choice === "desktop" ? choice : choice === "paas" || choice === "self_hosted" ? "saas" : "unknown";
}

/** Saved apps with no host yet, plus saved servers keyed like planHosting keys them. */
export function whereStepSeed(
  objects: { id: string; name: string; type: string; properties?: unknown }[],
  relationships: { type: string; from_object_id: string }[],
): { drafts: { id: string; name: string }[]; serverIds: Record<string, string> } {
  // Apps with no known location yet (no host link, not Cloud, not people's computers).
  const drafts = objects
    .filter((object) => object.type === "application" && setupState([object], relationships).located === 0)
    .map(({ id, name }) => ({ id, name }));
  const serverIds = Object.fromEntries(objects.filter((object) => object.type === "model").map((object) => [normalizeTerm(object.name), object.id]));
  return { drafts, serverIds };
}

/** Dev only (see AskScreen): the preview never writes the workspace's setup state. */
function setupPreview(): boolean {
  return process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "preview";
}

export function SetupFlow({ inline = false, startAt }: { inline?: boolean; startAt?: "where" }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken, user } = useAuth();
  const orgName = useAppStore((state) => state.activeOrg?.name) || "Your estate";
  const firstName = (user?.displayName || user?.email?.split("@")[0] || "there").trim().split(/\s+/)[0] || "there";
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const [text, setText] = useState("");
  const [prefill, setPrefill] = useState("");
  const [prefillPulse, setPrefillPulse] = useState(0);
  const [submitSignal, setSubmitSignal] = useState(0);
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [whereByServer, setWhereByServer] = useState<Record<string, string>>({});
  const [serverIds, setServerIds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [hosts, setHosts] = useState<Record<string, MinEAObject>>({});
  const [aiRows, setAiRows] = useState<AiStepRow[]>([]);
  const [aiPicks, setAiPicks] = useState<Record<string, AiPick>>({});
  const [error, setError] = useState("");

  const apps = drafts.filter(isApp);
  // Step 3 lists only the apps the add cards left open (see where-needed.ts); null = all of them.
  const [whereKeys, setWhereKeys] = useState<string[] | null>(null);
  const [whereSkipped, setWhereSkipped] = useState(false);
  // Step 2 in the bar: "done" once visited (answered or skipped by the person), "none" when there was
  // nothing to ask, "todo" when it was never shown but still has AI features to answer.
  const [aiStep, setAiStep] = useState<AiStepState>("done");
  const whereApps = whereKeys ? apps.filter((app) => whereKeys.includes(app.key)) : apps;
  const serverOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const object of catalog.data?.objects ?? []) {
      if (object.type === "model") names.set(normalizeTerm(object.name), object.name);
    }
    for (const draft of drafts) {
      if (draft.tool?.kind === "server") names.set(draft.key, draft.tool?.name || draft.input);
    }
    return [...names.entries()].map(([key, name]) => ({ key, name }));
  }, [catalog.data?.objects, drafts]);

  const { tenants: tenantList, custom: customRegions, addRegion } = useCloudPicker();
  const pendingTenants = collectPendingTenants(apps.map((app) => (app.choice === "own_cloud" || app.choice === "saas" ? app.detail : null)), tenantList);
  const planned = planHosting(
    whereApps.map((app) => ({ key: app.key, name: app.input, choice: app.choice, serverName: app.serverName })),
    whereByServer,
  );
  // Owner picks: workspace teams/people plus whatever was typed on another row (immediately).
  const ownerPickLists = useOwnerPicks(apps.map((app) => app.ownerTeam), apps.map((app) => app.ownerName));
  const catalogState = setupState(catalog.data?.objects ?? [], catalog.data?.relationships ?? []);
  const unsavedApps = apps.filter((app) => !app.objectId).length;
  // Step 1's pill: saved apps plus what the cards will still save. Not the typed lines: those
  // double-counted cards saved under a suggested name ("Wait While" → "Waitwhile") and counted
  // the ones left out by "Add the first N" on Free (Harvinder's "125 apps ✓" with 50 saved).
  const [panelPending, setPanelPending] = useState(0);
  // Apps given a known location on this screen (Cloud, a picked server, people's computers) and not
  // already counted from the catalogue.
  const newlyLocated = apps.filter((app) => {
    const known = app.choice === "saas" || app.choice === "desktop" || (app.choice === "own" && app.serverName.trim() !== "");
    if (!known) return false;
    const saved = app.objectId ? catalog.data?.objects.find((object) => object.id === app.objectId) : undefined;
    return !saved || setupState([saved], catalog.data?.relationships ?? []).located === 0;
  }).length;
  const catalogServerKeys = new Set(Object.keys(whereStepSeed(catalog.data?.objects ?? [], []).serverIds));
  const meter = setupMeter(catalogState.apps + unsavedApps, catalogState.located + newlyLocated);

  // startAt="where": the apps are already saved and only a server link is missing, so open
  // "Where each one lives" with the saved apps that have no host yet, and the saved servers
  // ready to pick (reused, never duplicated).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (startAt !== "where" || seeded || !catalog.data) return;
    const seed = whereStepSeed(catalog.data.objects, catalog.data.relationships);
    setDrafts(seed.drafts.map((item) => ({ ...toDrafts([{ input: item.name, status: "custom", tool: null, options: [], customBuilt: false }])[0], objectId: item.id, choice: "unknown" })));
    setServerIds(seed.serverIds);
    setWhereKeys(null);
    setWhereSkipped(false);
    // Opened straight at step 3: step 2 was never shown. It only counts as done when it had nothing to ask.
    setAiStep(aiStepRows(catalog.data.objects.filter((object) => object.type === "application").map((object) => ({ key: object.id, objectId: object.id, type: object.type, name: object.name, properties: object.properties }))).rows.length > 0 ? "todo" : "none");
    setStep(3);
    setSeeded(true);
  }, [startAt, seeded, catalog.data]);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!seeded) return;
    const frame = window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>("[data-where-own]")?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [seeded]);

  const patch = (key: string, change: Partial<Draft>) => {
    setDrafts((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  };

  useEffect(() => {
    if (step !== 1 && step !== 0) return;
    const timer = window.setTimeout(() => {
      // Tie lines already in the map to their objects so the progress pill doesn't count them twice.
      setDrafts((current) => draftsFromCards(mergeDrafts(current, toDrafts(setupMatch(text))), catalog.data?.objects ?? []));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, step, catalog.data?.objects]);

  // Fill the box AND show what it matched, so the click visibly does something even when the box
  // already held the sample. Nothing is saved until the person saves on a later screen.
  const loadSample = () => {
    setText(SAMPLE_COMPANY);
    setPrefill(SAMPLE_COMPANY);
    setPrefillPulse((n) => n + 1);
    setStep(1);
  };

  // Drafts for the later steps, built from the box text and the catalogue as the panel left it
  // (its save writes each object into the cached catalogue). Location comes from the card's
  // "Where does it live?" pick, saved as hosting_model.
  // The catalogue as it is NOW. A handler that runs right after a save (the panel's onSaved) was
  // created before that render, so its `catalog.data` is the pre-save copy; the query cache isn't.
  const freshCatalog = () => latestCatalog(queryClient, orgSlug && workspaceSlug ? catalogQueryKey(orgSlug, workspaceSlug) : null, catalog.data);

  const cardDrafts = (createdIds: string[] = [], idsByInput: Record<string, string> = {}): Draft[] => {
    return draftsFromCards(toDrafts(setupMatch(text)), freshCatalog().objects, createdIds, idsByInput).map((draft) =>
      draft.status === "matched" && !draft.yearly ? { ...draft, ...yearlyFor(draft.tool, draft.licences, { yearly: "", typical: true }) } : draft,
    );
  };

  // After the panel saved: tie lines by what they were saved as, and leave out the lines "Add the
  // first N" didn't save (Free is full) so createApps never sends them in a batch of its own.
  const savedDrafts = (receipt: AddReceipt): Draft[] => {
    const waiting = new Set((receipt.notAdded ?? []).map(normalizeTerm));
    return cardDrafts(receipt.objectIds, receipt.idsByInput).filter((draft) => draft.objectId || !waiting.has(normalizeTerm(draft.input)));
  };

  // Next: anything new on the cards saves through the panel (onSaved continues); when every card is
  // already in the map there is nothing to save, so go straight on.
  const next = () => {
    const ds = cardDrafts();
    if (ds.some((draft) => !draft.objectId && setupCreate(draft))) setSubmitSignal((n) => n + 1);
    else void run(() => createApps(ds));
  };

  const openReadyMap = () => {
    // Setup just saved records: refetch the catalogue in the background so every screen (the Ask
    // header counts included) reads the server's copy straight away. Cached rows stay meanwhile.
    if (orgSlug && workspaceSlug) void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    router.push(`${basePath}/views/impact?ready=1`);
  };

  // Screens: 0 paste, 1 matched, 2 AI turned on?, 3 where, 4 owners. The stored setupStep keeps its old
  // numbers (see storedSetupStep), so workspaces that stopped mid-setup before this step existed read the same.
  const skip = async () => {
    // Let a step-2/3 save still in flight land before leaving.
    await Promise.allSettled([aiSave.current, whereSave.current].filter(Boolean));
    if (!setupPreview()) await setup.save({ setupDismissedAt: new Date().toISOString(), setupStep: storedSetupStep(SETUP_SCREENS[step] ?? "paste") });
    if (step === 4) {
      openReadyMap();
      return;
    }
    setStep(0);
  };

  const auth = async () => {
    const token = await getToken();
    if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return token;
  };

  const remember = (object: MinEAObject) => {
    if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
  };

  // Into step 3, or straight past it when every app's location was answered on the add cards.
  const goWhere = (list: Draft[] = apps, fresh: MinEAObject[] = []) => {
    const current = freshCatalog();
    const objects = [...fresh, ...current.objects];
    const relationships = current.relationships;
    const keys = whereStepKeys(list, objects, relationships);
    setWhereKeys(keys);
    setWhereSkipped(keys.length === 0);
    setStep(keys.length === 0 ? 4 : 3);
  };

  const createApps = async (source: Draft[] = drafts) => {
    setDrafts(source);
    const token = await auth();
    const nextIds = { ...serverIds };
    const created: Draft[] = [];
    const stored: Record<string, MinEAObject> = { ...hosts };
    // Anything the add panel didn't already save goes in ONE batch (it used to be a create per row).
    const pending = source.flatMap((draft) => {
      const spec = draft.objectId ? null : setupCreate(draft);
      return spec ? [{ key: draft.key, type: spec.type, name: spec.name, properties: spec.properties }] : [];
    });
    const made = new Map<string, MinEAObject>();
    if (pending.length > 0) {
      const result = await addApi.save(orgSlug!, workspaceSlug!, { creates: pending, updates: [], relationships: [] }, token);
      pending.forEach((item, index) => {
        const object = result.objects.find((entry) => entry.id === result.created_object_ids[index]);
        if (object) made.set(item.key, object);
      });
      for (const object of result.objects) remember(object);
    }
    // Apps the add panel just saved are only in the fresh cache (see freshCatalog), not in catalog.data.
    const savedObjects = freshCatalog().objects;
    for (const draft of source) {
      if (draft.objectId) {
        const known = savedObjects.find((object) => object.id === draft.objectId);
        if (known) stored[draft.key] = known;
        created.push(draft);
        continue;
      }
      const saved = made.get(draft.key);
      if (!saved) {
        created.push(draft);
        continue;
      }
      stored[draft.key] = saved;
      if (saved.type === "model") nextIds[draft.key] = saved.id;
      created.push({ ...draft, objectId: saved.id, input: saved.name });
    }
    setServerIds(nextIds);
    setDrafts(created);
    setHosts(stored);
    const { rows } = aiStepRows(
      created
        .filter((draft) => stored[draft.key])
        .map((draft) => ({ key: draft.key, objectId: stored[draft.key].id, type: stored[draft.key].type, name: stored[draft.key].name, properties: stored[draft.key].properties })),
    );
    setAiRows(rows);
    setAiPicks(Object.fromEntries(rows.map((row) => [row.key, startPick(row)])));
    setAiStep(rows.length > 0 ? "done" : "none");
    if (rows.length > 0) setStep(2);
    else goWhere(created.filter(isApp), Object.values(stored));
  };

  const aiSave = useRef<Promise<void> | null>(null);
  const [stepSaving, setStepSaving] = useState("");
  const saveAi = async () => {
    const token = await auth();
    const person = user?.displayName || user?.email || "Someone";
    const choices = aiRows.flatMap((row) => {
      const host = (row.objectId && catalog.data?.objects.find((object) => object.id === row.objectId)) || hosts[row.key];
      const pick = aiPicks[row.key];
      if (!host || !pick) return [];
      return [{
        host,
        audience: pick.audience,
        features: row.features.map((feature) => ({
          entry: feature.entry,
          ticked: Boolean(pick.ticked[feature.entry.key]),
          seats: pick.seats[feature.entry.key] ? Number(pick.seats[feature.entry.key]) : null,
        })),
      }];
    });
    const updates = aiStepPatch(choices, person).map((change) => ({ id: change.objectId, properties: change.properties, overwrite: true as const }));
    if (updates.length === 0) {
      goWhere();
      return;
    }
    // One batch for every app's AI answers; step 3 opens now and its save waits for this one.
    setStepSaving(`Saving AI answers for ${updates.length === 1 ? "1 app" : `${updates.length} apps`}…`);
    const save = (async () => {
      try {
        const result = await addApi.save(orgSlug!, workspaceSlug!, { creates: [], updates, relationships: [] }, token);
        for (const saved of result.objects) remember(saved);
        setHosts((current) => {
          const next = { ...current };
          for (const saved of result.objects) {
            const key = Object.keys(next).find((name) => next[name].id === saved.id);
            if (key) next[key] = saved;
          }
          return next;
        });
      } catch (err) {
        setStep(2);
        setError(err instanceof Error ? err.message : "Could not save");
        throw err;
      } finally {
        setStepSaving("");
        aiSave.current = null;
      }
    })();
    aiSave.current = save;
    save.catch(() => undefined);
    goWhere();
  };

  // Step 3 saves as ONE batch (servers, locations, links and hosting in one transaction), then one
  // catalogue refetch. Step 4 opens straight away; its save waits for this one to land.
  const whereSave = useRef<Promise<void> | null>(null);
  const [whereSaving, setWhereSaving] = useState<string>("");
  const linkServers = async () => {
    if (aiSave.current) await aiSave.current;
    const token = await auth();
    // Reuse the org's servers by name (case-insensitive): never create a duplicate.
    const catalogServers = whereStepSeed(catalog.data?.objects ?? [], []).serverIds;
    const existing = { ...catalogServers, ...serverIds };
    const currentHosting = Object.fromEntries((catalog.data?.objects ?? []).map((object) => [object.id, (object.properties as Record<string, unknown> | undefined)?.hosting_model]));
    const tenantLinked = new Set((catalog.data?.relationships ?? []).filter((rel) => rel.type === "runs_on" && rel.to_type === "cloud_service").map((rel) => rel.from_object_id));
    const batch = whereBatch(planned.servers, planned.links, whereApps, existing, currentHosting, {
      tenants: tenantList,
      tenantLinked,
      vendorOf: (app) => whereApps.find((item) => item.key === app.key)?.tool?.vendor ?? "",
    });
    const writes = batch.creates.length + batch.updates.length + batch.relationships.length;
    if (writes === 0) {
      setServerIds(existing);
      setStep(4);
      return;
    }
    setWhereSaving(`Saving where ${whereApps.length === 1 ? "1 app lives" : `${whereApps.length} apps live`}…`);
    const save = (async () => {
      try {
        const result = await addApi.save(orgSlug!, workspaceSlug!, batch, token);
        for (const object of result.objects) remember(object);
        if (orgSlug && workspaceSlug) {
          for (const relationship of result.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
        }
        setServerIds(serverIdsAfter(batch, existing, result.created_object_ids));
        // Reconcile with the server once so every screen (and the setup card) sees the new links.
        if (orgSlug && workspaceSlug) void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
      } catch (err) {
        setStep(3);
        setError(err instanceof Error ? err.message : "Could not save");
        throw err;
      } finally {
        setWhereSaving("");
        whereSave.current = null;
      }
    })();
    whereSave.current = save;
    save.catch(() => undefined);
    setStep(4);
  };

  const finish = async () => {
    if (aiSave.current) await aiSave.current;
    if (whereSave.current) await whereSave.current;
    const token = await auth();
    const updates: { id: string; overwrite: true; owner?: string; owner_team_name?: string; point_of_contact_name?: string; properties?: Record<string, unknown> }[] = [];
    for (const app of apps) {
      if (!app.objectId) continue;
      const yearly = Number(app.yearly);
      const properties: Record<string, unknown> = {};
      if (app.renewal) properties.contract_renewal = app.renewal;
      const seats = licenceCount(app.licences);
      if (seats) properties.licence_count = seats;
      const perSeat = app.tool?.typicalPerSeatMonthly;
      if (app.typical && seats && perSeat && perSeat > 0) {
        // Licences × the catalogue's per-licence list price, saved as a "typical" per-user line.
        const current = catalog.data?.objects.find((object) => object.id === app.objectId) ?? hosts[app.key];
        properties.cost_lines = replaceTypicalLine(current?.properties, perSeatLine(seats, perSeat, app.tool?.vendor ?? ""));
      }
      if (!app.typical && Number.isFinite(yearly) && yearly > 0) {
        const current = catalog.data?.objects.find((object) => object.id === app.objectId) ?? hosts[app.key];
        properties.cost_lines = replaceTypicalLine(current?.properties, typicalLine(yearly, app.tool?.vendor ?? ""));
      }
      // One spelling per team/person: "sales " on one row reuses "Sales" from another (or the workspace).
      const ownerTeam = canonicalOwner(app.ownerTeam, ownerPickLists.teams);
      const ownerName = canonicalOwner(app.ownerName, ownerPickLists.people);
      const update = {
        id: app.objectId,
        overwrite: true as const,
        ...(ownerTeam ? { owner: ownerTeam, owner_team_name: ownerTeam } : {}),
        ...(ownerName ? { point_of_contact_name: ownerName } : {}),
        ...(Object.keys(properties).length ? { properties } : {}),
      };
      if (Object.keys(update).length > 2) updates.push(update);
    }
    // One batch, one transaction: rows are applied in order, so "sales " on row 3 still reuses the
    // "Sales" team row 1 created (same dedupe as the old PUT per row).
    if (updates.length > 0) {
      setStepSaving(`Saving owners and renewals for ${updates.length === 1 ? "1 app" : `${updates.length} apps`}…`);
      try {
        const result = await addApi.save(orgSlug!, workspaceSlug!, { creates: [], updates, relationships: [] }, token);
        for (const saved of result.objects) remember(saved);
      } finally {
        setStepSaving("");
      }
    }
    openReadyMap();
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const appCount = drafts.filter(isApp).length;
  const platformCount = drafts.filter((item) => item.tool?.kind === "platform").length;

  return (
    <section ref={rootRef} className={inline ? "rounded-2xl border border-[#e6e8ee] bg-white p-4" : "mt-8 w-full"}>
      {step === 0 && !inline && (
        <div>
          <p className="text-center">
            <span className="inline-flex rounded-full bg-[#f4f3ff] px-3 py-1 text-[12px] text-[#5b4ce6]">Welcome to BuboMap, {firstName}</span>
          </p>
          <h1 className="mt-6 text-center text-[36px] font-semibold tracking-tight text-[#1c2230]">What runs your business?</h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-[14px] leading-6 text-[#6b7289]">
            List the software and systems {orgName} uses. We&apos;ll fill in vendors, categories and typical costs, then show you what breaks if a key system or vendor goes down.
          </p>
        </div>
      )}
      {step === 0 && inline && (
        <>
          <h2 className="text-[22px] font-semibold text-[#1c2230]">What runs your business?</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">Type apps and servers. The cards fill in as you type.</p>
        </>
      )}

      {/* "What you use": the same box, chips and live cards as Model > Applications > Add (AppAddPanel),
          so results show while typing. Next (or the panel's own Add button) saves through the panel,
          then the later steps open prefilled from what was saved. */}
      {(step === 0 || step === 1) && (
        <div data-testid="setup-what" className={step === 0 && !inline ? "mt-6" : "mt-3"}>
          <Stepper step={1} compact={inline} />
          <AppAddPanel
            origin="setup"
            boxId="setup-add-box"
            initialText={prefill}
            pulse={prefillPulse}
            submitSignal={submitSignal}
            onTextChange={(next) => {
              setText(next);
              if (next.trim() && step === 0) setStep(1);
            }}
            onPendingApps={setPanelPending}
            onSaved={(receipt) => void run(() => createApps(savedDrafts(receipt)))}
            onClose={() => setPrefill("")}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <SetupProgress apps={catalogState.apps + panelPending} located={catalogState.located + newlyLocated} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={loadSample} className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#5b4ce6]">Load sample company</button>
              <button type="button" onClick={() => void run(skip)} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Skip for now</button>
              <button type="button" disabled={busy || !text.trim()} onClick={next} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
                {busy ? "Saving…" : "Next →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <Stepper step={2} compact={inline} />
          <h2 className="text-[18px] font-semibold text-[#1c2230]">Which of these have AI turned on?</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">Tick what&apos;s on today. We pre-ticked what&apos;s on by default in each plan.</p>
          <ul className="mt-3 space-y-3">
            {aiRows.map((row) => {
              const pick = aiPicks[row.key] ?? startPick(row);
              const setPick = (change: Partial<AiPick>) => setAiPicks((current) => ({ ...current, [row.key]: { ...pick, ...change } }));
              return (
                <li key={row.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-[#1c2230]">{row.name}</span>
                    <label className="flex items-center gap-1 text-[12px] text-[#6b7289]">
                      Who can use it
                      <select
                        aria-label={`Who can use AI in ${row.name}`}
                        value={pick.audience}
                        onChange={(event) => setPick({ audience: event.target.value as AiFeatureAudience })}
                        className="h-7 rounded-md border border-[#e6e8ee] bg-white px-1 text-[12px] text-[#1c2230]"
                      >
                        <option value="everyone">Everyone</option>
                        <option value="some_groups">Some groups</option>
                        <option value="admins">Admins only</option>
                      </select>
                    </label>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {row.features.map((feature) => {
                      const key = feature.entry.key;
                      const ticked = Boolean(pick.ticked[key]);
                      return (
                        <li key={key} className="flex flex-wrap items-center gap-2 text-[13px]">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={ticked} onChange={(event) => setPick({ ticked: { ...pick.ticked, [key]: event.target.checked } })} />
                            <span className="text-[#1c2230]">{feature.entry.name}</span>
                          </label>
                          {feature.entry.default_on && <span className="rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] text-[#047857]">On by default in your plan</span>}
                          {feature.paidLabel && <span className="text-[12px] text-[#8b90a0]">{feature.paidLabel}</span>}
                          {ticked && feature.paidLabel && (
                            <label className="flex items-center gap-1 text-[12px] text-[#6b7289]">
                              Seats
                              <input
                                aria-label={`Seats for ${feature.entry.name}`}
                                inputMode="numeric"
                                value={pick.seats[key] ?? ""}
                                onChange={(event) => setPick({ seats: { ...pick.seats, [key]: event.target.value.replace(/[^0-9]/g, "") } })}
                                placeholder="optional"
                                className="h-7 w-20 rounded-md border border-[#e6e8ee] px-1 text-right"
                              />
                            </label>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
          {aiOthers(drafts, aiRows).length > 0 && (
            <p className="mt-3 text-[13px] text-[#6b7289]">
              {aiOthers(drafts, aiRows).length} other{aiOthers(drafts, aiRows).length === 1 ? "" : "s"}: no known AI features ({aiOthers(drafts, aiRows).join(", ")})
            </p>
          )}
          <p className="mt-1 text-[13px] text-[#6b7289]">
            Built your own AI agents or bots? Add them in <Link href={modelPath(basePath, "agents")} className="font-medium text-[#5b4ce6]">Model › AI agents</Link>.
          </p>
          <p className="mt-3 text-[12px] text-[#8b90a0]">Ticked = On · Unticked = Off · Skip = all stay Unreviewed (you&apos;ll see them in Reports › AI landscape)</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(saveAi)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Next: where each one lives →"}
            </button>
            <button type="button" disabled={busy} onClick={() => goWhere()} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Skip for now</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Stepper step={3} aiStep={aiStep} compact={inline} />
          <h2 className="text-[18px] font-semibold text-[#1c2230]">Where does each one live?</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">{meter}. Aim for {SETUP_MIN.apps} apps, and say where at least {SETUP_MIN.located} runs.</p>
          <p className="mt-1 text-[12px] text-[#8b90a0]" data-testid="where-filter-note">
            {whereApps.length === apps.length ? "" : `Only the ${whereApps.length === 1 ? "app" : `${whereApps.length} apps`} you didn't place on the cards. The other ${apps.length - whereApps.length} ${apps.length - whereApps.length === 1 ? "is" : "are"} done.`}
          </p>
          <ul className="mt-3 space-y-3">
            {whereApps.map((app) => (
              <li key={app.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2">
                <div className="text-[13px] font-medium text-[#1c2230]">{displayName(app)}</div>
                <div className="mt-2">
                  <LocationChips
                    value={wizardChoice(app.choice)}
                    serverName={app.choice === "own" ? app.serverName || undefined : undefined}
                    servers={serverOptions}
                    onChoose={(choice) => patch(app.key, {
                      choice,
                      serverName: choice === "own" ? app.serverName : "",
                      ...(choice === "own_cloud" && !CLOUD_PROVIDERS.some((p) => p.id === app.detail?.provider) ? { detail: { ...EMPTY_DETAIL, provider: "azure" as const } } : {}),
                    })}
                    onPickServer={(name) => patch(app.key, { choice: "own", serverName: name })}
                    detail={app.detail ?? EMPTY_DETAIL}
                    tenants={tenantList}
                    pendingTenants={pendingTenants}
                    custom={customRegions}
                    onAddRegion={addRegion}
                    vendor={app.tool?.vendor || undefined}
                    suggest={suggestsOwnCloud(app) ? "own_cloud" : undefined}
                    onDetail={(detail) => patch(app.key, { detail })}
                  />
                </div>
              </li>
            ))}
          </ul>
          {planned.servers.length > 0 && (
            <div className="mt-3 space-y-2">
              {planned.servers.filter((server) => !catalogServerKeys.has(server.key)).map((server) => (
                <label key={server.key} className="block text-[13px] text-[#4b5163]">
                  Where is {server.name}?
                  <input
                    value={whereByServer[server.key] ?? ""}
                    onChange={(event) => setWhereByServer((current) => ({ ...current, [server.key]: event.target.value }))}
                    placeholder="Main plant"
                    className="mt-1 h-8 w-full rounded-lg border border-[#e6e8ee] px-2"
                  />
                </label>
              ))}
            </div>
          )}
          {stepSaving && <p role="status" data-testid="ai-saving" className="mb-2 text-[12px] text-[#6b7289]">{stepSaving}</p>}
          <StepButtons busy={busy} onNext={() => void run(linkServers)} onSkip={() => void run(skip)} nextLabel="Next: owners & renewals →" />
        </>
      )}

      {step === 4 && (
        <>
          <Stepper step={4} aiStep={aiStep} whereSkipped={whereSkipped} compact={inline} />
          <h2 className="text-[18px] font-semibold text-[#1c2230]">Owners and renewals</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">All optional. Empty cells are the ones still open.</p>
          <OwnerDatalists teams={ownerPickLists.teams} people={ownerPickLists.people} />
          {/* One block per app with labelled fields that wrap (2 columns narrow, 3 in the card, 5 on the
              full page), so nothing is cut off or hidden behind a sideways scroll. */}
          <ul data-testid="owners-list" className="mt-3 space-y-2">
            {apps.map((app) => {
              const name = displayName(app);
              return (
                <li key={app.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2">
                  <p className="text-[13px] font-medium text-[#1c2230]">{name}</p>
                  <div data-testid="owners-fields" className={`mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 ${inline ? "sm:grid-cols-3" : "sm:grid-cols-5"}`}>
                    <Field label="Owner team" aria={`Owner team for ${name}`} value={app.ownerTeam} list={TEAM_PICKS_ID} onChange={(ownerTeam) => patch(app.key, { ownerTeam })} />
                    <Field label="Named owner" aria={`Named owner for ${name}`} value={app.ownerName} list={PERSON_PICKS_ID} onChange={(ownerName) => patch(app.key, { ownerName })} />
                    <Field label="Renewal" aria={`Renewal for ${name}`} value={app.renewal} type="date" onChange={(renewal) => patch(app.key, { renewal })} />
                    <Field
                      label="Licences"
                      aria={`Licences for ${name}`}
                      value={app.licences}
                      inputMode="numeric"
                      placeholder="—"
                      optional
                      onChange={(licences) => patch(app.key, { licences, ...yearlyFor(app.tool, licences, app) })}
                    />
                    <Field
                      label="Yearly cost"
                      note={app.typical && app.yearly ? "typical" : undefined}
                      aria={`Yearly cost for ${name}`}
                      value={app.yearly}
                      onChange={(yearly) => patch(app.key, { yearly, typical: false })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {(whereSaving || stepSaving) && <p role="status" data-testid="where-saving" className="mb-2 text-[12px] text-[#6b7289]">{whereSaving || stepSaving}</p>}
          <StepButtons busy={busy} onNext={() => void run(finish)} onSkip={() => void run(skip)} nextLabel="Show my map →" />
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-[#b42318]">{error}</p>}
    </section>
  );
}

export type AiStepState = "done" | "none" | "todo";

/**
 * The catalogue as the query cache has it right now, falling back to the copy from the last render.
 * Use this in anything that runs straight after a save: the render-time copy is still pre-save.
 */
export function latestCatalog(
  queryClient: { getQueryData: <T>(key: readonly unknown[]) => T | undefined },
  key: readonly unknown[] | null,
  rendered: { objects?: MinEAObject[]; relationships?: Relationship[] } | undefined,
): { objects: MinEAObject[]; relationships: Relationship[] } {
  const cached = key ? queryClient.getQueryData<{ objects?: MinEAObject[]; relationships?: Relationship[] }>(key) : undefined;
  return {
    objects: cached?.objects ?? rendered?.objects ?? [],
    relationships: cached?.relationships ?? rendered?.relationships ?? [],
  };
}

type AiPick = { audience: AiFeatureAudience; ticked: Record<string, boolean>; seats: Record<string, string> };

function startPick(row: AiStepRow): AiPick {
  return {
    audience: row.audience,
    ticked: Object.fromEntries(row.features.map((feature) => [feature.entry.key, feature.ticked])),
    seats: {},
  };
}

/** Names on the list with no known AI features (servers included), for the one-line "others" note. */
function aiOthers(drafts: Draft[], rows: AiStepRow[]): string[] {
  const shown = new Set(rows.map((row) => row.key));
  return drafts.filter((draft) => !shown.has(draft.key)).map((draft) => displayName(draft));
}




const STEPS: { label: string; optional?: boolean }[] = [
  { label: "What you use" },
  { label: "AI turned on?", optional: true },
  { label: "Where each one lives" },
  { label: "Owners & renewals", optional: true },
];

/**
 * Step bar: a ~20px circle per step (current = filled violet with a white number, upcoming = grey
 * outline, done = tinted with a check) joined by short lines, labels beside the circles. Stays on
 * one row and scrolls sideways when narrow; `compact` (the wizard inside a card) keeps 12px text so
 * all four steps fit. The circles are decorative; screen readers hear
 * "Step 2 of 4, done: AI turned on? (optional)".
 */
export function Stepper({
  step,
  whereSkipped = false,
  aiStep = "done",
  compact = false,
}: {
  step: number;
  whereSkipped?: boolean;
  /** Step 2 once the bar is past it: done, nothing to ask (shown done), or never answered (shown upcoming). */
  aiStep?: AiStepState;
  compact?: boolean;
}) {
  return (
    <ol data-testid="setup-stepper" aria-label="Setup steps" className={`-mx-1 mb-4 flex items-center gap-x-1 overflow-x-auto whitespace-nowrap px-1 pb-1 text-[12px] ${compact ? "" : "sm:text-[13px]"} [scrollbar-width:none]`}>
      {STEPS.map(({ label, optional }, index) => {
        const n = index + 1;
        const current = step === n;
        const done = step > n && !(n === 2 && aiStep === "todo");
        const nothingToAsk = n === 2 && done && aiStep === "none";
        const state = done ? "done" : current ? "current" : "upcoming";
        return (
          <li
            key={label}
            data-state={state}
            aria-current={current ? "step" : undefined}
            title={nothingToAsk ? "Nothing to ask: none of your apps have known AI features" : undefined}
            className="flex shrink-0 items-center gap-1.5"
          >
            {index > 0 && <span aria-hidden className={"h-px w-3 " + (step >= n ? "bg-[#b9b1f5]" : "bg-[#dfe1e8]")} />}
            <span
              aria-hidden
              data-testid="step-circle"
              className={
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none " +
                (current ? "bg-[#5b4ce6] text-white" : done ? "bg-[#e9e7fd] text-[#5b4ce6]" : "border border-[#c5c8d4] bg-white text-[#8b90a0]")
              }
            >
              {done ? "✓" : n}
            </span>
            <span className={current ? "font-semibold text-[#1c2230]" : done ? "text-[#3c4254]" : "text-[#6b7289]"}>
              <span className="sr-only">{`Step ${n} of ${STEPS.length}${nothingToAsk ? ", nothing to ask" : done ? ", done" : current ? ", current" : step > n ? ", not answered yet" : ""}: `}</span>
              {label}
              {optional && <span className="font-normal text-[#9aa0b0]"> (optional)</span>}
            </span>
            {n === 3 && whereSkipped && done && <span className="text-[#8b90a0]" data-testid="where-skipped">(answered on the cards)</span>}
          </li>
        );
      })}
    </ol>
  );
}


/** A labelled owners-step input. Empty = still open (orange), except optional ones like Licences. */
function Field({
  label,
  aria,
  value,
  onChange,
  type = "text",
  list,
  inputMode,
  placeholder,
  note,
  optional = false,
}: {
  label: string;
  aria: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  list?: string;
  inputMode?: "numeric";
  placeholder?: string;
  note?: string;
  optional?: boolean;
}) {
  const open = !value && !optional;
  return (
    <label className="block min-w-0 text-[11px] text-[#8b90a0]">
      {label}
      {note && <span className="ml-1 text-[#9a3412]">{note}</span>}
      <input
        type={type}
        list={list}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-label={aria}
        autoComplete={list ? "off" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-0.5 block h-8 w-full min-w-0 rounded-lg border px-2 text-[13px] text-[#1c2230] ${open ? "border-[#fdba74] bg-[#fff7ed]" : "border-[#e6e8ee]"}`}
      />
    </label>
  );
}

function StepButtons({ busy, onNext, onSkip, nextLabel }: { busy: boolean; onNext: () => void; onSkip: () => void; nextLabel: string }) {
  return (
    <div className="mt-3 flex gap-2">
      <button type="button" disabled={busy} onClick={onNext} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
        {busy ? "Saving…" : nextLabel}
      </button>
      <button type="button" onClick={onSkip} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Skip for now</button>
    </div>
  );
}

export function SetupCard({ onOpen }: { onOpen: () => void }) {
  const setup = useWorkspaceSetup();
  return (
    <button type="button" onClick={onOpen} className="mt-8 w-full rounded-2xl border border-[#e6e8ee] bg-[#fafafb] px-4 py-3 text-left">
      <span className="text-[14px] font-medium text-[#1c2230]">Finish adding your apps</span>
      <span className="mt-1 block text-[12px] text-[#6b7289]">{setup.gap || `${setup.state.apps} apps so far`}</span>
    </button>
  );
}

/** First-run progress: one segment per required app plus a plain sentence (see setupPill). */
export function SetupProgress({ apps, located }: { apps: number; located: number }) {
  const pill = setupPill(apps, located);
  return (
    <div data-testid="setup-pill" className="flex items-center gap-2.5 rounded-full bg-[#f4f3ff] px-3 py-1.5 text-[12px] text-[#3c4254]">
      <span
        role="progressbar"
        aria-label="Apps added"
        aria-valuemin={0}
        aria-valuemax={pill.segments}
        aria-valuenow={pill.filled}
        className="flex gap-0.5"
      >
        {Array.from({ length: pill.segments }, (_, i) => (
          <span key={i} className={"h-1.5 w-3.5 rounded-full " + (i < pill.filled ? "bg-[#5b4ce6]" : "bg-[#d9d5fb]")} />
        ))}
      </span>
      <span aria-live="polite">{pill.label}</span>
    </div>
  );
}
