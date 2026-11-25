"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship, SuggestedDomain } from "@minea/types";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { capabilityMapApi, objectsApi } from "@/lib/api-client";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { catalogStats, type CatalogRow } from "@/lib/model-catalog";
import { capabilityOpenPath } from "@/lib/capability-detail";
import { buildCapabilityTree, heatClass } from "@/lib/capability-tree";
import { domainIdentityColor, orderedDomainIdsFromTree } from "@/lib/capability-assessment";
import { CapabilityInterview, type InterviewValues } from "@/components/capability-map/CapabilityInterview";
import { CapabilityReview } from "@/components/capability-map/CapabilityReview";
import { OverviewSetupNotice } from "@/components/mvp/SetupProgressCard";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import {
  domainStripMeta,
  endingCount,
  endingSentence,
  overviewActions,
  overviewCapabilityEmpty,
  overviewCostByDomain,
  overviewGaps,
  overviewRisks,
  unownedSentence,
  type OverviewLens,
  type OverviewRisks,
} from "@/lib/model-overview";

const TILE: Record<string, string> = {
  "c-good": "bg-emerald-50 border-emerald-200",
  "c-ok": "bg-lime-50 border-lime-200",
  "c-fair": "bg-orange-50 border-orange-200",
  "c-gap": "bg-red-50 border-red-200",
  "a-0": "border-dashed border-[#e6e8ee] bg-[#fafafb]",
};

export function ModelOverview({
  pending,
  failed,
  basePath,
}: {
  pending: boolean;
  failed: boolean;
  basePath: string;
}) {
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const objects = catalog.data?.objects ?? [];
  const relationships = catalog.data?.relationships ?? [];
  const rows = catalog.data?.rows ?? [];
  const emptyMap = Boolean(catalog.data) && overviewCapabilityEmpty(objects);
  const showSetup = setup.enabled && Boolean(catalog.data) && !setup.state.met;

  if (failed) {
    return (
      <div className="px-8 py-8">
        <h1 className="text-[28px] font-semibold text-[#1c2230]">Overview</h1>
        <p className="mt-1 text-[14px] text-[#6b7289]">The model didn&apos;t load. Refresh the page to try again.</p>
      </div>
    );
  }
  if (pending || !catalog.data) {
    return (
      <div className="px-8 py-8">
        <h1 className="text-[28px] font-semibold text-[#1c2230]">Overview</h1>
        <p className="mt-1 text-[14px] text-[#6b7289]">Loading the model…</p>
      </div>
    );
  }

  return (
    <div className="px-8 py-8" data-testid="model-overview">
      {emptyMap ? (
        <EmptyOverview basePath={basePath} rows={rows} objects={objects} relationships={relationships} showSetup={showSetup} setup={setup} />
      ) : (
        <PopulatedOverview basePath={basePath} rows={rows} objects={objects} relationships={relationships} showSetup={showSetup} setup={setup} />
      )}
    </div>
  );
}

