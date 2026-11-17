"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Cable,
  Calendar,
  ChevronRight,
  Cloud,
  Database,
  Landmark,
  Layers,
  LayoutGrid,
  Lock,
  Map,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { modelPath, type ModelSection } from "@/lib/mvp-paths";
import { useModelNavExtras } from "@/lib/use-repository-nav-counts";
import { catalogStats } from "@/lib/model-catalog";
import { l2Capabilities } from "@/lib/capability-assessment";
import { AI_GROUP_LABEL, UI_TYPE_LABEL } from "@/lib/relationship-targets";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { architectureItems, visibleArchitectureItems, type HiddenCounts } from "@/lib/architecture-nav";
import { useArchitectureAdvanced } from "@/lib/use-architecture-advanced";
import { useOptionalAuth } from "@/lib/auth-context";
import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/model-sidebar-collapsed";
import { ModelSidebarView, type SidebarNavItem } from "@/components/mvp/ModelSidebarView";

type IconType = typeof LayoutGrid;

type NavItem = SidebarNavItem;

const SUBNAV_KEY = "bubomap-model-subnav";

const ARCH_RAIL_ICONS: Record<string, IconType> = {
  capabilities: Map,
  roadmap: Calendar,
  "sensitive-data": Lock,
  processes: Workflow,
  investments: Landmark,
  "data-stores": Database,
  "data-domains": Layers,
};

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

