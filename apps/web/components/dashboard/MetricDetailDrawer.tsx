"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ExternalLink, X } from "lucide-react";
import type { CapabilityMapDomain } from "@minea/types";
import type { MetricDrawerId } from "@/lib/use-metric-drawer-data";
import { cn } from "@/lib/utils";

interface Props {
  metric: MetricDrawerId | null;
  basePath: string;
  isLoading: boolean;
  map?: { initialized: boolean; domains: CapabilityMapDomain[] };
  systems?: { id: string; name: string }[];
  products?: { id: string; name: string; capability_ids?: string[] }[];
  onClose: () => void;
}

export function MetricDetailDrawer({
  metric,
  basePath,
  isLoading,
  map,
  systems,
  products,
  onClose,
}: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (metric) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [metric, onClose]);

  if (!metric) return null;

  const capMapHref = `${basePath}/business/capabilities`;
  const title =
    metric === "domains"
      ? "Domains"
      : metric === "capabilities"
        ? "Capabilities"
        : metric === "systems"
          ? "Systems"
          : "Products";

  const primaryAction = getPrimaryAction(metric, basePath);

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[400px] bg-white shadow-2xl z-[210] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <DrawerBody
              metric={metric}
              map={map}
              systems={systems}
              products={products}
              capMapHref={capMapHref}
              basePath={basePath}
            />
          )}
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <a
            href={primaryAction.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
          >
            {primaryAction.label}
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </>
  );
}

function getPrimaryAction(metric: MetricDrawerId, basePath: string) {
  switch (metric) {
    case "domains":
    case "capabilities":
      return {
        label: metric === "domains" ? "Add capabilities" : "Add capability",
        href: `${basePath}/business/capabilities`,
      };
    case "systems":
      return { label: "Add system", href: `${basePath}/application/applications` };
    case "products":
      return { label: "Add product", href: `${basePath}/strategy/products` };
  }
}

function drawerHref(
  metric: MetricDrawerId,
  basePath: string,
  item: { id: string; domain_id?: string }
): string {
  switch (metric) {
    case "domains":
      return `${basePath}/business/capabilities/domains/${item.id}`;
    case "capabilities":
      return item.domain_id
        ? `${basePath}/business/capabilities/domains/${item.domain_id}`
        : `${basePath}/business/capabilities`;
    case "systems":
      return `${basePath}/application/applications`;
    case "products":
      return `${basePath}/strategy/products`;
    default:
      return basePath;
  }
}

function DrawerListHint() {
  return (
    <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
      <ExternalLink size={12} className="flex-shrink-0 opacity-70" />
      Click a row to open in a new tab
    </p>
  );
}

function DrawerOpenRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
        className={cn(
          "group flex w-full items-center gap-3 px-4 py-3 bg-white text-left transition-colors hover:bg-gray-50",
          className
        )}
      >
        {children}
        <ExternalLink
          size={14}
          className="flex-shrink-0 text-gray-300 group-hover:text-indigo-500 transition-colors"
          aria-hidden
        />
      </button>
    </li>
  );
}

