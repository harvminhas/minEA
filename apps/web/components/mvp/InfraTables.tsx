"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { modelItemPath, modelPath } from "@/lib/mvp-paths";
import type { CatalogRow } from "@/lib/model-catalog";
import { applyCatalogWrite } from "@/lib/use-model-catalog";
import { infraConfig } from "@/lib/infra/infraConfig";
import { platformFields, runtimeFields, sortBlanksLast } from "@/lib/infra/fields";
import { InfraControl } from "@/components/mvp/InfraEditors";
import { hostSourceIds, readPlatformInfra, readRuntimeInfra } from "@/lib/infra/read";
import { agingSummary, infraStatus, type InfraStatusResult } from "@/lib/infra/status";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { QuickCost } from "@/components/mvp/CostSection";
import { AddChip } from "@/components/mvp/pills";
import { AddFlow } from "@/components/add/AddFlow";
import { cn } from "@/lib/utils";

const COMPUTE_FOR_KIND: Record<string, string> = {
  physical_server: "on_prem",
  vm: "vm",
  cloud_service: "serverless",
  database: "paas",
  network_device: "on_prem",
  storage: "on_prem",
  end_user_device: "on_prem",
};

function StatusBadge({ status }: { status: InfraStatusResult }) {
  const tone =
    status.severity === "bad"
      ? "bg-[#fde8e8] text-[#b42318]"
      : status.severity === "warn"
        ? "bg-[#fff4d6] text-[#92400e]"
        : status.severity === "ok"
          ? "bg-[#e7f6ee] text-[#067647]"
          : "bg-[#f3f4f8] text-[#6b7289]";
  return (
    <span title={status.reason} className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>
      {status.label}
    </span>
  );
}

function dash(value: string) {
  return value || <span className="text-[#c5c8d4]">—</span>;
}