export function ModelSidebar({
  active,
  collapsed: collapsedProp,
  onCollapsedChange,
  showcaseTooltip,
}: {
  active?: ModelSection;
  collapsed?: boolean;
  onCollapsedChange?: (next: boolean) => void;
  showcaseTooltip?: string;
}) {
  const pathname = usePathname();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { data: extras } = useModelNavExtras(orgSlug ?? "", workspaceSlug ?? "");
  const catalog = useModelCatalog();
  const stats = catalogStats(catalog.data?.rows ?? []);
  const subnav = useSubnavOpen();
  const uid = useOptionalAuth()?.user?.uid ?? null;
  const [storedCollapsed, setStoredCollapsed] = useState(false);

  useEffect(() => {
    setStoredCollapsed(readSidebarCollapsed(window.localStorage, uid));
  }, [uid]);

  const collapsed = collapsedProp ?? storedCollapsed;
  const setCollapsed = (next: boolean) => {
    setStoredCollapsed(next);
    writeSidebarCollapsed(window.localStorage, next, uid);
    onCollapsedChange?.(next);
  };

  const objects = catalog.data?.objects;
  const countTypes = (types: string[]) => {
    if (!objects) return undefined;
    const wanted = new Set(types);
    return objects.filter((object) => wanted.has(object.type)).length;
  };
  const extra = (segment: string) => (extras ? extras[segment] ?? 0 : undefined);

  const connections = countTypes(["integration_flow", "api", "event", "tool"]);
  const people = extras
    ? (extras["people/teams"] ?? 0) + (extras["people/contacts"] ?? 0)
    : undefined;

  const estate: NavItem[] = [
    {
      label: "Overview",
      href: modelPath(basePath, "overview"),
      icon: LayoutGrid,
      match: ["/model/overview"],
    },
    {
      label: UI_TYPE_LABEL.application,
      href: modelPath(basePath, "applications"),
      icon: Boxes,
      count: countTypes(["application", "solution", "technical_capability"]),
      match: ["/application/applications", "/application/components", "/model/applications"],
    },
    {
      label: AI_GROUP_LABEL,
      icon: Sparkles,
      href: modelPath(basePath, "agents"),
      count: countTypes(["agent", "ai_model"]),
      match: ["/model/agents", "/model/ai-models"],
      children: [
        {
          label: UI_TYPE_LABEL.agent,
          href: modelPath(basePath, "agents"),
          count: countTypes(["agent"]),
          match: ["/model/agents"],
        },
        {
          label: UI_TYPE_LABEL.ai_model,
          href: modelPath(basePath, "ai-models"),
          count: countTypes(["ai_model"]),
          match: ["/model/ai-models"],
        },
      ],
    },
    {
      label: UI_TYPE_LABEL.cloud_service,
      href: modelPath(basePath, "platforms"),
      icon: Cloud,
      count: countTypes(["cloud_service"]),
      match: ["/model/platforms"],
    },
    {
      label: UI_TYPE_LABEL.model,
      href: modelPath(basePath, "servers"),
      icon: Server,
      count: countTypes(["model"]),
      match: ["/model/servers", "/model/infrastructure"],
    },
    {
      label: UI_TYPE_LABEL.location,
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
          label: UI_TYPE_LABEL.integration_flow,
          href: `${basePath}/integration/flows`,
          count: countTypes(["integration_flow"]),
          match: ["/integration/flows"],
        },
        {
          label: UI_TYPE_LABEL.api,
          href: `${basePath}/integration/apis`,
          count: countTypes(["api"]),
          match: ["/integration/apis"],
        },
        {
          label: UI_TYPE_LABEL.event,
          href: `${basePath}/integration/events`,
          count: countTypes(["event"]),
          match: ["/integration/events"],
        },
        {
          label: UI_TYPE_LABEL.tool,
          href: `${basePath}/integration/tools`,
          count: countTypes(["tool"]),
          match: ["/integration/tools"],
        },
      ],
    },
    {
      label: UI_TYPE_LABEL.external_party,
      href: modelPath(basePath, "vendors"),
      icon: Shield,
      count: catalog.data ? stats.vendorCount : undefined,
      match: ["/model/vendors"],
    },
    {
      label: "People & teams",
      href: modelPath(basePath, "owners"),
      icon: Users,
      count: people,
      match: ["/people/", "/model/owners"],
      children: [
        {
          label: "People",
          href: `${basePath}/people/contacts`,
          count: extra("people/contacts"),
          match: ["/people/contacts"],
        },
        {
          label: "Teams",
          href: `${basePath}/people/teams`,
          count: extra("people/teams"),
          match: ["/people/teams"],
        },
        {
          label: "Ownership roles",
          href: `${basePath}/people/roles`,
          match: ["/people/roles"],
        },
      ],
    },
  ];

  const hidden: HiddenCounts = {
    processes: extra("views/processes"),
    dataStores: countTypes(["data_store"]),
    dataDomains: countTypes(["data_domain"]),
  };
  const arch = useArchitectureAdvanced(orgSlug ?? "", workspaceSlug ?? "", hidden);
  const archCount: Record<string, number | undefined> = {
    capabilities: catalog.data ? l2Capabilities(catalog.data.objects).length : undefined,
    roadmap: countTypes(["roadmap_item"]),
    "sensitive-data": countTypes(["data_object"]),
    processes: hidden.processes,
    "data-stores": hidden.dataStores,
    "data-domains": hidden.dataDomains,
  };
  const architecture: NavItem[] = visibleArchitectureItems(architectureItems(basePath), arch.advanced, pathname).map((item) => ({
    label: item.label,
    href: item.href,
    icon: ARCH_RAIL_ICONS[item.key],
    railIconOnly: true,
    count: archCount[item.key],
    match: item.match,
  }));

  const completenessLabel = catalog.data
    ? `Model ${stats.completeness}% complete`
    : catalog.isError
      ? "Model didn't load"
      : "Loading the model…";

  return (
    <ModelSidebarView
      pathname={pathname}
      active={active}
      basePath={basePath}
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
      estate={estate}
      architecture={architecture}
      advanced={arch.advanced}
      onAdvanced={arch.setAdvanced}
      advancedError={arch.error}
      subnav={subnav}
      completeness={catalog.data ? stats.completeness : null}
      completenessLabel={completenessLabel}
      missing={catalog.data ? stats.missing : null}
      showcaseTooltip={showcaseTooltip}
    />
  );
}

