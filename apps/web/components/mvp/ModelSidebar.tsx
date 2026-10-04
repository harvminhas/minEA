"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Cable, ChevronRight, Cloud, LayoutGrid, MapPin, Server, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { modelPath, type ModelSection } from "@/lib/mvp-paths";
import { useModelNavExtras } from "@/lib/use-repository-nav-counts";
import { catalogStats } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";

type IconType = typeof LayoutGrid;

type NavItem = {
  label: string;
  href: string;
  icon?: IconType;
  count?: number;
  /** Pathname fragments that mark this row active. */
  match: string[];
  children?: NavItem[];
};

const SUBNAV_KEY = "bubomap-model-subnav";

function isActive(pathname: string, match: string[]): boolean {
  return match.some((fragment) => pathname.includes(fragment));
}

function useSubnavOpen() {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SUBNAV_KEY);
      if (raw) setOpen(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      setOpen({});
    }
  }, []);

  const toggle = (key: string, next: boolean) => {
    setOpen((current) => {
      const updated = { ...current, [key]: next };
      window.localStorage.setItem(SUBNAV_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return { open, toggle };
}

export function ModelSidebar({ active }: { active?: ModelSection }) {
  const pathname = usePathname();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { data: extras } = useModelNavExtras(orgSlug ?? "", workspaceSlug ?? "");
  const catalog = useModelCatalog();
  const stats = catalogStats(catalog.data?.rows ?? []);
  const subnav = useSubnavOpen();
  const objects = catalog.data?.objects;
  const countTypes = (types: string[]) => {
    if (!objects) return undefined;
    const wanted = new Set(types);
    return objects.filter((object) => wanted.has(object.type)).length;
  };
  const extra = (segment: string) => (extras ? extras[segment] ?? 0 : undefined);

  const connections = countTypes(["integration_flow", "api", "event", "tool"]);
  const people = extras
    ? (extras["people/teams"] ?? 0) + (extras["people/roles"] ?? 0) + (extras["people/contacts"] ?? 0)
    : undefined;
  const data = countTypes(["data_object", "data_store", "data_domain"]);

  const estate: NavItem[] = [
    {
      label: "Overview",
      href: modelPath(basePath, "overview"),
      icon: LayoutGrid,
      match: ["/model/overview"],
    },
    {
      label: "Applications",
      href: modelPath(basePath, "applications"),
      icon: Boxes,
      count: countTypes(["application", "solution", "technical_capability"]),
      match: ["/application/applications", "/application/components", "/model/applications"],
    },
    {
      label: "Platforms & cloud",
      href: modelPath(basePath, "platforms"),
      icon: Cloud,
      count: countTypes(["cloud_service"]),
      match: ["/model/platforms"],
    },
    {
      label: "Servers & devices",
      href: modelPath(basePath, "servers"),
      icon: Server,
      count: countTypes(["model"]),
      match: ["/model/servers", "/model/infrastructure"],
    },
    {
      label: "Locations",
      href: modelPath(basePath, "locations"),
      icon: MapPin,
      count: catalog.data ? catalog.data.locations?.length ?? 0 : undefined,
      match: ["/model/locations"],
    },
    {
      label: "Connections",
      href: `${basePath}/integration/flows`,
      icon: Cable,
      count: connections,
      match: ["/integration/", "/model/connections"],
      children: [
        {
          label: "Flows",
          href: `${basePath}/integration/flows`,
          count: countTypes(["integration_flow"]),
          match: ["/integration/flows"],
        },
        {
          label: "APIs",
          href: `${basePath}/integration/apis`,
          count: countTypes(["api"]),
          match: ["/integration/apis"],
        },
        {
          label: "Events",
          href: `${basePath}/integration/events`,
          count: countTypes(["event"]),
          match: ["/integration/events"],
        },
        {
          label: "Integration infra",
          href: `${basePath}/integration/tools`,
          count: countTypes(["tool"]),
          match: ["/integration/tools"],
        },
      ],
    },
    {
      label: "Vendors & contracts",
      href: modelPath(basePath, "vendors"),
      icon: Shield,
      count: catalog.data ? stats.vendorCount : undefined,
      match: ["/model/vendors"],
    },
    {
      label: "Owners & teams",
      href: `${basePath}/people/teams`,
      icon: Users,
      count: people,
      match: ["/people/", "/model/owners"],
      children: [
        {
          label: "Teams",
          href: `${basePath}/people/teams`,
          count: extra("people/teams"),
          match: ["/people/teams"],
        },
        {
          label: "Roles",
          href: `${basePath}/people/roles`,
          count: extra("people/roles"),
          match: ["/people/roles"],
        },
        {
          label: "Contacts",
          href: `${basePath}/people/contacts`,
          count: extra("people/contacts"),
          match: ["/people/contacts"],
        },
      ],
    },
  ];

  const architecture: NavItem[] = [
    {
      label: "Capabilities",
      href: `${basePath}/business/capabilities`,
      count: extra("business/capabilities"),
      match: ["/business/capabilities"],
    },
    {
      label: "Processes",
      href: `${basePath}/views/processes`,
      count: extra("views/processes"),
      match: ["/views/processes"],
    },
    {
      label: "Roadmaps",
      href: `${basePath}/strategy/roadmaps`,
      count: countTypes(["roadmap_item"]),
      match: ["/strategy/roadmaps"],
    },
    {
      label: "Products",
      href: `${basePath}/strategy/products`,
      count: extra("strategy/products"),
      match: ["/strategy/products"],
    },
    {
      label: "Data",
      href: `${basePath}/data/data-objects`,
      count: data,
      match: ["/data/"],
      children: [
        {
          label: "Entities",
          href: `${basePath}/data/data-objects`,
          count: countTypes(["data_object"]),
          match: ["/data/data-objects"],
        },
        {
          label: "Stores",
          href: `${basePath}/data/data-stores`,
          count: countTypes(["data_store"]),
          match: ["/data/data-stores"],
        },
        {
          label: "Domains",
          href: `${basePath}/data/data-domains`,
          count: countTypes(["data_domain"]),
          match: ["/data/data-domains"],
        },
      ],
    },
  ];

  return (
    <aside className="flex h-full w-[232px] flex-shrink-0 flex-col border-r border-[#e7e8ee] bg-[#f6f7f9]">
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-4">
        <Section label="Your estate" items={estate} pathname={pathname} active={active} subnav={subnav} />
        <Section label="Architecture" items={architecture} pathname={pathname} active={active} subnav={subnav} />
      </nav>
      <div className="border-t border-[#e7e8ee] px-4 py-3">
        {catalog.data ? (
          <>
            <p className="text-[12px] font-medium text-[#3c4254]">Model {stats.completeness}% complete</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e6e8ee]">
              <div className="h-full rounded-full bg-[#5b4ce6]" style={{ width: `${stats.completeness}%` }} />
            </div>
            <Link href={modelPath(basePath)} className="mt-1 inline-block text-[12px] text-[#5b4ce6]">
              {stats.missing} key fields missing
            </Link>
          </>
        ) : (
          <p className="text-[12px] text-[#8b90a0]">{catalog.isError ? "Model didn't load" : "Loading the model…"}</p>
        )}
      </div>
    </aside>
  );
}

function Section({
  label,
  items,
  pathname,
  active,
  subnav,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  active?: ModelSection;
  subnav: { open: Record<string, boolean>; toggle: (key: string, next: boolean) => void };
}) {
  return (
    <div>
      <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">
        {label.toUpperCase()}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavRows key={item.label} item={item} pathname={pathname} active={active} depth={0} subnav={subnav} />
        ))}
      </div>
    </div>
  );
}