function PopulatedOverview({
  basePath,
  rows,
  objects,
  relationships,
  showSetup,
  setup,
}: {
  basePath: string;
  rows: CatalogRow[];
  objects: MinEAObject[];
  relationships: Relationship[];
  showSetup: boolean;
  setup: ReturnType<typeof useWorkspaceSetup>;
}) {
  const [lens, setLens] = useState<OverviewLens>("coverage");
  const [gapsOpen, setGapsOpen] = useState(false);
  const tree = useMemo(() => buildCapabilityTree(objects, relationships, rows), [objects, relationships, rows]);
  const estateIds = useMemo(() => orderedDomainIdsFromTree(tree), [tree]);
  const domains = tree.filter((node) => node.id !== "no-domain" && (node.children.length > 0 || node.id !== "no-domain"));
  const cost = useMemo(() => overviewCostByDomain(objects, relationships, rows), [objects, relationships, rows]);
  const gaps = useMemo(
    () => overviewGaps(objects, relationships, (id) => capabilityOpenPath(basePath, id, objects)),
    [objects, relationships, basePath],
  );
  const risks = useMemo(() => overviewRisks(objects, rows), [objects, rows]);
  const actions = useMemo(
    () => overviewActions(gaps, risks, { renewals: `${basePath}/strategy/roadmaps`, applications: `${basePath}/model/applications` }),
    [gaps, risks, basePath],
  );
  const visibleGaps = gapsOpen ? gaps : gaps.slice(0, 3);
  const maxCost = Math.max(0, ...cost.domains.map((domain) => domain.cost));
  const ending = endingCount(risks);
  const hasRisk = risks.shadow > 0 || risks.unownedCaps + risks.unownedApps > 0 || ending > 0;

  return (
    <>
      <h1 className="text-[28px] font-semibold text-[#1c2230]">Overview</h1>
      <p className="mt-1 text-[14px] text-[#6b7289]">How well the estate supports the business.</p>
      {showSetup && (
        <div className="mt-3" data-testid="overview-first-run">
          <OverviewSetupNotice state={setup.state} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">COLOUR BY</div>
          <div className="flex gap-1" role="tablist" aria-label="Colour by">
            {(["coverage", "support"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={lens === item}
                data-testid={`overview-lens-${item}`}
                onClick={() => setLens(item)}
                className={cn(
                  "border-b-2 px-2 pb-1 text-[13px]",
                  lens === item ? "border-[#1c2230] font-semibold text-[#1c2230]" : "border-transparent text-[#5b6170]",
                )}
              >
                {item === "coverage" ? "Coverage" : "Support"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pb-1 text-[12.5px] text-[#3d4354]">
          {lens === "coverage" ? (
            <>
              <Legend swatch="bg-emerald-50 border-emerald-200" label="Covered" />
              <Legend swatch="bg-lime-50 border-lime-200" label="Mostly" />
              <Legend swatch="bg-orange-50 border-orange-200" label="Partial" />
              <Legend swatch="bg-red-50 border-red-200" label="No app" />
            </>
          ) : (
            <>
              <Legend swatch="bg-emerald-50 border-emerald-200" label="Strong" />
              <Legend swatch="bg-orange-50 border-orange-200" label="Adequate" />
              <Legend swatch="bg-red-50 border-red-200" label="Weak" />
              <Legend swatch="border-dashed border-[#e6e8ee] bg-[#fafafb]" label="No score" />
            </>
          )}
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-[#e6e8ee] p-3" data-testid="overview-map-strip">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-[14px] font-medium text-[#1c2230]">Support by area</h2>
          <Link href={`${basePath}/model/capabilities`} className="text-[13px] font-medium text-[#5b4ce6]">
            Open map ↗
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          {domains.map((domain) => {
            const identity = domainIdentityColor(domain.id, estateIds);
            const metric = lens === "support" ? "fitness" : "coverage";
            return (
              <div
                key={domain.id}
                className="grid grid-cols-[200px_1fr] items-center gap-3 rounded-[10px] py-1.5 pl-3 pr-2.5"
                style={{ background: `rgba(${identity.rgb}, 0.045)`, boxShadow: `inset 3px 0 0 rgb(${identity.rgb})` }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[#1c2230]">{domain.name}</div>
                  <div className="text-[11.5px] text-[#8b90a0]">{domainStripMeta(domain, lens)}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {domain.children.map((child) => (
                    <Link
                      key={child.id}
                      href={capabilityOpenPath(basePath, child.id, objects)}
                      title={child.name}
                      className={cn("h-[22px] w-[22px] rounded-[4px] border", TILE[heatClass(child, metric)] ?? TILE["a-0"])}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 grid items-start gap-2.5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <section className="rounded-xl border border-[#e6e8ee] p-3.5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-[14px] font-medium text-[#1c2230]">Top gaps</h2>
              <Link href={`${basePath}/model/capabilities`} className="text-[13px] font-medium text-[#5b4ce6]">
                View all
              </Link>
            </div>
            {gaps.length === 0 ? (
              <p className="text-[13px] text-[#8b90a0]">No gaps flagged.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {visibleGaps.map((gap) => (
                    <li key={gap.id} className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", gap.severity === "error" ? "bg-red-500" : "bg-amber-400")} />
                        <p className="text-[14px] text-[#374151]">{gap.message}</p>
                      </div>
                      {gap.href && (
                        <Link href={gap.href} className="shrink-0 text-[14px] font-medium text-[#4f46e5]">
                          Fix →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                {gaps.length > 3 && (
                  <button
                    type="button"
                    aria-expanded={gapsOpen}
                    data-testid="gaps-show-more"
                    onClick={() => setGapsOpen((open) => !open)}
                    className="mt-2 text-[14px] font-medium text-[#4f46e5]"
                  >
                    {gapsOpen ? "Show less" : `Show ${gaps.length - 3} more`}
                  </button>
                )}
              </>
            )}
          </section>

          {actions.length > 0 && (
            <section className="rounded-xl border border-[#e6e8ee] p-3.5" data-testid="overview-actions">
              <h2 className="mb-2 text-[14px] font-medium text-[#1c2230]">Next best actions</h2>
              <ol className="flex flex-col gap-1.5">
                {actions.map((action, index) => (
                  <li key={action.id} className="flex items-baseline gap-2.5 text-[14px] text-[#1c2230]">
                    <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#ece9ff] text-[11px] font-semibold text-[#3f35b5]">
                      {index + 1}
                    </span>
                    {action.href ? (
                      <Link href={action.href} className="font-medium text-[#4f46e5]">
                        {action.label}
                      </Link>
                    ) : (
                      <span>{action.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <section className="rounded-xl border border-[#e6e8ee] p-3.5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[14px] font-medium text-[#1c2230]">Annual run cost by area</h2>
            <Link href={`${basePath}/reports/spend`} className="text-[13px] font-medium text-[#5b4ce6]">
              View spend
            </Link>
          </div>
          {cost.domains.length === 0 || cost.total <= 0 ? (
            <p className="text-[13px] text-[#8b90a0]">No spend rolled up yet.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {cost.domains.map((domain) => (
                  <div key={domain.id}>
                    <div className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-[#1c2230]">{domain.name}</span>
                      <span className="font-semibold text-[#1c2230]">{domain.costLabel}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
                      <div className="h-full rounded-full bg-[#5b4ce6]" style={{ width: `${maxCost ? Math.round((100 * domain.cost) / maxCost) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between border-t border-[#eef0f4] pt-2 text-[13px] text-[#6b7289]">
                <span>
                  Across {cost.appsWithCost} application{cost.appsWithCost === 1 ? "" : "s"} with cost
                </span>
                <span className="font-semibold text-[#1c2230]">{cost.totalLabel}</span>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="mt-2.5" data-testid="overview-risks">
        {hasRisk ? (
          <RiskRow risks={risks} ending={ending} />
        ) : (
          <p className="rounded-xl border border-[#e6e8ee] px-3.5 py-3 text-[13px] text-[#6b7289]">No risks flagged.</p>
        )}
      </div>
    </>
  );
}

function EmptyOverview({
  basePath,
  rows,
  objects,
  relationships,
  showSetup,
  setup,
}: {
  basePath: string;
  rows: CatalogRow[];
  objects: MinEAObject[];
  relationships: Relationship[];
  showSetup: boolean;
  setup: ReturnType<typeof useWorkspaceSetup>;
}) {
  const stats = catalogStats(rows);
  const risks = overviewRisks(objects, rows);
  const cost = overviewCostByDomain(objects, relationships, rows);
  const ending = endingCount(risks);
  const hasRisk = risks.shadow > 0 || risks.unownedCaps + risks.unownedApps > 0 || ending > 0;
  const hasCost = cost.total > 0;

  return (
    <div className="max-w-[640px]">
      <h1 className="text-[28px] font-semibold text-[#1c2230]">Overview</h1>
      <p className="mt-1 text-[14px] text-[#6b7289]">
        Start with what the business does. We&apos;ll use that to show where systems help — or don&apos;t.
        {stats.systems > 0 ? ` You already have ${stats.systems} application${stats.systems === 1 ? "" : "s"}.` : ""}
      </p>
      {showSetup && (
        <div className="mt-3" data-testid="overview-first-run">
          <OverviewSetupNotice state={setup.state} />
        </div>
      )}
      <div className="mt-4">
        <OverviewMapSetup />
      </div>
      {(hasCost || hasRisk) && (
        <div className="mt-4 space-y-2.5">
          {hasCost && (
            <section className="rounded-xl border border-[#e6e8ee] p-3.5">
              <h2 className="text-[14px] font-medium text-[#1c2230]">Annual run cost</h2>
              <p className="mt-1 text-[22px] font-semibold text-[#1c2230]">{cost.totalLabel}</p>
              <p className="mt-1 text-[12.5px] text-[#6b7289]">
                Across {cost.appsWithCost} application{cost.appsWithCost === 1 ? "" : "s"} with cost. This will split by area once the map is in place.
              </p>
            </section>
          )}
          {hasRisk ? (
            <RiskRow risks={risks} ending={ending} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function OverviewMapSetup() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"interview" | "review" | "add">("interview");
  const [suggestion, setSuggestion] = useState<SuggestedDomain[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [domainName, setDomainName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const token = async () => {
    const value = await getToken();
    if (!value || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return value;
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
  };

  const suggest = async (values: InterviewValues) => {
    setError("");
    setBusy(true);
    try {
      const result = await capabilityMapApi.suggest(
        orgSlug,
        workspaceSlug,
        { about: values.about, website: values.website || null },
        await token(),
      );
      setSuggestion(result.domains);
      setWarning(result.warning ?? null);
      if (!result.domains.length) {
        setError(result.warning || "No suggestion came back. Try a bit more detail, or add a domain yourself.");
        return;
      }
      setMode("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't suggest a map");
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setError("");
    setBusy(true);
    try {
      await capabilityMapApi.accept(orgSlug, workspaceSlug, suggestion, await token());
      refresh();
      setSuggestion([]);
      setMode("interview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the map");
    } finally {
      setBusy(false);
    }
  };

  const addDomain = async () => {
    const name = domainName.trim();
    if (!name) return;
    setError("");
    setBusy(true);
    try {
      const created = await objectsApi.create(orgSlug!, workspaceSlug!, { type: "business_domain", name, properties: {} }, await token());
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: created });
      setDomainName("");
      setAddOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the domain");
    } finally {
      setBusy(false);
    }
  };

  if (!canCreate) {
    return <p className="text-[13px] text-[#6b7289]">No capabilities yet.</p>;
  }

  if (mode === "review") {
    return (
      <CapabilityReview
        domains={suggestion}
        onChange={setSuggestion}
        onAccept={() => void accept()}
        onCancel={() => {
          setSuggestion([]);
          setMode("interview");
          setError("");
        }}
        busy={busy}
        error={error}
        warning={warning}
        existing={false}
      />
    );
  }

  return (
    <div data-testid="overview-map-setup">
      <CapabilityInterview
        busy={busy}
        error={error}
        onSuggest={(values) => void suggest(values)}
        onAddYourself={() => setAddOpen((open) => !open)}
        addYourselfLabel="Add a domain yourself"
      />
      {addOpen && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addDomain();
          }}
        >
          <input
            value={domainName}
            onChange={(event) => setDomainName(event.target.value)}
            placeholder="Area of the business, e.g. Sales"
            className="h-9 flex-1 rounded-lg border border-[#e6e8ee] px-2.5 text-[13px] outline-none focus:border-[#5b4ce6]"
            aria-label="Area of the business"
          />
          <button type="submit" disabled={busy || !domainName.trim()} className="h-9 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50">
            Add
          </button>
        </form>
      )}
    </div>
  );
}

function riskCardCount(risks: OverviewRisks, ending: number): number {
  return (risks.shadow > 0 ? 1 : 0) + (risks.unownedCaps + risks.unownedApps > 0 ? 1 : 0) + (ending > 0 ? 1 : 0);
}

function RiskRow({
  risks,
  ending,
}: {
  risks: OverviewRisks;
  ending: number;
}) {
  const n = riskCardCount(risks, ending);
  return (
    <div
      className={cn(
        "grid gap-2.5",
        n >= 3 ? "sm:grid-cols-3" : n === 2 ? "sm:grid-cols-2" : "max-w-md",
      )}
    >
      {risks.shadow > 0 && (
        <RiskCard label="Outside IT" value={String(risks.shadow)} hint="Applications not formally tracked by IT." />
      )}
      {risks.unownedCaps + risks.unownedApps > 0 && (
        <RiskCard label="No owner" value={String(risks.unownedCaps + risks.unownedApps)} hint={unownedSentence(risks)} />
      )}
      {ending > 0 && <RiskCard label="Coming to an end" value={String(ending)} hint={endingSentence(risks)} />}
    </div>
  );
}

function RiskCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-[#f5d7a8] bg-[#fffaf0] px-3.5 py-2.5">
      <div className="text-[12px] text-[#8b90a0]">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold text-[#1c2230]">{value}</div>
      <div className="mt-0.5 text-[12.5px] leading-snug text-[#5b6170]">{hint}</div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3.5 w-3.5 rounded-[3px] border", swatch)} />
      {label}
    </span>
  );
}
