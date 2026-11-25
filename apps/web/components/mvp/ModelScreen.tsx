"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Plus, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { modelItemId, modelItemPath, modelPath, type ModelSection } from "@/lib/mvp-paths";
import { capabilityDetailPath } from "@/lib/capability-detail";
import { isActivity } from "@/lib/capability-tree";
import { ServersTable } from "@/components/mvp/InfraTables";
import { PlatformsCloudPage } from "@/components/mvp/PlatformsCloudPage";
import { ConnectionsHub } from "@/components/mvp/ConnectionsHub";
import { ApplicationsTabs, ApplicationsAiPanel } from "@/components/mvp/ApplicationsHubChrome";
import { ModelOverview } from "@/components/mvp/ModelOverview";
import { applicationsPath, platformsPath } from "@/lib/model-legacy-paths";
import { describeTypes } from "@/lib/ask/deterministic";
import { VendorsHub } from "@/components/vendors/VendorsHub";
import { moneyLabel, rowForPanel, vendorPanelRow, vendorRollup, type CatalogRow } from "@/lib/model-catalog";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { QuickCostCell } from "@/components/mvp/CostSection";
import { AddChip, Pill } from "@/components/mvp/pills";
import { fieldKeyForGap, openRecordField } from "@/lib/fields/field-focus";
import { AppPlatformHelp } from "@/components/mvp/AppPlatformHelp";
import { ModelDetailPanel } from "@/components/mvp/ModelDetailPanel";
import { OwnersPage } from "@/components/mvp/OwnersPage";
import { CapabilitiesSection } from "@/components/mvp/CapabilitiesSection";
import { CapabilityDetailPage } from "@/components/capability-map/CapabilityDetailPage";
import { CreatePlatformPanel } from "@/components/infrastructure/CreatePlatformPanel";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { RESTORE_PARAM, RESTORE_VALUE } from "@/lib/add-draft";
import { AppAddPanel } from "@/components/add/AppAddPanel";
import { FirstRunAsk } from "@/components/mvp/FirstRunAsk";
import { addAnywhereEnabled } from "@/lib/flags";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { aiColumnLabel } from "@/lib/ai/features";
import { ANY_CAPABILITY, appCapabilityIndex, capabilityFilterOptions, matchesCapabilityFilter } from "@/lib/capabilities";

const SECTION_TITLE: Record<ModelSection, string> = {
  overview: "Overview",
  applications: "Applications",
  agents: "AI agents",
  "ai-models": "AI models",
  platforms: "Platforms & cloud",
  servers: "Servers & devices",
  locations: "Locations",
  capabilities: "Capabilities",
  infrastructure: "Infrastructure",
  connections: "Connections",
  vendors: "Vendors & contracts",
  owners: "People & teams",
};