function DrawerBody({
  metric,
  map,
  systems,
  products,
  capMapHref,
  basePath,
}: {
  metric: MetricDrawerId;
  map?: { initialized: boolean; domains: CapabilityMapDomain[] };
  systems?: { id: string; name: string }[];
  products?: { id: string; name: string; capability_ids?: string[] }[];
  capMapHref: string;
  basePath: string;
}) {
  if (metric === "domains") {
    const domains = map?.domains ?? [];
    if (domains.length === 0) {
      return (
        <EmptyMetric
          message="No domains yet. Domains group your capabilities by business area — e.g. Finance, Sales, Technology."
          actionHref={capMapHref}
          actionLabel="Add domain"
        />
      );
    }
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
          {domains.length} domain{domains.length === 1 ? "" : "s"}
        </p>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
          {domains.map((domain) => {
            const capCount = domain.capabilities?.length ?? 0;
            const incomplete = capCount === 0;
            return (
              <DrawerOpenRow
                key={domain.id}
                href={drawerHref("domains", basePath, domain)}
              >
                <DomainStatusIndicator complete={!incomplete} />
                <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">
                  {domain.name}
                </span>
                <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                  {capCount} cap{capCount === 1 ? "" : "s"}
                </span>
                {incomplete && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                    Incomplete
                  </span>
                )}
              </DrawerOpenRow>
            );
          })}
        </ul>
        <p className="text-xs text-gray-400 mt-4 leading-relaxed">
          Each domain needs at least one capability to appear on the heatmap.
        </p>
        <DrawerListHint />
      </>
    );
  }

  if (metric === "capabilities") {
    const allCaps =
      map?.domains.flatMap((d) =>
        (d.capabilities ?? []).map((c) => ({ ...c, domainName: d.name, domain_id: d.id }))
      ) ?? [];
    if (allCaps.length === 0) {
      return (
        <EmptyMetric
          message="No capabilities yet. Capabilities describe what your business does — e.g. Customer onboarding, Financial reporting. They're the core of your architecture map."
          actionHref={capMapHref}
          actionLabel="Add capability"
        />
      );
    }
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
          {allCaps.length} capabilit{allCaps.length === 1 ? "y" : "ies"}
        </p>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
          {allCaps.map((cap) => (
            <DrawerOpenRow
              key={cap.id}
              href={drawerHref("capabilities", basePath, {
                id: cap.id,
                domain_id: cap.domain_id,
              })}
            >
              <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">
                {cap.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[35%]">
                {cap.domainName}
              </span>
            </DrawerOpenRow>
          ))}
        </ul>
        <DrawerListHint />
      </>
    );
  }

  if (metric === "systems") {
    const list = systems ?? [];
    if (list.length === 0) {
      return (
        <EmptyMetric
          message="No systems yet. Systems are the applications and platforms that support your capabilities."
          actionHref={`${basePath}/application/applications`}
          actionLabel="Add system"
        />
      );
    }
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
          {list.length} system{list.length === 1 ? "" : "s"}
        </p>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
          {list.map((s) => (
            <DrawerOpenRow key={s.id} href={drawerHref("systems", basePath, s)}>
              <span className="flex-1 text-sm font-medium text-gray-800 truncate">{s.name}</span>
            </DrawerOpenRow>
          ))}
        </ul>
        <DrawerListHint />
      </>
    );
  }

  const list = products ?? [];
  if (list.length === 0) {
    return (
      <EmptyMetric
        message="No products yet. Products connect what you offer to the capabilities and systems that deliver it."
        actionHref={`${basePath}/strategy/products`}
        actionLabel="Add product"
      />
    );
  }
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
        {list.length} product{list.length === 1 ? "" : "s"}
      </p>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
        {list.map((p) => {
          const capCount = p.capability_ids?.length ?? 0;
          return (
            <DrawerOpenRow key={p.id} href={drawerHref("products", basePath, p)}>
              <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">
                {p.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {capCount} cap{capCount === 1 ? "" : "s"}
              </span>
            </DrawerOpenRow>
          );
        })}
      </ul>
      <DrawerListHint />
    </>
  );
}

/** Read-only status — not a selectable checkbox. */
function DomainStatusIndicator({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 flex-shrink-0"
        title="Has capabilities"
      >
        <Check size={12} className="text-emerald-600" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0 ring-4 ring-amber-100"
      title="No capabilities yet"
    />
  );
}

function EmptyMetric({
  message,
  actionHref,
  actionLabel,
}: {
  message: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#faf8f5] p-5 text-center">
      <div className="h-10 w-10 rounded-lg border border-stone-200/60 bg-white mx-auto mb-3" />
      <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
      <a
        href={actionHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
      >
        {actionLabel}
        <ExternalLink size={14} />
      </a>
    </div>
  );
}
