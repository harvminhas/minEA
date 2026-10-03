"use client";

import { useMemo, useState } from "react";
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
  matchEntries,
  normalizeTerm,
  planHosting,
  type HostingChoice,
  type MatchItem,
  type ToolRecord,
} from "@/lib/setup/match-tools";
import { categoryFields } from "@/lib/setup/add-plan";
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
  return item.tool?.kind !== "server";
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

function toDrafts(items: MatchItem[]): Draft[] {
  return items.map((item) => {
    const yearly = item.status === "matched" ? item.tool?.typicalAnnual : null;
    return {
      ...item,
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

  const skip = async () => {
    await setup.save({ setupDismissedAt: new Date().toISOString(), setupStep: step });
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
    for (const draft of drafts) {
      if (draft.objectId) {
        created.push(draft);
        continue;
      }
      const tool = draft.status === "matched" ? draft.tool : null;
      const server = tool?.kind === "server";
      const yearly = Number(draft.yearly);
      const properties: Record<string, unknown> = server
        ? { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" }
        : {
            ...(tool?.vendor ? { vendor: tool.vendor } : {}),
            ...categoryFields(tool?.category),
            ...(draft.customBuilt ? { is_custom_built: true } : {}),
            ...(tool && Number.isFinite(yearly) && yearly > 0 ? { cost_lines: [typicalLine(yearly, tool.vendor)] } : {}),
          };
      const saved = await objectsApi.create(orgSlug!, workspaceSlug!, {
        type: server ? "model" : "application",
        name: tool?.name || draft.input,
        properties,
      }, token);
      remember(saved);
      if (server) nextIds[draft.key] = saved.id;
      created.push({ ...draft, objectId: saved.id, input: saved.name });
    }
    setServerIds(nextIds);
    setDrafts(created);
    setStep(2);
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
    setServerIds(ids);
    setStep(3);
  };

  const finish = async () => {
    const token = await auth();
    for (const app of apps) {
      if (!app.objectId) continue;
      const yearly = Number(app.yearly);
      const properties: Record<string, unknown> = {};
      if (app.renewal) properties.contract_renewal = app.renewal;
      if (!app.typical && Number.isFinite(yearly) && yearly > 0) {
        properties.cost_lines = [typicalLine(yearly, app.tool?.vendor ?? "")];
      }
      const saved = await objectsApi.update(orgSlug!, workspaceSlug!, app.objectId, {
        owner: app.ownerTeam || undefined,
        owner_team_name: app.ownerTeam || undefined,
        point_of_contact_name: app.ownerName || undefined,
        ...(Object.keys(properties).length ? { properties } : {}),
      }, token);
      remember(saved);
    }
    const objects = [
      ...(catalog.data?.objects ?? []).filter((object) => !apps.some((app) => app.objectId === object.id)),
      ...apps.filter((app) => app.objectId).map((app) => ({ type: "application" })),
    ];
    const relationships = [
      ...(catalog.data?.relationships ?? []),
      ...planned.links.map(() => ({ type: "runs_on" })),
    ];
    if (setupState(objects, relationships).met) {
      router.push(`${basePath}/views?tab=impact&ready=1`);
      return;
    }
    setError(setup.gap || "Add a few more apps, then link one to a server.");
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
                setDrafts(toDrafts(matchEntries(text)));
                setStep(1);
              }}
              className="shrink-0 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
          <p className="mt-4 text-center text-[13px]">
            <button type="button" onClick={() => setText(SAMPLE_COMPANY)} className="font-medium text-[#5b4ce6]">Load sample company</button>
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
                setDrafts(toDrafts(matchEntries(text)));
                setStep(1);
              }}
              className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              Continue
            </button>
            <button type="button" onClick={() => setText(SAMPLE_COMPANY)} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
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
          <h2 className="text-[18px] font-semibold text-[#1c2230]">Does this look right?</h2>
          <ul className="mt-3 space-y-3">
            {drafts.map((item) => (
              <li key={item.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-medium text-[#1c2230]">{item.input}</span>
                  {item.status === "matched" && <span className="text-[#6b7289]">{item.tool?.name} · {item.tool?.kind === "server" ? "Server" : item.tool?.vendor}</span>}
                  {item.status === "custom" && <span className="text-[#6b7289]">Custom</span>}
                  {item.status === "weak" && <span className="text-[#6b7289]">Is it {item.tool?.name}?</span>}
                  {item.status === "pick" && <span className="text-[#6b7289]">Pick one</span>}
                  {item.typical && item.yearly && <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[12px] text-[#9a3412]">${Number(item.yearly).toLocaleString("en-US")} typical</span>}
                </div>
                {item.status === "pick" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.options.map((tool) => (
                      <PickChip key={tool.name} tool={tool} onPick={() => patch(item.key, { status: "matched", tool, yearly: tool.typicalAnnual ? String(tool.typicalAnnual) : "", typical: tool.typicalAnnual != null })} />
                    ))}
                  </div>
                )}
                {item.status === "weak" && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded-full border border-[#c9c6f5] px-2 py-0.5 text-[12px]" onClick={() => patch(item.key, { status: "matched" })}>Yes</button>
                    <button type="button" className="rounded-full border border-[#e6e8ee] px-2 py-0.5 text-[12px]" onClick={() => patch(item.key, { status: "custom", tool: null, yearly: "", typical: false })}>No, it's custom</button>
                  </div>
                )}
                {item.status === "custom" && (
                  <label className="mt-2 flex items-center gap-2 text-[12px] text-[#4b5163]">
                    <input type="checkbox" checked={item.customBuilt} onChange={(event) => patch(item.key, { customBuilt: event.target.checked })} />
                    We built it ourselves
                  </label>
                )}
              </li>
            ))}
          </ul>
          <StepButtons busy={busy} onNext={() => void run(createApps)} onSkip={() => void run(skip)} nextLabel="Next" />
        </>
      )}

      {step === 2 && (
        <>
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
          <StepButtons busy={busy} onNext={() => void run(linkServers)} onSkip={() => void run(skip)} nextLabel="Next" />
        </>
      )}

      {step === 3 && (
        <>
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
          <StepButtons busy={busy} onNext={() => void run(finish)} onSkip={() => void run(skip)} nextLabel="See your map" />
        </>
      )}
      {error && <p className="mt-2 text-[13px] text-[#b42318]">{error}</p>}
    </section>
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