export function ModelScreen({ section, selectedId }: { section: ModelSection; selectedId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const showPaste = setup.enabled && Boolean(catalog.data) && !setup.state.met && (section === "applications" || section === "servers");
  const [setupLatched, setSetupLatched] = useState(false);
  useEffect(() => {
    if (showPaste) setSetupLatched(true);
  }, [showPaste]);
  const rows = catalog.data?.rows ?? [];
  const vendors = useMemo(() => vendorRollup(rows), [rows]);
  const selectedKey = selectedId ? modelItemId(selectedId) : "";
  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const fromRows = rows.find((row) => row.id === selectedKey);
    if (fromRows) return fromRows;
    const object = catalog.data?.objects.find((item) => item.id === selectedKey);
    const panel = object ? rowForPanel(object) : null;
    if (panel) return panel;
    if (section !== "vendors") return null;
    const bucket = vendors.find((vendor) => vendor.vendor === selectedKey);
    return bucket ? vendorPanelRow(selectedKey, bucket.vendor) : null;
  }, [catalog.data?.objects, rows, section, selectedKey, vendors]);

  const [query, setQuery] = useState("");
  const [typeChip, setTypeChip] = useState("All");
  const [lifecycle, setLifecycle] = useState("Any lifecycle");
  const [criticality, setCriticality] = useState("Any criticality");
  const [missingOnly, setMissingOnly] = useState(false);
  const [capFilter, setCapFilter] = useState(ANY_CAPABILITY);
  const [view, setView] = useState<"table" | "cards">("table");
  const [creating, setCreating] = useState<"runtime" | "platform" | "application" | null>(null);
  const [appAdd, setAppAdd] = useState(false);
  // Back from Plan & billing with a list waiting (?add=restore): open the add box with it.
  useEffect(() => {
    if (section !== "applications" || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get(RESTORE_PARAM) === RESTORE_VALUE) setAppAdd(true);
  }, [section]);
  const [addPulse, setAddPulse] = useState(0);
  const anywhere = addAnywhereEnabled();
  const applicationsTab = section === "agents" || section === "ai-models" || searchParams.get("tab") === "ai" ? "ai" : "applications";
  const isApplicationsHub = section === "applications" || ((section === "agents" || section === "ai-models") && Boolean(selectedId));

  useEffect(() => {
    if (selectedId) return;
    if (section === "agents") router.replace(applicationsPath(basePath, { tab: "ai", aiType: "agents" }));
    if (section === "ai-models") router.replace(applicationsPath(basePath, { tab: "ai", aiType: "models" }));
    if (section === "locations") router.replace(platformsPath(basePath, "locations"));
  }, [section, selectedId, basePath, router]);

  const source = rows.filter((row) => {
    if (section === "applications") return row.kind === "application";
    if (section === "infrastructure") return row.kind !== "application";
    return false;
  });

  const types = ["All", ...Array.from(new Set(source.map((row) => row.typeLabel)))];

  const appCaps = useMemo(
    () => appCapabilityIndex(catalog.data?.objects ?? [], catalog.data?.relationships ?? []),
    [catalog.data?.objects, catalog.data?.relationships]
  );
  const capOptions = capabilityFilterOptions(catalog.data?.objects ?? []);
  const aiLabels = new Map(source.map((row) => [row.id, aiColumnLabel(row.object)]));
  const aiColumn = [...aiLabels.values()].some(Boolean);
  const filtered = source.filter((row) => {
    const hay = `${row.name} ${row.vendor} ${row.ownerTeam} ${row.ownerPerson}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (typeChip !== "All" && row.typeLabel !== typeChip) return false;
    if (lifecycle !== "Any lifecycle" && row.lifecycleLabel !== lifecycle) return false;
    if (criticality !== "Any criticality" && row.criticalityLabel !== criticality) return false;
    if (missingOnly && row.missingCount === 0) return false;
    if (section === "applications" && !matchesCapabilityFilter(appCaps.get(row.id) ?? [], capFilter)) return false;
    return true;
  });

  const missingTotal = source.reduce((sum, row) => sum + row.missingCount, 0);
  const trackedCost = filtered.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0);


  const open = (row: CatalogRow) => router.push(modelItemPath(basePath, section, row.id));
  // A column's + Add opens the record at that field (expanded, scrolled to, highlighted, editing).
  const openAt = (row: CatalogRow, gap: keyof CatalogRow["missing"]) =>
    openRecordField(modelItemPath(basePath, section, row.id, fieldKeyForGap(row.object.type, gap)), router.push);
  const capObject = section === "capabilities" && selectedKey
    ? catalog.data?.objects.find((item) => item.id === selectedKey)
    : undefined;
  const isCapabilityRecord = capObject?.type === "capability";
  const isActivityRecord = Boolean(isCapabilityRecord && isActivity(capObject?.properties));
  // Capability and activity records use the on-page tabs, not the repository drawer.
  const detailsOpen = false;
  const waitingForCap = section === "capabilities" && Boolean(selectedKey) && catalog.isLoading && !capObject;
  const close = () => {
    if (isCapabilityRecord && capObject && !isActivityRecord) {
      router.push(capabilityDetailPath(basePath, capObject.id, { activity: searchParams.get("activity") }));
      return;
    }
    router.push(modelPath(basePath, section));
  };

  useEffect(() => {
    if (!isCapabilityRecord || !capObject || !isActivityRecord) return;
    const parentId = String(capObject.properties?.parent_id ?? "");
    if (!parentId) return;
    router.replace(
      capabilityDetailPath(basePath, parentId, {
        activity: capObject.id,
        tab: searchParams.get("tab"),
        focus: searchParams.get("focus"),
      })
    );
  }, [isCapabilityRecord, isActivityRecord, capObject, basePath, router, searchParams]);

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
        {section !== "overview" && (showPaste || setupLatched) && (
          <div className="px-6 pt-5">
            <FirstRunAsk inline />
          </div>
        )}
        {section === "overview" && (
          <ModelOverview
            pending={catalog.isPending}
            failed={catalog.isError && !catalog.data}
            basePath={basePath}
          />
        )}
        {(section === "platforms" || (section === "locations" && Boolean(selectedId))) && (
          <PlatformsCloudPage
            rows={rows}
            selectedId={selectedId}
            anywhere={anywhere}
            initialTab={section === "locations" ? "locations" : undefined}
          />
        )}
        {section === "servers" && <ServersTable rows={rows} selectedId={selectedId} anywhere={anywhere} />}
        {section === "capabilities" && !isCapabilityRecord && !waitingForCap && <CapabilitiesSection selectedId={selectedId} />}
        {section === "capabilities" && isCapabilityRecord && !isActivityRecord && (
          <CapabilityDetailPage capabilityId={capObject.id} />
        )}
        {section === "connections" && <ConnectionsHub />}
        {section === "vendors" && <VendorsHub selectedId={selectedId} />}
        {section === "owners" && <OwnersPage />}
        {isApplicationsHub && applicationsTab === "ai" && (
          <div className="px-6 py-5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">WHAT THE BUSINESS RUNS</p>
            <h1 className="mb-4 text-[22px] font-semibold text-[#1c2230]">Applications</h1>
            <ApplicationsTabs applicationsCount={rows.filter((row) => row.kind === "application").length} active="ai" />
            <ApplicationsAiPanel selectedId={selectedId} />
          </div>
        )}
        {((section === "applications" && applicationsTab === "applications") || section === "infrastructure") && (
          <div className="px-6 py-5">
            {section === "applications" && (
              <ApplicationsTabs applicationsCount={source.length} active="applications" />
            )}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">
                {section === "infrastructure" ? "WHERE THINGS RUN" : "WHAT THE BUSINESS RUNS"}
              </p>
                <h1 className="text-[22px] font-semibold text-[#1c2230]">
                  {SECTION_TITLE[section]}{" "}
                  <span className="text-[14px] font-normal text-[#8b90a0]">{filtered.length ? describeTypes(filtered.map((row) => row.typeLabel)) : "none"}</span>
                  {section === "applications" && <AppPlatformHelp />}
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
                    onClick={() => {
                      if (!anywhere) {
                        setCreating("application");
                        return;
                      }
                      // + Add opens the box (or returns to it) and points at it; Escape or Cancel closes it.
                      setAppAdd(true);
                      setAddPulse((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
                  >
                    <Plus size={14} /> Add
                  </button>
                )}
              </div>
            </div>
            {anywhere && appAdd && section === "applications" && (
              <AppAddPanel origin="model" pulse={addPulse} onClose={() => setAppAdd(false)} onFullDetails={() => setCreating("application")} />
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, vendor, or owner"
                className="h-9 w-[260px] rounded-lg border border-[#e6e8ee] px-3 text-[13px] outline-none focus:border-[#5b4ce6]"
              />
              <Select value={lifecycle} onChange={setLifecycle} options={["Any lifecycle", "Planned", "Pilot", "Active", "Retiring", "End of life"]} />
              <Select value={criticality} onChange={setCriticality} options={["Any criticality", "Critical", "High", "Medium", "Low"]} />
              {section === "applications" && <Select value={capFilter} onChange={setCapFilter} options={capOptions} />}
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
                      {["Name", "Type · Hosting model", ...(section === "applications" ? ["Capabilities"] : []), "Owner", "Vendor", "Annual cost", "Renewal", "Lifecycle", "Criticality", ...(aiColumn ? ["AI"] : [])].map((heading) => (
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
                        {section === "applications" && (
                          <td className="px-2 py-3 text-[12px] text-[#4b5163]" data-testid="app-capabilities">
                            {(appCaps.get(row.id) ?? []).join(", ") || <span className="text-[#b0b4c0]">—</span>}
                          </td>
                        )}
                        <td className="px-2 py-3">
                          {row.missing.owner ? (
                            <AddChip label="Add" onClick={() => openAt(row, "owner")} />
                          ) : (
                            <div>
                              <div className="font-medium text-[#1c2230]">{row.ownerTeam || row.ownerPerson}</div>
                              {row.ownerTeam && row.ownerPerson && <div className="text-[12px] text-[#6b7289]">{row.ownerPerson}</div>}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {row.vendor ? row.vendor : <AddChip label="Add" onClick={() => openAt(row, "vendor")} />}
                        </td>
                        <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                          <QuickCostCell row={row} />
                        </td>
                        <td className="px-2 py-3">
                          {row.missing.renewal ? (
                            <AddChip label="Add" onClick={() => openAt(row, "renewal")} />
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
                          {row.lifecycleLabel ? <Pill label={row.lifecycleLabel} tone="lifecycle" /> : <AddChip label="Add" onClick={() => openAt(row, "lifecycle")} />}
                        </td>
                        <td className="px-2 py-3">
                          {row.criticalityLabel ? <Pill label={row.criticalityLabel} tone="criticality" /> : <AddChip label="Add" onClick={() => openAt(row, "criticality")} />}
                        </td>
                        {aiColumn && <td className="px-2 py-3 text-[12px] text-[#4b5163]">{aiLabels.get(row.id) || <span className="text-[#b0b4c0]">—</span>}</td>}
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

      {(() => {
        const detailsId = searchParams.get("details");
        const panelId = isCapabilityRecord && detailsOpen ? (detailsId || selectedKey) : selectedKey;
        const panelRow = panelId && panelId !== selected?.id
          ? (() => {
              const fromRows = rows.find((row) => row.id === panelId);
              if (fromRows) return fromRows;
              const object = catalog.data?.objects.find((item) => item.id === panelId);
              return object ? rowForPanel(object) : selected;
            })()
          : selected;
        const showPanel = Boolean(panelRow) && section !== "vendors" && (!isCapabilityRecord || detailsOpen);
        return showPanel && panelRow ? <ModelDetailPanel key={panelRow.id} row={panelRow} onClose={close} /> : null;
      })()}

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
