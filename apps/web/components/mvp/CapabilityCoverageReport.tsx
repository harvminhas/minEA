"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { SuggestedDomain } from "@minea/types";
import { BackToViews } from "@/components/views/BackToViews";
import { cameFromViews } from "@/lib/views-hub/routes";
import { useTenancy } from "@/lib/tenancy";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { reportsPath } from "@/lib/mvp-paths";
import { capabilityOpenPath } from "@/lib/capability-detail";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { capabilityMapApi, objectsApi } from "@/lib/api-client";
import { domainSuggestions, resolveDomain } from "@/lib/capabilities";
import { domainIdentityColor } from "@/lib/capability-assessment";
import { CapabilityInterview, type InterviewValues } from "@/components/capability-map/CapabilityInterview";
import { CapabilityReview } from "@/components/capability-map/CapabilityReview";
import { cn } from "@/lib/utils";
import { capabilityCoverage, type CoverageListItem } from "@/lib/reports/capability-coverage";

const TILE: Record<string, string> = {
  "c-good": "bg-emerald-50 border-emerald-200",
  "c-ok": "bg-lime-50 border-lime-200",
  "c-fair": "bg-orange-50 border-orange-200",
  "c-gap": "bg-red-50 border-red-200",
  "a-0": "border-dashed border-[#e6e8ee] bg-[#fafafb]",
};

export function CapabilityCoverageReport() {
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const catalog = useModelCatalog();
  const objects = catalog.data?.objects ?? [];
  const relationships = catalog.data?.relationships ?? [];
  const rows = catalog.data?.rows ?? [];
  const model = useMemo(
    () => capabilityCoverage(objects, relationships, rows),
    [objects, relationships, rows],
  );
  const estateIds = model.domains.filter((domain) => domain.id !== "no-domain").map((domain) => domain.id);

  return (
    <Shell title="Capability coverage" basePath={basePath}>
      {model.empty ? (
        <EmptyCoverage objects={objects} />
      ) : (
        <PopulatedCoverage basePath={basePath} objects={objects} model={model} estateIds={estateIds} />
      )}
    </Shell>
  );
}

