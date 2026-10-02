"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { modelItemPath, modelPath, type ModelSection } from "@/lib/mvp-paths";
import { AgingTile, PlatformsTable, ServersTable } from "@/components/mvp/InfraTables";
import { LocationsTable } from "@/components/mvp/LocationsTable";
import { describeTypes } from "@/lib/ask/deterministic";
import { catalogStats, moneyLabel, vendorRollup, type CatalogRow } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { QuickCost } from "@/components/mvp/CostSection";
import { AddChip, Pill } from "@/components/mvp/pills";
import { ModelDetailPanel } from "@/components/mvp/ModelDetailPanel";
import { CreatePlatformPanel } from "@/components/infrastructure/CreatePlatformPanel";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import { ObjectForm } from "@/components/objects/ObjectForm";
import Link from "next/link";

const SECTION_TITLE: Record<ModelSection, string> = {
  overview: "Overview",
  applications: "Applications",
  platforms: "Platforms & cloud",
  servers: "Servers & devices",
  locations: "Locations",
  infrastructure: "Infrastructure",
  connections: "Connections",
  vendors: "Vendors & contracts",
  owners: "Owners & teams",
};

export function ModelScreen({ section, selectedId }: { section: ModelSection; selectedId?: string }) {
  const router = useRouter();
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const rows = catalog.data?.rows ?? [];
  const connections = catalog.data?.connections ?? [];
  const stats = catalogStats(rows);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const [query, setQuery] = useState("");
  const [typeChip, setTypeChip] = useState("All");
  const [lifecycle, setLifecycle] = useState("Any lifecycle");
  const [criticality, setCriticality] = useState("Any criticality");
  const [missingOnly, setMissingOnly] = useState(false);
  const [view, setView] = useState<"table" | "cards">("table");
  const [creating, setCreating] = useState<"runtime" | "platform" | "application" | null>(null);

  const source = rows.filter((row) => {
    if (section === "applications") return row.kind === "application";
    if (section === "infrastructure") return row.kind !== "application";
    return false;
  });

  const types = ["All", ...Array.from(new Set(source.map((row) => row.typeLabel)))];

  const filtered = source.filter((row) => {
    const hay = `${row.name} ${row.vendor} ${row.ownerTeam} ${row.ownerPerson}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (typeChip !== "All" && row.typeLabel !== typeChip) return false;
    if (lifecycle !== "Any lifecycle" && row.lifecycleLabel !== lifecycle) return false;
    if (criticality !== "Any criticality" && row.criticalityLabel !== criticality) return false;
    if (missingOnly && row.missingCount === 0) return false;
    return true;
  });

  const missingTotal = source.reduce((sum, row) => sum + row.missingCount, 0);
  const trackedCost = filtered.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0);

  const open = (row: CatalogRow) => router.push(modelItemPath(basePath, section, row.id));
  const close = () => router.push(modelPath(basePath, section));

  const vendors = useMemo(() => vendorRollup(rows), [rows]);

  useEffect(() => {
    if (section !== "infrastructure") return;
    if (selectedId && catalog.isLoading) return;
    if (!selected) {
      router.replace(modelPath(basePath, "servers"));
      return;
    }
    const next = selected.kind === "platform" ? "platforms" : selected.kind === "application" ? "applications" : "servers";
    router.replace(modelItemPath(basePath, next, selected.id));
  }, [section, selected, selectedId, catalog.isLoading, basePath, router]);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        {section === "overview" && (
          <Overview
            stats={stats}
            rows={rows}
            basePath={basePath}
            pending={catalog.isPending}
            failed={catalog.isError && !catalog.data}
          />
        )}
        {section === "platforms" && <PlatformsTable rows={rows} selectedId={selectedId} />}
        {section === "servers" && <ServersTable rows={rows} selectedId={selectedId} />}
        {section === "locations" && <LocationsTable />}
        {section === "connections" && <ConnectionsList items={connections} basePath={basePath} />}
        {section === "vendors" && <VendorsTable vendors={vendors} />}
        {section === "owners" && <OwnersTable rows={rows} basePath={basePath} />}
        {(section === "applications" || section === "infrastructure") && (
          <div className="px-6 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">
                {section === "infrastructure" ? "WHERE THINGS RUN" : "WHAT THE BUSINESS RUNS"}
              </p>
                <h1 className="text-[22px] font-semibold text-[#1c2230]">
                  {SECTION_TITLE[section]}{" "}
                  <span className="text-[14px] font-normal text-[#8b90a0]">{filtered.length ? describeTypes(filtered.map((row) => row.typeLabel)) : "none"}</span>
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMissingOnly((value) => !value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-[13px] font-medium",
                    missingOnly ? "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]" : "border-[#e6e8ee] text-[#4b5163]"
                  )}
                >
                  Fill missing ({missingTotal})
                </button>
                {section === "infrastructure" ? (
                  <AddMenu onPick={setCreating} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreating("application")}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
                  >
                    <Plus size={14} /> Add
                  </button>
                )}
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, vendor, or owner"
                className="h-9 w-[260px] rounded-lg border border-[#e6e8ee] px-3 text-[13px] outline-none focus:border-[#5b4ce6]"
              />
              <Select value={lifecycle} onChange={setLifecycle} options={["Any lifecycle", "Planned", "Pilot", "Active", "Retiring", "End of life"]} />
              <Select value={criticality} onChange={setCriticality} options={["Any criticality", "Critical", "High", "Medium", "Low"]} />
              <div className="ml-auto flex rounded-lg border border-[#e6e8ee] p-0.5">
                <button type="button" onClick={() => setView("table")} className={cn("rounded-md px-2 py-1", view === "table" && "bg-[#f3f4f8]")} title="Table">
                  <Table2 size={14} />
                </button>
                <button type="button" onClick={() => setView("cards")} className={cn("rounded-md px-2 py-1", view === "cards" && "bg-[#f3f4f8]")} title="Cards">
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {types.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeChip(type)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px]",
                    typeChip === type ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]"
                  )}
                >
                  {type}
                  {type === "All" ? ` ${source.length}` : ` ${source.filter((row) => row.typeLabel === type).length}`}
                </button>
              ))}
            </div>

            {catalog.isLoading && <p className="text-[13px] text-[#8b90a0]">Loading…</p>}
            {!catalog.isLoading && filtered.length === 0 && (
              <p className="rounded-xl border border-dashed border-[#e6e8ee] px-4 py-10 text-center text-[13px] text-[#8b90a0]">
                Nothing matches. Add one, or clear the filters.
              </p>
            )}

            {view === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
                      {["Name", "Type · hosted where", "Owner", "Vendor", "Annual cost", "Renewal", "Lifecycle", "Criticality"].map((heading) => (
                        <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => open(row)}
                        className={cn(
                          "cursor-pointer border-b border-[#f3f4f8] text-[13px] hover:bg-[#fafafb]",
                          selected?.id === row.id && "bg-[#f6f5ff]"
                        )}
                      >
                        <td className="px-2 py-3 font-medium text-[#1c2230]">{row.name}</td>
                        <td className="px-2 py-3">
                          <div className="text-[#1c2230]">{row.typeLabel}</div>
                          {row.subtitle && <div className="text-[12px] text-[#8b90a0]">{row.subtitle}</div>}
                        </td>
                        <td className="px-2 py-3">
                          {row.missing.owner ? (
                            <AddChip label="Add" onClick={() => open(row)} />
                          ) : (
                            <div>
                              <div className="font-medium text-[#1c2230]">{row.ownerTeam || row.ownerPerson}</div>
                              {row.ownerTeam && row.ownerPerson && <div className="text-[12px] text-[#6b7289]">{row.ownerPerson}</div>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {row.vendor ? row.vendor : <AddChip label="Add" onClick={() => open(row)} />}
                        </td>
                        <td className="px-2 py-3">
                          {row.missing.cost ? (
                            <QuickCost row={row} onSaved={() => undefined} />
                          ) : (
                            <span className={row.annualCostNumber == null ? "text-[#6b7289]" : "text-[#1c2230]"}>{row.annualCostLabel}</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {row.missing.renewal ? (
                            <AddChip label="Add" onClick={() => open(row)} />
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {row.renewalLabel}
                              {row.renewalSoon && (
                                <span className="rounded-full bg-[#fff7ed] px-1.5 py-0.5 text-[10px] font-semibold text-[#c2410c]">soon</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {row.lifecycleLabel ? <Pill label={row.lifecycleLabel} tone="lifecycle" /> : <AddChip label="Add" onClick={() => open(row)} />}
                        </td>
                        <td className="px-2 py-3">
                          {row.criticalityLabel ? <Pill label={row.criticalityLabel} tone="criticality" /> : <AddChip label="Add" onClick={() => open(row)} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => open(row)}
                    className="rounded-xl border border-[#e6e8ee] p-4 text-left hover:border-[#c9c6f5]"
                  >
                    <div className="font-semibold text-[#1c2230]">{row.name}</div>
                    <div className="text-[12px] text-[#8b90a0]">{row.typeLabel}</div>
                    <div className="mt-3 space-y-1 text-[13px] text-[#3c4254]">
                      <div>Owner · {row.ownerTeam || row.ownerPerson || "—"}</div>
                      <div>Vendor · {row.vendor || "—"}</div>
                      <div>Annual cost · {row.annualCostLabel}</div>
                      <div>Renewal · {row.renewalLabel || "—"}</div>
                    </div>
                    <div className="mt-3 flex gap-1.5">
                      {row.lifecycleLabel && <Pill label={row.lifecycleLabel} tone="lifecycle" />}
                      {row.criticalityLabel && <Pill label={row.criticalityLabel} tone="criticality" />}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="mt-3 text-[12px] text-[#8b90a0]">
              {filtered.length} of {source.length} shown · amber cells are blank. Click a cell to fill it in.
              {trackedCost > 0 && <> Tracked annual cost: {moneyLabel(trackedCost)}.</>}
            </p>
          </div>
        )}
      </div>

      {selected && <ModelDetailPanel row={selected} onClose={close} />}

      {creating === "runtime" && (
        <CreateRuntimePanel
          onClose={() => setCreating(null)}
          onSuccess={() => setCreating(null)}
        />
      )}
      {creating === "platform" && (
        <CreatePlatformPanel
          onClose={() => setCreating(null)}
          onSuccess={() => setCreating(null)}
        />
      )}
      {creating === "application" && (
        <ObjectForm
          objectType="application"
          onClose={() => setCreating(null)}
          onSuccess={() => setCreating(null)}
        />
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px] text-[#3c4254]"
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

function AddMenu({ onPick }: { onPick: (kind: "runtime" | "platform") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
      >
        <Plus size={14} /> Add
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-[#e6e8ee] bg-white py-1 shadow-lg">
          <button type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f6f7f9]" onClick={() => { setOpen(false); onPick("runtime"); }}>
            Runtime
          </button>
          <button type="button" className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f6f7f9]" onClick={() => { setOpen(false); onPick("platform"); }}>
            Platform
          </button>
        </div>
      )}
    </div>
  );
}

function Overview({
  stats,
  rows,
  basePath,
  pending,
  failed,
}: {
  stats: ReturnType<typeof catalogStats>;
  rows: CatalogRow[];
  basePath: string;
  pending: boolean;
  failed: boolean;
}) {
  const platforms = rows.filter((row) => row.kind === "platform").length;
  const servers = rows.filter((row) => row.kind === "runtime").length;
  const show = !pending && !failed;
  const cards = [
    { href: modelPath(basePath, "applications"), label: "Applications", value: show ? String(stats.systems) : "—" },
    { href: modelPath(basePath, "platforms"), label: "Platforms & cloud", value: show ? String(platforms) : "—" },
    { href: modelPath(basePath, "servers"), label: "Servers & devices", value: show ? String(servers) : "—" },
    { href: `${basePath}/reports/spend`, label: "Annual spend tracked", value: show && stats.spend ? moneyLabel(stats.spend) : "—" },
    { href: modelPath(basePath, "applications"), label: "Missing fields", value: show ? String(stats.missing) : "—" },
  ];
  return (
    <div className="px-8 py-8">
      <h1 className="text-[28px] font-semibold text-[#1c2230]">Model overview</h1>
      <p className="mt-1 text-[14px] text-[#6b7289]">
        {failed
          ? "The model didn't load. Refresh the page to try again."
          : pending
            ? "Loading the model…"
            : `${stats.systems} applications, ${stats.infrastructure} infrastructure${stats.vendorCount ? `, ${stats.vendorCount} vendors` : ""}.`}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-[#e6e8ee] p-4 hover:border-[#c9c6f5]">
            <div className="text-[12px] text-[#8b90a0]">{card.label}</div>
            <div className="mt-1 text-[22px] font-semibold text-[#1c2230]">{card.value}</div>
          </Link>
        ))}
      </div>
      {show && <AgingTile rows={rows} basePath={basePath} />}
      {show && (
        <div className="mt-4 rounded-xl border border-[#e6e8ee] p-4">
          <div className="text-[14px] font-medium text-[#1c2230]">Model health: {stats.completeness}% complete, {stats.missing} fields missing</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
            <div className="h-full rounded-full bg-[#5b4ce6]" style={{ width: `${stats.completeness}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionsList({ items, basePath }: { items: { id: string; name: string; type: string }[]; basePath: string }) {
  const hrefFor = (type: string) => {
    if (type === "api") return `${basePath}/integration/apis`;
    if (type === "event") return `${basePath}/integration/events`;
    if (type === "tool") return `${basePath}/integration/tools`;
    return `${basePath}/integration/flows`;
  };
  return (
    <div className="px-6 py-5">
      <h1 className="text-[22px] font-semibold text-[#1c2230]">Connections <span className="text-[14px] font-normal text-[#8b90a0]">{items.length}</span></h1>
      <p className="mb-4 mt-1 text-[13px] text-[#6b7289]">Flows, APIs, events, and integration infrastructure. Open a list to edit diagrams and links.</p>
      <div className="divide-y divide-[#f0f1f5] rounded-xl border border-[#e6e8ee]">
        {items.length === 0 && <p className="px-4 py-8 text-[13px] text-[#8b90a0]">No connections yet.</p>}
        {items.map((item) => (
          <Link key={item.id} href={hrefFor(item.type)} className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-[#fafafb]">
            <span className="font-medium text-[#1c2230]">{item.name}</span>
            <span className="text-[#8b90a0]">{item.type.replace(/_/g, " ")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function VendorsTable({
  vendors,
}: {
  vendors: ReturnType<typeof vendorRollup>;
}) {
  const total = vendors.reduce((sum, vendor) => sum + vendor.annual, 0);
  return (
    <div className="px-6 py-5">
      <h1 className="text-[22px] font-semibold text-[#1c2230]">Vendors & contracts</h1>
      <p className="mb-4 mt-1 text-[13px] text-[#6b7289]">
        Derived from the vendor field on applications and infrastructure. {vendors.length} vendors
        {total > 0 ? ` · ${moneyLabel(total)} tracked` : ""}.
      </p>
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
            {["Vendor", "Annual cost", "Renewal", "Owner", "Items"].map((heading) => (
              <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor.vendor} className="border-b border-[#f3f4f8]">
              <td className="px-2 py-3 font-medium">{vendor.vendor}</td>
              <td className="px-2 py-3">{vendor.annual ? moneyLabel(vendor.annual) : "—"}</td>
              <td className="px-2 py-3">{vendor.renewal?.renewalLabel || "—"}</td>
              <td className="px-2 py-3">{[...vendor.owners].join(", ") || "—"}</td>
              <td className="px-2 py-3">{vendor.items.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {vendors.length === 0 && <p className="py-8 text-[13px] text-[#8b90a0]">No vendors yet. Add a vendor on an application or infrastructure item.</p>}
    </div>
  );
}

function OwnersTable({ rows, basePath }: { rows: CatalogRow[]; basePath: string }) {
  const groups = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const key = row.ownerTeam || row.ownerPerson || "No owner";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#1c2230]">Owners & teams</h1>
        <Link href={`${basePath}/people/teams`} className="text-[13px] font-medium text-[#5b4ce6]">Open people directory</Link>
      </div>
      <div className="divide-y divide-[#f0f1f5] rounded-xl border border-[#e6e8ee]">
        {[...groups.entries()].map(([owner, items]) => (
          <div key={owner} className="flex items-center justify-between px-4 py-3 text-[13px]">
            <span className="font-medium text-[#1c2230]">{owner}</span>
            <span className="text-[#8b90a0]">{describeTypes(items.map((row) => row.typeLabel))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