export function PlatformsTable({ rows, selectedId, anywhere = false }: { rows: CatalogRow[]; selectedId?: string; anywhere?: boolean }) {
  const router = useRouter();
  const { basePath } = useTenancy();
  const impact = useImpactGraph();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All kinds");
  const [hosting, setHosting] = useState("Any hosting");
  const [missingOnly, setMissingOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const platforms = sortBlanksLast(
    rows.filter((row) => row.kind === "platform"),
    (row) => readPlatformInfra(row.object).platformKind ?? "",
    (row) => row.name
  );
  const platformKind = platformFields.find((field) => field.key === "platform_kind");
  const views = platforms.map((row) => ({ row, infra: readPlatformInfra(row.object) }));
  const filtered = views.filter(({ row, infra }) => {
    const hay = `${row.name} ${infra.vendor} ${row.ownerTeam} ${row.ownerPerson}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (kind !== "All kinds" && infra.kindLabel !== kind) return false;
    if (hosting !== "Any hosting" && infra.hostingLabel !== hosting) return false;
    if (missingOnly && !row.missing.owner && !row.missing.cost) return false;
    return true;
  });
  const missing = platforms.filter((row) => row.missing.owner || row.missing.cost).length;
  const total = filtered.reduce((sum, item) => sum + (item.row.annualCostNumber ?? 0), 0);

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">SUITES AND CLOUDS YOU BUILD ON</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            Platforms & cloud <span className="text-[14px] font-normal text-[#8b90a0]">{platforms.length}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMissingOnly((value) => !value)}
            className={cn("rounded-lg border px-3 py-1.5 text-[13px] font-medium", missingOnly ? "border-[#fdba74] bg-[#fff7ed] text-[#c2410c]" : "border-[#e6e8ee] text-[#4b5163]")}
          >
            Fill missing ({missing})
          </button>
          {anywhere && (
            <button type="button" onClick={() => setAdding((value) => !value)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
              + Add
            </button>
          )}
        </div>
      </div>
      {adding && <div className="mb-4"><AddFlow origin="model" kind="platform" compact /></div>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, vendor, or owner" className="h-9 w-[260px] max-w-full rounded-lg border border-[#e6e8ee] px-3 text-[13px] outline-none focus:border-[#5b4ce6]" />
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-9 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
          <option>All kinds</option>
          {infraConfig.platformKinds.map((item) => <option key={item.key}>{item.label}</option>)}
        </select>
        <select value={hosting} onChange={(event) => setHosting(event.target.value)} className="h-9 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
          <option>Any hosting</option>
          {Object.values(infraConfig.platformHostingLabels).map((label) => <option key={label}>{label}</option>)}
        </select>
        <button type="button" onClick={() => setMissingOnly(true)} className="rounded-lg border border-[#e6e8ee] px-2.5 py-1.5 text-[12px] text-[#4b5163]">Missing owner or cost</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Vendor", "Kind", "Hosting model", "Owner", "Built on it", "Annual cost (US$)", "Renewal"].map((heading) => (
                <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ row, infra }) => {
              const built = hostSourceIds(row.id, impact.edges).length;
              return (
                <tr key={row.id} onClick={() => router.push(modelItemPath(basePath, "platforms", row.id))} className={cn("cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]", selectedId === row.id && "bg-[#f6f5ff]")}>
                  <td className="px-2 py-3 font-medium text-[#1c2230]">{row.name}</td>
                  <td className="px-2 py-3">{infra.vendor ? <><div>{infra.vendor}</div>{infra.product && <div className="truncate text-[12px] text-[#8b90a0]">{infra.vendorCode} · {infra.product}</div>}</> : dash("")}</td>
                  <td className="px-2 py-3" title={infra.kindInferred ? "From hosting model" : undefined}>
                    {platformKind ? <InfraControl object={row.object} field={platformKind} compact /> : dash(infra.kindLabel)}
                  </td>
                  <td className="px-2 py-3">{infra.hostingLabel ? <span className="rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[11px]">{infra.hostingLabel}</span> : dash("")}</td>
                  <td className="px-2 py-3">{row.missing.owner ? <AddChip label="Add" onClick={() => router.push(modelItemPath(basePath, "platforms", row.id))} /> : row.ownerTeam || row.ownerPerson}</td>
                  <td className="px-2 py-3">{built || dash("")}</td>
                  <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                    {row.missing.cost ? <QuickCost row={row} onSaved={() => undefined} /> : row.annualCostLabel}
                  </td>
                  <td className="px-2 py-3">{row.renewalLabel && !row.missing.renewal ? row.renewalLabel : dash("")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-[#8b90a0]">
        {filtered.length} of {platforms.length} shown · amber = missing owner or cost · a dash means not set
        <span className="float-right">Total ${Math.round(total).toLocaleString("en-US")}</span>
      </p>
    </div>
  );
}

export function ServersTable({ rows, selectedId, anywhere = false }: { rows: CatalogRow[]; selectedId?: string; anywhere?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const impact = useImpactGraph();
  const statusFilter = params.get("status") || "all";
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All kinds");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addKind, setAddKind] = useState("physical_server");
  const [addError, setAddError] = useState("");
  const today = useMemo(() => new Date(), []);
  const servers = sortBlanksLast(
    rows.filter((row) => row.kind === "runtime"),
    (row) => readRuntimeInfra(row.object).runtimeKind ?? "",
    (row) => row.name
  );
  const runtimeKind = runtimeFields.find((field) => field.key === "runtime_kind");
  const supportEnds = runtimeFields.find((field) => field.key === "support_ends");
  const views = servers.map((row) => {
    const infra = readRuntimeInfra(row.object);
    return { row, infra, status: infraStatus(infra, today) };
  });
  const counts = {
    all: views.length,
    attention: views.filter((item) => item.status.severity === "bad" || item.status.severity === "warn").length,
    out: views.filter((item) => item.status.status === "out_of_support" || item.status.status === "unsupported_os").length,
    soon: views.filter((item) => item.status.status === "ends_soon").length,
    ok: views.filter((item) => item.status.status === "ok").length,
    unknown: views.filter((item) => item.status.status === "unknown").length,
  };
  const filtered = views.filter(({ row, infra, status }) => {
    const hay = `${row.name} ${infra.osName} ${infra.osVersion} ${row.ownerTeam}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (kind !== "All kinds" && infra.kindLabel !== kind) return false;
    if (statusFilter === "attention" && status.severity !== "bad" && status.severity !== "warn") return false;
    if (statusFilter === "out_of_support_or_os" && status.status !== "out_of_support" && status.status !== "unsupported_os") return false;
    if (statusFilter === "ends_soon" && status.status !== "ends_soon") return false;
    if (statusFilter === "ok" && status.status !== "ok") return false;
    if (statusFilter === "unknown" && status.status !== "unknown") return false;
    return true;
  });
  const summary = agingSummary(views.map((item) => item.infra), today);
  const setStatus = (value: string) => router.push(`${modelPath(basePath, "servers")}${value === "all" ? "" : `?status=${value}`}`);

  const add = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Type a name first");
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      return objectsApi.create(orgSlug, workspaceSlug, {
        type: "model",
        name: trimmed,
        properties: { runtime_kind: addKind, compute_runtime_kind: COMPUTE_FOR_KIND[addKind] ?? "on_prem" },
      }, token);
    },
    onSuccess: (created) => {
      setName("");
      setAddError("");
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
      if (created?.id) router.push(modelItemPath(basePath, "servers", created.id));
    },
    onError: (error: Error) => setAddError(error.message),
  });

  const chips = [
    ["all", `All ${counts.all}`],
    ["attention", `Needs attention ${counts.attention}`],
    ["out_of_support_or_os", `Out of support / unsupported OS ${counts.out}`],
    ["ends_soon", `Ends in 90 days ${counts.soon}`],
    ["ok", `OK ${counts.ok}`],
    ...(counts.unknown ? [["unknown", `Not set ${counts.unknown}`] as const] : []),
  ] as const;

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">WHERE THINGS RUN</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            Servers & devices <span className="text-[14px] font-normal text-[#8b90a0]">{servers.length}</span>
          </h1>
        </div>
        {anywhere && (
          <button type="button" onClick={() => setAdding((value) => !value)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
            + Add
          </button>
        )}
      </div>
      {adding && <div className="mb-4"><AddFlow origin="model" kind="server" compact /></div>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, OS, or owner" className="h-9 w-[260px] max-w-full rounded-lg border border-[#e6e8ee] px-3 text-[13px] outline-none focus:border-[#5b4ce6]" />
        <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-9 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
          <option>All kinds</option>
          {infraConfig.runtimeKinds.map((item) => <option key={item.key}>{item.label}</option>)}
        </select>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {chips.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setStatus(id)} className={cn("rounded-full border px-2.5 py-1 text-[12px]", statusFilter === id ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]")}>
            {label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Kind", "Location", "OS & version", "Runs", "Owner", "Support ends", "Status"].map((heading) => (
                <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ row, infra, status }) => {
              const runs = hostSourceIds(row.id, impact.edges).length;
              const os = [infra.osName, infra.osVersion].filter(Boolean).join(" ");
              return (
                <tr key={row.id} onClick={() => router.push(modelItemPath(basePath, "servers", row.id))} className={cn("cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]", selectedId === row.id && "bg-[#f6f5ff]")}>
                  <td className="px-2 py-3 font-medium text-[#1c2230]">{row.name}</td>
                  <td className="px-2 py-3">{runtimeKind ? <InfraControl object={row.object} field={runtimeKind} compact /> : dash(infra.kindLabel)}</td>
                  <td className="px-2 py-3">
                    <div>{dash(infra.locationLabel)}</div>
                    {infra.locationDetail && <div className="truncate text-[12px] text-[#8b90a0]" title={infra.locationDetail}>{infra.locationDetail}</div>}
                  </td>
                  <td className={cn("px-2 py-3", status.status === "unsupported_os" && "font-medium text-[#b42318]")}>{dash(os)}</td>
                  <td className="px-2 py-3">{runs || dash("")}</td>
                  <td className="px-2 py-3">{row.missing.owner ? <AddChip label="Add" onClick={() => router.push(modelItemPath(basePath, "servers", row.id))} /> : row.ownerTeam || row.ownerPerson}</td>
                  <td className={cn("px-2 py-3", status.severity === "bad" && "text-[#b42318]", status.severity === "warn" && "text-[#92400e]")} title={status.reason}>
                    {supportEnds ? <InfraControl object={row.object} field={supportEnds} compact /> : dash("")}
                  </td>
                  <td className="px-2 py-3"><StatusBadge status={status} /></td>
                </tr>
              );
            })}
            {!anywhere && <tr className="border-b border-[#f3f4f8]">
              <td className="px-2 py-3" colSpan={8}>
                <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
                  <span className="text-[#5b4ce6]">+</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a server or device, e.g. ESX01" className="h-8 w-[280px] max-w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
                  <select value={addKind} onChange={(event) => setAddKind(event.target.value)} className="h-8 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
                    {infraConfig.runtimeKinds.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  <button type="submit" disabled={add.isPending} className="rounded-lg bg-[#5b4ce6] px-3 py-1 text-[13px] font-semibold text-white">Save</button>
                  <span className="text-[12px] text-[#8b90a0]">Only a name and kind are needed. Fill in the rest later.</span>
                </form>
                {addError && <p className="mt-1 text-[12px] text-[#b42318]">{addError}</p>}
              </td>
            </tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-[#8b90a0]">
        {filtered.length} of {servers.length} shown · {summary.outOfSupportOrOs} out of support or on an unsupported OS · {summary.endsSoon} ending in 90 days
        <span className="float-right">Runs = apps with a runs-on link</span>
      </p>
    </div>
  );
}

export function AgingTile({ rows, basePath }: { rows: CatalogRow[]; basePath: string }) {
  const summary = agingSummary(rows.filter((row) => row.kind === "runtime").map((row) => readRuntimeInfra(row.object)), new Date());
  if (summary.outOfSupportOrOs === 0 && summary.endsSoon === 0) return null;
  const tint = summary.outOfSupportOrOs > 0 ? "border-[#f3c0c0] bg-[#fff5f5]" : "border-[#f5d7a8] bg-[#fffaf0]";
  const flagged = summary.items.filter((item) => item.status.severity === "bad" || item.status.severity === "warn");
  return (
    <div className={cn("mt-4 rounded-xl border p-4", tint)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-[#b42318]">AGING INFRASTRUCTURE</p>
          <p className="mt-1 text-[15px] font-semibold text-[#1c2230]">
            {summary.outOfSupportOrOs} items out of support or on an unsupported OS · {summary.endsSoon} ending in 90 days
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {flagged.map((item) => (
              <span key={item.runtime.id} className="rounded-full bg-white px-2 py-0.5 text-[12px] text-[#1c2230]">{item.runtime.name}</span>
            ))}
          </div>
        </div>
        <a href={`${basePath}/model/servers?status=attention`} className="shrink-0 text-[13px] font-medium text-[#5b4ce6]">Review in Servers & devices →</a>
      </div>
    </div>
  );
}
