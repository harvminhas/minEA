"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
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
import { SETUP_MIN, setupMeter, setupState } from "@/lib/setup/setupMin";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";

type Draft = MatchItem & {
  key: string;
  choice: HostingChoice;
  serverName: string;
  objectId?: string;
  ownerTeam: string;
  ownerName: string;
  renewal: string;
  yearly: string;
  typical: boolean;
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
      objectId: old.objectId,
      ownerTeam: old.ownerTeam,
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
      ownerName: "",
      renewal: "",
      yearly: yearly ? String(yearly) : "",
      typical: yearly != null,
    };
  });
}

/** Dev only (see AskScreen): the preview never writes the workspace's setup state. */
function setupPreview(): boolean {
  return process.env.NODE_ENV !== "production" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "preview";
}

export function SetupFlow({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken, user } = useAuth();
  const orgName = useAppStore((state) => state.activeOrg?.name) || "Your estate";
  const firstName = (user?.displayName || user?.email?.split("@")[0] || "there").trim().split(/\s+/)[0] || "there";
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const [text, setText] = useState("");
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

  const planned = planHosting(
    apps.map((app) => ({ key: app.key, name: app.input, choice: app.choice, serverName: app.serverName })),
    whereByServer,
  );
  const catalogState = setupState(catalog.data?.objects ?? [], catalog.data?.relationships ?? []);
  const unsavedApps = apps.filter((app) => !app.objectId).length;
  const meter = setupMeter(catalogState.apps + unsavedApps, catalogState.hostingLinks + planned.links.length);

  const patch = (key: string, change: Partial<Draft>) => {
    setDrafts((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  };

  useEffect(() => {
    if (step !== 1) return;
    const timer = window.setTimeout(() => {
      setDrafts((current) => mergeDrafts(current, toDrafts(setupMatch(text))));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, step]);

  // Fill the box AND show what it matched, so the click visibly does something even when the box
  // already held the sample. Nothing is saved until the person saves on a later screen.
  const loadSample = () => {
    setText(SAMPLE_COMPANY);
    setDrafts(toDrafts(setupMatch(SAMPLE_COMPANY)));
    setStep(1);
  };

  const openReadyMap = () => {
    router.push(`${basePath}/views?tab=impact&ready=1`);
  };

  // Screens: 0 paste, 1 matched, 2 AI turned on?, 3 where, 4 owners. The stored setupStep keeps its old
  // numbers (see storedSetupStep), so workspaces that stopped mid-setup before this step existed read the same.
  const skip = async () => {
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

  const createApps = async () => {
    const token = await auth();
    const nextIds = { ...serverIds };
    const created: Draft[] = [];
    const stored: Record<string, MinEAObject> = { ...hosts };
    for (const draft of drafts) {
      if (draft.objectId) {
        const known = catalog.data?.objects.find((object) => object.id === draft.objectId);
        if (known) stored[draft.key] = known;
        created.push(draft);
        continue;
      }
      const spec = setupCreate(draft);
      if (!spec) {
        created.push(draft);
        continue;
      }
      const saved = await objectsApi.create(orgSlug!, workspaceSlug!, {
        type: spec.type,
        name: spec.name,
        properties: spec.properties,
      }, token);
      remember(saved);
      stored[draft.key] = saved;
      if (spec.type === "model") nextIds[draft.key] = saved.id;
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
    setStep(rows.length > 0 ? 2 : 3);
  };

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
    for (const change of aiStepPatch(choices, person)) {
      const saved = await objectsApi.update(orgSlug!, workspaceSlug!, change.objectId, { properties: change.properties }, token);
      remember(saved);
      setHosts((current) => {
        const key = Object.keys(current).find((name) => current[name].id === saved.id);
        return key ? { ...current, [key]: saved } : current;
      });
    }
    setStep(3);
  };

  const linkServers = async () => {
    const token = await auth();
    const ids = { ...serverIds };
    for (const server of planned.servers) {
      if (ids[server.key]) continue;
      const saved = await objectsApi.create(orgSlug!, workspaceSlug!, {
        type: "model",
        name: server.name,
        properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" },
      }, token);
      remember(saved);
      ids[server.key] = saved.id;
    }
    const located = new Set<string>();
    for (const server of planned.servers) {
      const serverId = ids[server.key];
      if (!server.where || !serverId || located.has(server.key)) continue;
      const place = await objectsApi.create(orgSlug!, workspaceSlug!, {
        type: "location",
        name: server.where,
        properties: { location_type: "other" },
      }, token);
      remember(place);
      const link = await relationshipsApi.create(orgSlug!, workspaceSlug!, {
        type: "located_at",
        from_object_id: serverId,
        from_type: "model",
        to_object_id: place.id,
        to_type: "location",
      }, token);
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: link });
      located.add(server.key);
    }
    for (const link of planned.links) {
      const app = apps.find((item) => item.key === link.appKey);
      const serverId = ids[link.serverKey];
      if (!app?.objectId || !serverId) continue;
      const created = await relationshipsApi.create(orgSlug!, workspaceSlug!, {
        type: "runs_on",
        from_object_id: app.objectId,
        from_type: "application",
        to_object_id: serverId,
        to_type: "model",
      }, token);
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created });
    }
    for (const app of apps) {
      if (!app.objectId) continue;
      const hosting_model = app.choice === "saas" ? "saas" : app.choice === "own" ? "on_premise" : "";
      if (!hosting_model) continue;
      const saved = await objectsApi.update(orgSlug!, workspaceSlug!, app.objectId, { properties: { hosting_model } }, token);
      remember(saved);
    }
    setServerIds(ids);
    setStep(4);
  };

  const finish = async () => {
    const token = await auth();
    for (const app of apps) {
      if (!app.objectId) continue;
      const yearly = Number(app.yearly);
      const properties: Record<string, unknown> = {};
      if (app.renewal) properties.contract_renewal = app.renewal;
      if (!app.typical && Number.isFinite(yearly) && yearly > 0) {
        const current = catalog.data?.objects.find((object) => object.id === app.objectId) ?? hosts[app.key];
        properties.cost_lines = replaceTypicalLine(current?.properties, typicalLine(yearly, app.tool?.vendor ?? ""));
      }
      const saved = await objectsApi.update(orgSlug!, workspaceSlug!, app.objectId, {
        owner: app.ownerTeam || undefined,
        owner_team_name: app.ownerTeam || undefined,
        point_of_contact_name: app.ownerName || undefined,
        ...(Object.keys(properties).length ? { properties } : {}),
      }, token);
      remember(saved);
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
  const serverCount = drafts.filter((item) => item.tool?.kind === "server").length;
  const checkCount = drafts.filter((item) => item.status === "pick" || item.status === "weak").length;
  const foundLine = [
    `${appCount} apps`,
    platformCount > 0 ? `${platformCount} platform${platformCount === 1 ? "" : "s"}` : "",
    `${serverCount} server${serverCount === 1 ? "" : "s"}`,
    `${checkCount} to check`,
  ].filter(Boolean).join(" · ");

  return (
    <section className={inline ? "rounded-2xl border border-[#e6e8ee] bg-white p-4" : "mt-8 w-full"}>
      {step === 0 && !inline && (
        <div>
          <p className="text-center">
            <span className="inline-flex rounded-full bg-[#f4f3ff] px-3 py-1 text-[12px] text-[#5b4ce6]">Welcome to BuboMap, {firstName}</span>
          </p>
          <h1 className="mt-6 text-center text-[36px] font-semibold tracking-tight text-[#1c2230]">What runs your business?</h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-[14px] leading-6 text-[#6b7289]">
            List the software and systems {orgName} uses. We&apos;ll fill in vendors, categories and typical costs, then show you what depends on what.
          </p>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            placeholder="e.g. Salesforce, QuickBooks, M365, AS400, Order Entry, …  (one per line or separated by commas)"
            className="mt-6 w-full rounded-xl border border-[#e6e8ee] px-3 py-2 text-[14px] outline-none focus:border-[#5b4ce6]"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[13px] text-[#6b7289]">Apps, websites, servers, anything with a login or a bill. Rough names are fine.</p>
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                setDrafts(toDrafts(setupMatch(text)));
                setStep(1);
              }}
              className="shrink-0 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
          <p className="mt-4 text-center text-[13px]">
            <button type="button" onClick={loadSample} className="font-medium text-[#5b4ce6]">Load sample company</button>
            <span className="mx-2 text-[#8b90a0]">·</span>
            <button type="button" onClick={() => void skip()} className="text-[#6b7289]">Skip for now</button>
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["What you use", "Paste or type a list. About 2 minutes."],
              ["Where each one lives", "Cloud, your own server, or not sure."],
              ["Owners & renewals", "Optional. Fill what you know."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-[#e6e8ee] px-3 py-3">
                <p className="text-[14px] font-semibold text-[#1c2230]">{title}</p>
                <p className="mt-1 text-[13px] text-[#6b7289]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[13px] text-[#6b7289]">Then you&apos;ll see what breaks if your most important server goes down.</p>
        </div>
      )}
      {step === 0 && inline && (
        <>
          <h2 className="text-[22px] font-semibold text-[#1c2230]">What runs your business?</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">Paste or type apps and servers. Commas or new lines both work.</p>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            placeholder="Salesforce, QuickBooks, the server in the back room"
            className="mt-3 w-full rounded-xl border border-[#e6e8ee] px-3 py-2 text-[14px] outline-none focus:border-[#5b4ce6]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                setDrafts(toDrafts(setupMatch(text)));
                setStep(1);
              }}
              className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Continue
            </button>
            <button type="button" onClick={loadSample} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
              Load sample company
            </button>
            <button type="button" onClick={() => void skip()} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">
              Skip for now
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <Stepper step={1} />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-[#e6e8ee] px-3 py-2 text-[14px] outline-none focus:border-[#5b4ce6]"
          />
          <div className="mt-4">
            <h2 className="text-[18px] font-semibold text-[#1c2230]">We found {drafts.length} items</h2>
            <p className="mt-1 text-[13px] text-[#6b7289]">
              {foundLine}
            </p>
          </div>
          <div className="mt-3 overflow-hidden">
            <table className="w-full table-fixed text-left text-[13px]">
              <thead className="text-[12px] text-[#8b90a0]">
                <tr>
                  <th className="w-[18%] px-2 py-1 font-medium">You typed</th>
                  <th className="w-[22%] px-2 py-1 font-medium">We think it&apos;s</th>
                  <th className="px-2 py-1 font-medium">Details</th>
                  <th className="w-[14%] px-2 py-1 font-medium">Typical cost</th>
                  <th className="w-[12%] px-2 py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {drafts.map((item) => {
                  const badge = reviewBadge(item);
                  const cost = item.yearly ? `$${Number(item.yearly).toLocaleString("en-US")}` : "—";
                  return (
                    <tr key={item.key} className="border-t border-[#eef0f4] align-top">
                      <td className="px-2 py-2 text-[#4b5163]">“{item.input}”</td>
                      <td className="px-2 py-2 font-medium text-[#1c2230]">{thinkName(item)}</td>
                      <td className="px-2 py-2 text-[#4b5163]">
                        {item.tool?.kind === "server" && <span>Not an app: we&apos;ll ask what runs on it in the next step.</span>}
                        {item.tool?.kind !== "server" && item.status === "matched" && <span>{[item.tool?.category, item.tool?.vendor].filter(Boolean).join(" · ")}</span>}
                        {item.status === "custom" && (
                          <label className="flex items-center gap-2 text-[12px]">
                            <input type="checkbox" checked={item.customBuilt} onChange={(event) => patch(item.key, { customBuilt: event.target.checked })} />
                            We built it ourselves
                          </label>
                        )}
                        {item.status === "pick" && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.options.map((tool) => (
                              <PickChip key={tool.name} tool={tool} onPick={() => patch(item.key, { status: "matched", tool, yearly: tool.typicalAnnual ? String(tool.typicalAnnual) : "", typical: tool.typicalAnnual != null })} />
                            ))}
                            <button type="button" className="rounded-full border border-[#e6e8ee] px-2 py-0.5 text-[12px]" onClick={() => patch(item.key, { status: "custom", tool: null, customBuilt: true, yearly: "", typical: false })}>Other</button>
                          </div>
                        )}
                        {item.status === "weak" && item.tool && (
                          <span>
                            Is it <strong>{item.tool.name}</strong> ({item.tool.name === "BarTender" ? "Seagull Scientific" : item.tool.vendor})?{" "}
                            <button type="button" className="font-medium text-[#3f35b5]" onClick={() => patch(item.key, { status: "matched" })}>Yes</button>
                            {" · "}
                            <button type="button" className="text-[#6b7289]" onClick={() => patch(item.key, { status: "custom", tool: null, customBuilt: true, yearly: "", typical: false })}>No, keep my name</button>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[#4b5163]">{cost}</td>
                      <td className="px-2 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>{badge.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="rounded-full bg-[#f4f3ff] px-3 py-1 text-[12px] text-[#3c4254]">
              ✓ {catalogState.apps + unsavedApps} apps ({SETUP_MIN.apps} needed) · {catalogState.hostingLinks + planned.links.length} of {SETUP_MIN.hostingLinks} app linked to a server · Your map needs both.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void run(skip)} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Skip for now</button>
              <button type="button" disabled={busy} onClick={() => void run(createApps)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
                {busy ? "Saving…" : "Next →"}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Stepper step={2} />
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
            <button type="button" disabled={busy} onClick={() => setStep(3)} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7289]">Skip for now</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Stepper step={3} />
          <h2 className="text-[18px] font-semibold text-[#1c2230]">Where does each one live?</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">{meter}. Aim for {SETUP_MIN.apps} apps and {SETUP_MIN.hostingLinks} link to a server.</p>
          <ul className="mt-3 space-y-3">
            {apps.map((app) => (
              <li key={app.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2">
                <div className="text-[13px] font-medium text-[#1c2230]">{displayName(app)}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(["saas", "own", "unknown"] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => patch(app.key, { choice, serverName: choice === "own" ? app.serverName || serverOptions[0]?.name || "" : "" })}
                      className={`rounded-full border px-2 py-0.5 text-[12px] ${app.choice === choice ? "border-[#5b4ce6] bg-[#ece9ff]" : "border-[#e6e8ee]"}`}
                    >
                      {choice === "saas" ? "SaaS (cloud)" : choice === "own" ? "Our server" : "Don't know"}
                    </button>
                  ))}
                </div>
                {app.choice === "own" && (
                  <input
                    value={app.serverName}
                    onChange={(event) => patch(app.key, { serverName: event.target.value })}
                    list="setup-servers"
                    placeholder="Server name"
                    className="mt-2 h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
                  />
                )}
              </li>
            ))}
          </ul>
          <datalist id="setup-servers">
            {serverOptions.map((server) => <option key={server.key} value={server.name} />)}
          </datalist>
          {planned.servers.length > 0 && (
            <div className="mt-3 space-y-2">
              {planned.servers.map((server) => (
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
          <StepButtons busy={busy} onNext={() => void run(linkServers)} onSkip={() => void run(skip)} nextLabel="Next: owners & renewals →" />
        </>
      )}

      {step === 4 && (
        <>
          <Stepper step={4} />
          <h2 className="text-[18px] font-semibold text-[#1c2230]">Owners and renewals</h2>
          <p className="mt-1 text-[13px] text-[#6b7289]">All optional. Empty cells are the ones still open.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-[#8b90a0]">
                <tr>
                  {["App", "Owner team", "Named owner", "Renewal", "Yearly cost"].map((heading) => <th key={heading} className="px-2 py-1 font-medium">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.key}>
                    <td className="px-2 py-1">{displayName(app)}</td>
                    <Cell value={app.ownerTeam} onChange={(ownerTeam) => patch(app.key, { ownerTeam })} />
                    <Cell value={app.ownerName} onChange={(ownerName) => patch(app.key, { ownerName })} />
                    <Cell value={app.renewal} onChange={(renewal) => patch(app.key, { renewal })} type="date" />
                    <td className="px-2 py-1">
                      <input
                        value={app.yearly}
                        onChange={(event) => patch(app.key, { yearly: event.target.value, typical: false })}
                        className={`h-8 w-24 rounded-lg border px-2 ${app.yearly ? "border-[#e6e8ee]" : "border-[#fdba74] bg-[#fff7ed]"}`}
                      />
                      {app.typical && app.yearly && <span className="ml-1 text-[11px] text-[#9a3412]">typical</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StepButtons busy={busy} onNext={() => void run(finish)} onSkip={() => void run(skip)} nextLabel="Show my map →" />
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-[#b42318]">{error}</p>}
    </section>
  );
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

function thinkName(item: Draft): string {
  if (item.tool?.kind === "server") return item.tool.name === "AS400" ? "IBM i server (AS400)" : item.tool.name;
  if (item.status === "weak" && item.tool) return `${item.tool.name}?`;
  if (item.status === "matched" && item.tool) return item.tool.name;
  return item.input;
}

function reviewBadge(item: Draft): { label: string; className: string } {
  if (item.tool?.kind === "server") return { label: "Server", className: "bg-[#dbeafe] text-[#1d4ed8]" };
  if (item.tool?.kind === "platform") return { label: "Platform", className: "bg-[#ede9fe] text-[#6d28d9]" };
  if (item.status === "matched") return { label: "Matched", className: "bg-[#dcfce7] text-[#166534]" };
  if (item.status === "custom") return { label: "Custom", className: "bg-[#f3f4f6] text-[#4b5563]" };
  if (item.status === "pick") return { label: "Pick one", className: "bg-[#fef3c7] text-[#b45309]" };
  return { label: "Check", className: "bg-[#fef3c7] text-[#b45309]" };
}

function Stepper({ step }: { step: number }) {
  const labels = ["What you use", "AI turned on? (optional)", "Where each one lives", "Owners & renewals (optional)"];
  return (
    <ol className="mb-4 flex flex-wrap items-center gap-x-2 text-[13px]">
      {labels.map((label, index) => {
        const n = index + 1;
        const done = step > n;
        return (
          <li key={label} className={step === n ? "font-semibold text-[#1c2230]" : "text-[#6b7289]"}>
            {index > 0 && <span className="mr-2 text-[#c5c8d4]">—</span>}
            {done ? <span className="text-[#047857]">✓</span> : n} {label}
          </li>
        );
      })}
    </ol>
  );
}

function PickChip({ tool, onPick }: { tool: ToolRecord; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className="rounded-full border border-[#e6e8ee] px-2 py-0.5 text-[12px]">
      {tool.name}
    </button>
  );
}

function Cell({ value, onChange, type = "text" }: { value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <td className="px-2 py-1">
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-8 w-full min-w-[8rem] rounded-lg border px-2 ${value ? "border-[#e6e8ee]" : "border-[#fdba74] bg-[#fff7ed]"}`}
      />
    </td>
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
