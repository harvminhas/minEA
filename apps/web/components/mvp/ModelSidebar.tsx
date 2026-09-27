"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Cable, ChevronRight, LayoutGrid, Server, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { modelPath, type ModelSection } from "@/lib/mvp-paths";
import { useRepositoryNavCounts } from "@/lib/use-repository-nav-counts";
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
  const { data: counts } = useRepositoryNavCounts(orgSlug ?? "", workspaceSlug ?? "");
  const catalog = useModelCatalog();
  const stats = catalogStats(catalog.data?.rows ?? []);
  const subnav = useSubnavOpen();
  const count = (segment: string) => counts?.[segment] ?? 0;

  const infrastructure = count("infrastructure/cloud-services") + count("infrastructure/models");
  const connections =
    count("integration/flows") +
    count("integration/apis") +
    count("integration/events") +
    count("integration/tools");
  const data =
    count("data/data-objects") + count("data/data-stores") + count("data/data-domains");
  const people = count("people/teams") + count("people/roles") + count("people/contacts");

  const estate: NavItem[] = [
    {
      label: "Overview",
      href: modelPath(basePath, "overview"),
      icon: LayoutGrid,
      match: ["/model/overview"],
    },
    {
      label: "Applications",
      href: `${basePath}/application/applications`,
      icon: Boxes,
      count: count("application/applications"),
      match: ["/application/applications", "/application/components", "/model/applications"],
    },
    {
      label: "Infrastructure",
      href: `${basePath}/infrastructure/cloud-services`,
      icon: Server,
      count: infrastructure,
      match: ["/infrastructure/", "/model/infrastructure"],
      children: [
        {
          label: "Platforms",
          href: `${basePath}/infrastructure/cloud-services`,
          count: count("infrastructure/cloud-services"),
          match: ["/infrastructure/cloud-services"],
        },
        {
          label: "Runtimes",
          href: `${basePath}/infrastructure/models`,
          count: count("infrastructure/models"),
          match: ["/infrastructure/models"],
        },
      ],
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
          count: count("integration/flows"),
          match: ["/integration/flows"],
        },
        {
          label: "APIs",
          href: `${basePath}/integration/apis`,
          count: count("integration/apis"),
          match: ["/integration/apis"],
        },
        {
          label: "Events",
          href: `${basePath}/integration/events`,
          count: count("integration/events"),
          match: ["/integration/events"],
        },
        {
          label: "Integration infra",
          href: `${basePath}/integration/tools`,
          count: count("integration/tools"),
          match: ["/integration/tools"],
        },
      ],
    },
    {
      label: "Vendors & contracts",
      href: modelPath(basePath, "vendors"),
      icon: Shield,
      count: stats.vendorCount,
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
          count: count("people/teams"),
          match: ["/people/teams"],
        },
        {
          label: "Roles",
          href: `${basePath}/people/roles`,
          count: count("people/roles"),
          match: ["/people/roles"],
        },
        {
          label: "Contacts",
          href: `${basePath}/people/contacts`,
          count: count("people/contacts"),
          match: ["/people/contacts"],
        },
      ],
    },
  ];

  const architecture: NavItem[] = [
    {
      label: "Capabilities",
      href: `${basePath}/business/capabilities`,
      count: count("business/capabilities"),
      match: ["/business/capabilities"],
    },
    {
      label: "Processes",
      href: `${basePath}/views/processes`,
      count: count("views/processes"),
      match: ["/views/processes"],
    },
    {
      label: "Roadmaps",
      href: `${basePath}/strategy/roadmaps`,
      count: count("strategy/roadmaps"),
      match: ["/strategy/roadmaps"],
    },
    {
      label: "Products",
      href: `${basePath}/strategy/products`,
      count: count("strategy/products"),
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
          count: count("data/data-objects"),
          match: ["/data/data-objects"],
        },
        {
          label: "Stores",
          href: `${basePath}/data/data-stores`,
          count: count("data/data-stores"),
          match: ["/data/data-stores"],
        },
        {
          label: "Domains",
          href: `${basePath}/data/data-domains`,
          count: count("data/data-domains"),
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
        <p className="text-[12px] font-medium text-[#3c4254]">Model {stats.completeness}% complete</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e6e8ee]">
          <div className="h-full rounded-full bg-[#5b4ce6]" style={{ width: `${stats.completeness}%` }} />
        </div>
        <Link href={`${basePath}/application/applications`} className="mt-1 inline-block text-[12px] text-[#5b4ce6]">
          {stats.missing} key fields missing
        </Link>
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