function PopulatedCoverage({
  basePath,
  objects,
  model,
  estateIds,
}: {
  basePath: string;
  objects: { id: string; type: string; properties?: Record<string, unknown> | null }[];
  model: ReturnType<typeof capabilityCoverage>;
  estateIds: string[];
}) {
  const hrefFor = (id: string) => capabilityOpenPath(basePath, id, objects);
  const noSystemNames = model.noSystem.slice(0, 3).map((item) => item.name).join(", ");
  const partialNames = model.partial.slice(0, 3).map((item) => item.name).join(", ");

  return (
    <>
      <p className="text-[15px] text-[#1c2230]">{ledeWithEmphasis(model.lede, model.covered, model.total)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Covered" value={`${model.covered} of ${model.total}`} detail="A system is in place for every activity" />
        <Kpi
          label="No system"
          value={String(model.noSystem.length)}
          detail={noSystemNames || "Every capability has a system"}
          warn={model.noSystem.length > 0}
        />
        <Kpi label="Partly covered" value={String(model.partial.length)} detail={partialNames || "Nothing is only partly covered"} />
        <Kpi
          label="Weak support"
          value={String(model.weak.length)}
          detail={model.weak.length ? "A linked system is a weak fit" : "No weak support flagged"}
        />
      </div>

      <div className="mt-6 mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[14px] font-medium text-[#1c2230]">Coverage by area</h2>
        <div className="flex flex-wrap gap-3 text-[12px] text-[#6b7289]">
          <Legend swatch="bg-emerald-50 border-emerald-200" label="Covered" />
          <Legend swatch="bg-lime-50 border-lime-200" label="Mostly" />
          <Legend swatch="bg-orange-50 border-orange-200" label="Partial" />
          <Legend swatch="bg-red-50 border-red-200" label="No system" />
        </div>
      </div>
      <div className="rounded-xl border border-[#e6e8ee] p-3">
        <div className="flex flex-col gap-1">
          {model.domains.map((domain) => {
            const identity = domainIdentityColor(domain.id, estateIds);
            return (
              <div
                key={domain.id}
                className="grid grid-cols-[210px_1fr] items-center gap-3 rounded-[10px] py-1.5 pl-3 pr-2.5"
                style={{ background: `rgba(${identity.rgb}, 0.045)`, boxShadow: `inset 3px 0 0 rgb(${identity.rgb})` }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[#1c2230]">{domain.name}</div>
                  <div className="text-[11.5px] text-[#8b90a0]">{domain.meta}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {domain.caps.map((cap) => (
                    <Link
                      key={cap.id}
                      href={hrefFor(cap.id)}
                      title={cap.name}
                      className={cn("h-[22px] w-[22px] rounded-[4px] border", TILE[cap.heatClass] ?? TILE["a-0"])}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {model.noSystem.length > 0 && (
        <ListSection
          title="Needs a system"
          hint="These capabilities have no application linked. Open one to map a system."
          headers={["Capability", "Area", "Status", ""]}
          rows={model.noSystem}
          hrefFor={hrefFor}
          trailing="Fix →"
        />
      )}
      {model.partial.length > 0 && (
        <ListSection
          title="Only partly covered"
          hint="A system is linked, but not every activity underneath is covered."
          headers={["Capability", "Area", "Coverage"]}
          rows={model.partial}
          hrefFor={hrefFor}
        />
      )}
      {model.weak.length > 0 && (
        <ListSection
          title="Weak support"
          hint="The support score already on the map — the weakest system linked to the capability."
          headers={["Capability", "Area", "Why it is flagged"]}
          rows={model.weak}
          hrefFor={hrefFor}
        />
      )}
      {model.single.length > 0 && (
        <ListSection
          title="Served by only one app"
          hint="If that app fails, this part of the business has no other system recorded."
          headers={["Capability", "Area", "Only app"]}
          rows={model.single}
          hrefFor={hrefFor}
        />
      )}
      <p className="mt-4 text-[12px] text-[#8b90a0]">
        Counts use the same coverage and support rules as Overview and the capability map.
      </p>
    </>
  );
}

function ledeWithEmphasis(lede: string, covered: number, total: number): ReactNode {
  const phrase = `${covered} of ${total} ${total === 1 ? "capability" : "capabilities"}`;
  const at = lede.indexOf(phrase);
  if (at < 0) return lede;
  return (
    <>
      <strong>{phrase}</strong>
      {lede.slice(at + phrase.length)}
    </>
  );
}

function ListSection({
  title,
  hint,
  headers,
  rows,
  hrefFor,
  trailing,
}: {
  title: string;
  hint: string;
  headers: string[];
  rows: CoverageListItem[];
  hrefFor: (id: string) => string;
  trailing?: string;
}) {
  return (
    <>
      <h2 className="mt-6 mb-1 text-[14px] font-medium text-[#1c2230]">{title}</h2>
      <p className="mb-2.5 text-[13px] text-[#6b7289]">{hint}</p>
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
            {headers.map((heading, index) => (
              <th key={`${heading}-${index}`} className="h-11 px-2 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[#f3f4f8]">
              <td className="px-2 py-3 font-medium">
                <Link href={hrefFor(row.id)} className="text-[#3f35b5] hover:underline">
                  {row.name}
                </Link>
              </td>
              <td className="px-2 py-3">{row.domain}</td>
              <td className="px-2 py-3">{row.status}</td>
              {trailing ? (
                <td className="px-2 py-3 text-right">
                  <Link href={hrefFor(row.id)} className="font-medium text-[#4f46e5]">
                    {trailing}
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function EmptyCoverage({ objects }: { objects: Parameters<typeof domainSuggestions>[0] }) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"interview" | "review">("interview");
  const [suggestion, setSuggestion] = useState<SuggestedDomain[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

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
        setError(result.warning || "No suggestion came back. Try a bit more detail, or add a capability yourself.");
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

  const addCapability = async () => {
    const capName = name.trim();
    if (!capName || !orgSlug || !workspaceSlug) return;
    setError("");
    setBusy(true);
    try {
      const t = await token();
      const catalogObjects =
        queryClient.getQueryData<{ objects: typeof objects }>(catalogQueryKey(orgSlug, workspaceSlug))?.objects ?? objects;
      const resolved = resolveDomain(domain, catalogObjects);
      let domainId: string | undefined;
      if ("id" in resolved) domainId = resolved.id;
      else if ("create" in resolved) {
        const createdDomain = await objectsApi.create(
          orgSlug,
          workspaceSlug,
          { type: "business_domain", name: resolved.create, properties: {} },
          t,
        );
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: createdDomain });
        domainId = createdDomain.id;
      }
      const created = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "capability", name: capName, properties: domainId ? { domain_id: domainId } : {} },
        t,
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
      setName("");
      setDomain("");
      setAddOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the capability");
    } finally {
      setBusy(false);
    }
  };

  if (!canCreate) {
    return (
      <>
        <p className="text-[15px] text-[#1c2230]">
          There is no capability map yet, so this report has nothing to count.
        </p>
        <p className="mt-3 text-[13px] text-[#6b7289]">No capabilities yet.</p>
      </>
    );
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
    <>
      <p className="mb-4 text-[15px] text-[#1c2230]">
        There is no capability map yet, so this report has nothing to count. Describe the business here and we will
        suggest a starting map. Nothing is saved until you use it.
      </p>
      <CapabilityInterview
        busy={busy}
        error={error}
        onSuggest={(values) => void suggest(values)}
        onAddYourself={() => setAddOpen((open) => !open)}
        addYourselfLabel="Or add one capability yourself"
      />
      {addOpen && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addCapability();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Capability name"
            aria-label="Capability name"
            autoFocus
            className="h-8 w-56 rounded-lg border border-[#e6e8ee] px-2.5 text-[13px] outline-none focus:border-[#5b4ce6]"
          />
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="Domain (optional)"
            aria-label="Domain"
            list="coverage-domain-suggestions"
            className="h-8 w-44 rounded-lg border border-[#e6e8ee] px-2.5 text-[13px] outline-none focus:border-[#5b4ce6]"
          />
          <datalist id="coverage-domain-suggestions">
            {domainSuggestions(objects).map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="h-8 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Add
          </button>
        </form>
      )}
    </>
  );
}

function Shell({
  title,
  basePath,
  children,
}: {
  title: string;
  basePath: string;
  children: ReactNode;
}) {
  const fromViews = cameFromViews(useSearchParams());
  return (
    <div className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        {fromViews ? (
          <BackToViews className="" />
        ) : (
          <div className="text-[13px] text-[#6b7289]">
            <Link href={reportsPath(basePath)} className="hover:text-[#1c2230]">Reports</Link>
            <span> / </span>
            <span className="text-[#1c2230]">{title}</span>
          </div>
        )}
      </div>
      <h1 className="mb-3 text-[22px] font-semibold text-[#1c2230]">{title}</h1>
      {children}
    </div>
  );
}

function Kpi({ label, value, detail, warn }: { label: string; value: string; detail: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-[#f3e3c0] bg-[#fff8eb]" : "border-[#e6e8ee]"}`}>
      <div className="text-[12px] text-[#6b7289]">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-[#1c2230]">{value}</div>
      <div className="text-[12px] text-[#8b90a0]">{detail}</div>
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