function NavRows({
  item,
  pathname,
  active,
  depth,
  subnav,
}: {
  item: NavItem;
  pathname: string;
  active?: ModelSection;
  depth: number;
  subnav: { open: Record<string, boolean>; toggle: (key: string, next: boolean) => void };
}) {
  const childActive = item.children?.some((child) => isActive(pathname, child.match)) ?? false;
  const expanded = Boolean(item.children) && subnav.open[item.label] !== false;

  useEffect(() => {
    if (childActive && subnav.open[item.label] === false) {
      subnav.toggle(item.label, true);
    }
    // Open a collapsed group when the route moves into it. A click to collapse stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const selected =
    !childActive &&
    (isActive(pathname, item.match) ||
      (active === "overview" && item.label === "Overview") ||
      (active === "vendors" && item.label === "Vendors & contracts"));
  const Icon = item.icon;
  const className = cn(
    "flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-[13.5px]",
    depth === 0 ? "px-2.5" : "py-1.5 pl-9 pr-2.5 text-[13px]",
    selected ? "bg-[#ece9ff] font-semibold text-[#3f35b5]" : "text-[#3c4254] hover:bg-white"
  );
  const body = (
    <>
      {Icon && <Icon size={16} className={cn("shrink-0", selected || childActive ? "text-[#5b4ce6]" : "text-[#8b90a0]")} />}
      {item.children && (
        <ChevronRight
          size={14}
          className={cn("shrink-0 text-[#8b90a0] transition-transform", expanded && "rotate-90")}
        />
      )}
      <span className={cn("flex-1 truncate", childActive && "font-medium text-[#1f2430]")}>{item.label}</span>
      {item.count != null && <span className="text-[12px] text-[#8b90a0]">{item.count}</span>}
    </>
  );

  return (
    <>
      {item.children ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => subnav.toggle(item.label, !expanded)}
          className={className}
        >
          {body}
        </button>
      ) : (
        <Link href={item.href} className={className}>
          {body}
        </Link>
      )}
      {expanded &&
        item.children?.map((child) => (
          <NavRows key={child.href} item={child} pathname={pathname} active={active} depth={depth + 1} subnav={subnav} />
        ))}
    </>
  );
}
