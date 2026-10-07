"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ACTS_AS_LABEL, AI_JOBS, type AiFeatureStatus, type MinEAObject } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { modelItemPath, modelPath, reportsPath, type ModelSection } from "@/lib/mvp-paths";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { moneyLabel } from "@/lib/model-catalog";
import { countLabel } from "@/lib/labels";
import { AGENT_AUTONOMY_OPTIONS, AGENT_STATUS_OPTIONS } from "@/lib/fields/registry";
import { agentChain, aiLandscape, flagGroupTitle, type Lane, type LandscapeFlag, type UnreviewedRow } from "@/lib/ai/landscape";
import { confirmFeature, featureCostLabel } from "@/lib/ai/features";
import { useFeatureSave } from "@/lib/ai/use-feature-save";

const SECTION: Record<string, ModelSection> = {
  application: "applications",
  solution: "applications",
  technical_capability: "applications",
  cloud_service: "platforms",
  agent: "agents",
  ai_model: "ai-models",
};

const YES_NO: Record<string, string> = { yes: "Yes", no: "No", unknown: "Not sure" };
const AUDIENCE: Record<string, string> = { everyone: "Everyone", some_groups: "Some groups", admins: "Admins only" };
const STATUS: Record<string, string> = { on: "On", piloting: "Piloting", off: "Off" };
const LANE: Record<Exclude<Lane, null>, { label: string; tone: string }> = {
  stop: { label: "If it fails, the agent stops", tone: "bg-[#fef2f2] text-[#b42318]" },
  slow: { label: "If it fails, the agent is degraded", tone: "bg-[#fff7ed] text-[#b45309]" },
  risk: { label: "The agent can change it", tone: "bg-[#f5f3ff] text-[#5b4ce6]" },
};

const label = (options: readonly { value: string; label: string }[], value: string) => options.find((item) => item.value === value)?.label ?? "—";
const jobLabel = (job: string) => AI_JOBS.find((item) => item.value === job)?.label ?? "";

function SeverityPill({ severity }: { severity: "high" | "check" }) {
  return severity === "high" ? (
    <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[11px] font-semibold text-[#b42318]">High</span>
  ) : (
    <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">Check</span>
  );
}

function yesNoTone(value: string) {
  return value === "yes" ? "text-[#b42318]" : value === "no" ? "text-[#15803d]" : "text-[#b45309]";
}

export function AiLandscapeReport() {
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const objects = catalog.data?.objects;
  const relationships = catalog.data?.relationships;
  const result = useMemo(() => aiLandscape({ objects: objects ?? [], relationships: relationships ?? [] }), [objects, relationships]);
  const [chainId, setChainId] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(false);
  const byId = useMemo(() => new Map((objects ?? []).map((item) => [item.id, item])), [objects]);

  const link = (id: string) => {
    const object = byId.get(id);
    const section = object ? SECTION[object.type] : undefined;
    return section ? modelItemPath(basePath, section, id) : null;
  };
  const named = (ref: { id: string; name: string }) => {
    const href = link(ref.id);
    return href ? (
      <Link key={ref.id} href={href} className="hover:underline">
        {ref.name}
      </Link>
    ) : (
      <span key={ref.id}>{ref.name}</span>
    );
  };
  const list = (refs: { id: string; name: string }[]) =>
    refs.length ? refs.map((ref, index) => <span key={ref.id}>{index > 0 && ", "}{named(ref)}</span>) : "—";

  const flagsFor = (id: string) => result.flags.filter((flag) => flag.itemIds.includes(id));
  const flagCell = (id: string) => {
    const flags = flagsFor(id);
    if (!flags.length) return <span className="text-[#8b90a0]">—</span>;
    return (
      <span className="flex flex-wrap gap-1">
        {flags.map((flag, index) => (
          <span key={`${flag.id}-${index}`} title={flag.why} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${flag.severity === "high" ? "bg-[#fef2f2] text-[#b42318]" : "bg-[#fff7ed] text-[#b45309]"}`}>
            {flag.id}
          </span>
        ))}
      </span>
    );
  };

  const nameOf = (id: string) => {
    const feature = [...result.features, ...result.offFeatures].find((item) => item.id === id);
    if (feature) return { id: feature.hostId, name: `${feature.feature.name} (${feature.hostName})` };
    return { id, name: byId.get(id)?.name ?? id };
  };

  const loading = catalog.isLoading && !catalog.data;
  const nothing = result.places === 0 && result.offFeatures.length === 0 && result.agents.length === 0;
  const chainAgent = chainId ?? result.chainAgentId;
  const activeAgents = result.agents.filter((agent) => agent.active);
  const chain = chainAgent && objects && relationships ? agentChain(chainAgent, objects, relationships) : [];
  const share = result.spend.total ? Math.round((result.spend.addOns / result.spend.total) * 100) : 0;
  const high = result.highFlags;

  const header = (
    <>
      <div className="mb-4 text-[13px] text-[#6b7289]">
        <Link href={reportsPath(basePath)} className="hover:text-[#1c2230]">← Reports</Link>
      </div>
      <h1 className="text-[22px] font-semibold text-[#1c2230]">AI landscape</h1>
      <p className="mb-4 text-[14px] text-[#6b7289]">Where does AI touch the business, and what can it see or change?</p>
    </>
  );

  if (loading) {
    return (
      <div className="px-8 py-6">
        {header}
        <p className="text-[13px] text-[#8b90a0]">Loading…</p>
      </div>
    );
  }

  if (nothing) {
    return (
      <div className="px-8 py-6">
        {header}
        {result.unreviewed.length > 0 ? (
          <UnreviewedBucket rows={result.unreviewed} objects={byId} first />
        ) : (
          <div className="rounded-xl border border-[#e6e8ee] p-6 text-[14px] text-[#3c4254]">
            <p>No AI recorded yet. Add an agent, or check the apps you own for built-in AI like Copilot.</p>
            <div className="mt-4 flex gap-2">
              <Link href={modelPath(basePath, "agents")} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
                Add an AI agent
              </Link>
              <Link href={modelPath(basePath, "applications")} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3c4254]">
                Check the apps you own for AI
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      {header}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Places AI touches" value={String(result.places)} detail={`${countLabel(result.features.length, "feature", "features")} · ${countLabel(activeAgents.length, "agent", "agents")} · ${result.platforms.filter((item) => item.counted).length} platforms & models`} />
        <Kpi label="Flags" value={String(result.flags.length)} detail={result.flags.length ? `${high} high` : "Nothing to look at"} warn={high > 0} />
        <Kpi label="AI spend" value={result.spend.total ? `${moneyLabel(result.spend.total)} / yr` : "—"} detail={result.spend.addOns ? `${share}% is per-seat add-ons (${moneyLabel(result.spend.addOns)})` : "No paid add-ons"} />
        <Kpi label="Not reviewed" value={String(result.unreviewed.length)} detail={result.unreviewed.length ? "AI we think is in your apps" : "All checked"} warn={result.unreviewed.length > 0} />
      </div>

      <FlagsCard flags={result.flags} nameOf={nameOf} link={link} />

      <h2 className="mt-8 text-[15px] font-semibold text-[#1c2230]">AI features in your tools · {result.features.length}</h2>
      {result.features.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#8b90a0]">No AI features turned on yet.</p>
      ) : (
        <Table headings={["Feature", "In tool", "Status", "Who can use", "Sees company data", "Vendor trains", "Cost / yr", "Flags"]}>
          {[...result.features, ...(showOff ? result.offFeatures : [])].map((item) => {
            const host = byId.get(item.hostId);
            return (
              <tr key={item.id} className={`border-b border-[#f3f4f8] ${item.active ? "" : "text-[#8b90a0]"}`}>
                <td className="px-2 py-3 font-medium">{item.feature.name}</td>
                <td className="px-2 py-3">{named({ id: item.hostId, name: item.hostName })}</td>
                <td className="px-2 py-3">{STATUS[item.feature.status] ?? item.feature.status}</td>
                <td className="px-2 py-3">{AUDIENCE[item.feature.audience ?? ""] ?? "—"}</td>
                <td className={`px-2 py-3 ${yesNoTone(item.feature.sees_company_data)}`}>{YES_NO[item.feature.sees_company_data]}</td>
                <td className={`px-2 py-3 ${yesNoTone(item.feature.vendor_trains)}`}>{YES_NO[item.feature.vendor_trains]}</td>
                <td className="px-2 py-3">{item.addOn ? moneyLabel(item.addOn) : featureCostLabel(item.feature, host?.properties) || "—"}</td>
                <td className="px-2 py-3">{flagCell(item.id)}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {result.offFeatures.length > 0 && (
        <button type="button" onClick={() => setShowOff((value) => !value)} className="mt-2 text-[12px] font-medium text-[#5b4ce6]">
          {showOff ? "Hide" : "Show"} {countLabel(result.offFeatures.length, "feature", "features")} turned off
        </button>
      )}

      <h2 className="mt-8 text-[15px] font-semibold text-[#1c2230]">AI agents · {result.agents.length}</h2>
      {result.agents.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#8b90a0]">
          No agents yet. <Link href={modelPath(basePath, "agents")} className="text-[#5b4ce6]">Add an AI agent</Link>
        </p>
      ) : (
        <Table headings={["Agent", "Built with", "Model", "Reads / writes", "Acts as", "Autonomy", "Owner", "Cost", "Flags"]}>
          {result.agents.map((agent) => (
            <tr key={agent.id} className={`border-b border-[#f3f4f8] ${agent.active ? "" : "text-[#8b90a0]"}`}>
              <td className="px-2 py-3 font-medium">
                {named(agent)}
                <div className="text-[11px] font-normal text-[#8b90a0]">
                  {[label(AGENT_STATUS_OPTIONS, agent.status), jobLabel(agent.job)].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td className="px-2 py-3">{list(agent.builtWith)}</td>
              <td className="px-2 py-3">{list(agent.models)}</td>
              <td className="px-2 py-3">
                <div>Reads: {list(agent.reads)}</div>
                <div>Writes: {list(agent.writes)}</div>
              </td>
              <td className="px-2 py-3">
                {agent.actsAs ? `${agent.actsAs.name || "—"} · ${ACTS_AS_LABEL[agent.actsAs.type as keyof typeof ACTS_AS_LABEL] ?? agent.actsAs.type}` : agent.identityGap ? <span className="text-[#b45309]">Whose account does it use?</span> : "—"}
              </td>
              <td className="px-2 py-3">{label(AGENT_AUTONOMY_OPTIONS, agent.autonomy)}</td>
              <td className="px-2 py-3">{agent.owner || <span className="text-[#b42318]">Nobody</span>}</td>
              <td className="px-2 py-3">{agent.cost ? moneyLabel(agent.cost) : "—"}</td>
              <td className="px-2 py-3">{flagCell(agent.id)}</td>
            </tr>
          ))}
        </Table>
      )}

      {result.platforms.length > 0 && (
        <>
          <h2 className="mt-8 text-[15px] font-semibold text-[#1c2230]">AI platforms & models · {result.platforms.filter((item) => item.counted).length}</h2>
          <Table headings={["Name", "Kind", "Vendor", "Used by", "Trains on your data", "Cost"]}>
            {result.platforms.map((item) => (
              <tr key={item.id} className={`border-b border-[#f3f4f8] ${item.counted ? "" : "text-[#8b90a0]"}`}>
                <td className="px-2 py-3 font-medium">{named(item)}</td>
                <td className="px-2 py-3">{item.kindLabel}</td>
                <td className="px-2 py-3">{item.vendor || "—"}</td>
                <td className="px-2 py-3">{list(item.usedBy)}</td>
                <td className={`px-2 py-3 ${item.vendorTrains ? yesNoTone(item.vendorTrains) : ""}`}>{item.vendorTrains ? YES_NO[item.vendorTrains] : "—"}</td>
                <td className="px-2 py-3">{item.cost ? `${moneyLabel(item.cost)}${item.counted ? "" : " (not AI spend)"}` : "—"}</td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {result.unreviewed.length > 0 && <UnreviewedBucket rows={result.unreviewed} objects={byId} />}

      {activeAgents.length > 0 && chainAgent && (
        <section className="mt-8 rounded-xl border border-[#e6e8ee] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[#1c2230]">What one agent depends on and can change</h2>
            <select
              value={chainAgent}
              onChange={(event) => setChainId(event.target.value)}
              className="rounded-lg border border-[#e6e8ee] px-2 py-1 text-[13px]"
              aria-label="Agent"
            >
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
          {chain.length === 0 ? (
            <p className="mt-2 text-[13px] text-[#8b90a0]">No links yet. Add what it&apos;s built with, its model, and what it reads or writes.</p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-[13px]">
              {chain.map((step, index) => (
                <li key={`${step.verb}-${step.targetId ?? index}`} className="flex items-center gap-2">
                  <span className="w-32 text-[#6b7289]">{step.verb}</span>
                  <span className="font-medium text-[#1c2230]">{step.targetId ? named({ id: step.targetId, name: step.targetName }) : step.targetName}</span>
                  {step.via && <span className="text-[12px] text-[#8b90a0]">via {step.via}</span>}
                  {step.lane ? (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${LANE[step.lane].tone}`}>{LANE[step.lane].label}</span>
                  ) : (
                    <span className="rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[11px] text-[#3c4254]">Its changes show as this account</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-6 text-[12px] text-[#8b90a0]">
        Counts AI features that are on or piloting, agents that are live or piloting, and AI platforms and models. Spend is confirmed per-seat add-ons, AI
        platforms and models, and agents&apos; own costs; features not reviewed yet, data platforms and the tools agents run in aren&apos;t counted. Prices
        come from the vendor and may be out of date.
      </p>
    </div>
  );
}

function FlagsCard({
  flags,
  nameOf,
  link,
}: {
  flags: LandscapeFlag[];
  nameOf: (id: string) => { id: string; name: string };
  link: (id: string) => string | null;
}) {
  if (flags.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[14px] text-[#15803d]">
        No flags. Every agent has an owner, nothing that changes data runs on its own, and no vendor has unknown training terms.
      </div>
    );
  }
  const groups = new Map<string, LandscapeFlag[]>();
  for (const flag of flags) groups.set(`${flag.id}-${flag.severity}`, [...(groups.get(`${flag.id}-${flag.severity}`) ?? []), flag]);
  return (
    <section className="mt-6 rounded-xl border border-[#e6e8ee]">
      <h2 className="border-b border-[#eef0f4] px-4 py-3 text-[15px] font-semibold text-[#1c2230]">Risk flags · {flags.length}</h2>
      {[...groups.values()].map((group) => (
        <div key={`${group[0].id}-${group[0].severity}`} className="border-b border-[#f3f4f8] px-4 py-3 last:border-b-0">
          <div className="flex items-center gap-2">
            <SeverityPill severity={group[0].severity} />
            <span className="text-[14px] font-medium text-[#1c2230]">
              {group[0].severity === "check" && group[0].id !== "F6" ? `Check: ${group[0].title.toLowerCase()}` : flagGroupTitle(group)}
            </span>
            <span className="text-[12px] text-[#8b90a0]">{group.length}</span>
            <span className="ml-auto text-[12px] text-[#5b4ce6]">{group[0].fix}</span>
          </div>
          <ul className="mt-1.5 space-y-1 text-[13px] text-[#3c4254]">
            {group.map((flag, index) => (
              <li key={`${flag.itemIds.join()}-${index}`}>
                {flag.itemIds.map((id, at) => {
                  const ref = nameOf(id);
                  const href = link(ref.id);
                  return (
                    <span key={id}>
                      {at > 0 && ", "}
                      {href ? <Link href={href} className="font-medium hover:underline">{ref.name}</Link> : <span className="font-medium">{ref.name}</span>}
                    </span>
                  );
                })}
                <span className="text-[#6b7289]"> · {flag.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function UnreviewedBucket({ rows, objects, first }: { rows: UnreviewedRow[]; objects: ReadonlyMap<string, MinEAObject>; first?: boolean }) {
  const hosts = new Set(rows.map((row) => row.hostId)).size;
  return (
    <section className="mt-8 rounded-xl border border-[#f3e3c0] bg-[#fff8eb] p-4">
      <h2 className="text-[15px] font-semibold text-[#1c2230]">
        {first ? `We think AI is on in ${hosts} of your apps. Confirm in a click` : `Not reviewed yet · ${rows.length}`}
      </h2>
      <p className="mt-1 text-[12px] text-[#6b7289]">These aren&apos;t counted above until you say whether they&apos;re on.</p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <UnreviewedLine key={`${row.hostId}:${row.entry.key}`} row={row} host={objects.get(row.hostId)} />
        ))}
      </ul>
    </section>
  );
}

function UnreviewedLine({ row, host }: { row: UnreviewedRow; host: MinEAObject | undefined }) {
  const { user } = useAuth();
  const { save, error } = useFeatureSave(row.hostId, host);
  const person = user?.displayName || user?.email || "Someone";
  const pick = (status: AiFeatureStatus) => save((current) => confirmFeature(current, row.entry, status, person));
  return (
    <li className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-medium text-[#1c2230]">{row.entry.name}</span>
      <span className="text-[#6b7289]">in {row.hostName}</span>
      <span className="ml-auto flex gap-1">
        {(["on", "piloting", "off"] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => void pick(status)}
            className="rounded-lg border border-[#e6e8ee] bg-white px-2.5 py-1 text-[12px] font-medium text-[#3c4254] hover:border-[#5b4ce6]"
          >
            {STATUS[status]}
          </button>
        ))}
      </span>
      {error && <span className="w-full text-[12px] text-[#b42318]">{error}</span>}
    </li>
  );
}

function Kpi({ label: title, value, detail, warn }: { label: string; value: string; detail: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-[#f3e3c0] bg-[#fff8eb]" : "border-[#e6e8ee]"}`}>
      <div className="text-[12px] text-[#6b7289]">{title}</div>
      <div className="mt-1 text-[20px] font-semibold text-[#1c2230]">{value}</div>
      <div className="text-[12px] text-[#8b90a0]">{detail}</div>
    </div>
  );
}

function Table({ headings, children }: { headings: string[]; children: React.ReactNode }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
            {headings.map((heading) => (
              <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
