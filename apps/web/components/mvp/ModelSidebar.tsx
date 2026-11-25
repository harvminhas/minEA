"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Cable,
  Calendar,
  Cloud,
  Database,
  Landmark,
  Layers,
  LayoutGrid,
  Lock,
  Map,
  Server,
  Shield,
  Users,
  Workflow,
} from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { type ModelSection } from "@/lib/mvp-paths";
import { useModelNavExtras } from "@/lib/use-repository-nav-counts";
import { catalogStats } from "@/lib/model-catalog";
import { l2Capabilities } from "@/lib/capability-assessment";
import { useModelCatalog } from "@/lib/use-model-catalog";
import {
  modelNavGroups,
  platformsCloudCount,
  visibleModelNavGroups,
  type HiddenCounts,
} from "@/lib/architecture-nav";
import { useArchitectureAdvanced } from "@/lib/use-architecture-advanced";
import { useOptionalAuth } from "@/lib/auth-context";
import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/model-sidebar-collapsed";
import { ModelSidebarView, type SidebarIcon, type SidebarNavItem } from "@/components/mvp/ModelSidebarView";

const ICONS: Record<string, SidebarIcon> = {
  overview: LayoutGrid,
  capabilities: Map,
  "data-domains": Layers,
  "sensitive-data": Lock,
  processes: Workflow,
  applications: Boxes,
  platforms: Cloud,
  servers: Server,
  "data-stores": Database,
  connections: Cable,
  vendors: Shield,
  people: Users,
  roadmap: Calendar,
  investments: Landmark,
};

function useSubnavOpen() {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("bubomap-model-subnav");
      if (raw) setOpen(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      setOpen({});
    }
  }, []);

  const toggle = (key: string, next: boolean) => {
    setOpen((current) => {
      const updated = { ...current, [key]: next };
      window.localStorage.setItem("bubomap-model-subnav", JSON.stringify(updated));
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
  const locations = catalog.data ? catalog.data.locations?.length ?? 0 : undefined;
  const platforms = countTypes(["cloud_service"]);

  const hidden: HiddenCounts = {
    processes: extra("views/processes"),
  };
  const arch = useArchitectureAdvanced(orgSlug ?? "", workspaceSlug ?? "", hidden);

  const counts: Record<string, number | undefined> = {
    applications: countTypes(["application"]),
    platforms: platforms != null && locations != null ? platformsCloudCount(platforms, locations) : undefined,
    servers: countTypes(["model"]),
    connections,
    vendors: catalog.data ? stats.vendorCount : undefined,
    people,
    capabilities: catalog.data ? l2Capabilities(catalog.data.objects).length : undefined,
    "sensitive-data": countTypes(["data_object"]),
    "data-stores": countTypes(["data_store"]),
    "data-domains": countTypes(["data_domain"]),
    processes: hidden.processes,
    roadmap: countTypes(["roadmap_item"]),
  };

  const sections = visibleModelNavGroups(modelNavGroups(basePath), arch.advanced, pathname).map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item): SidebarNavItem => ({
      label: item.label,
      href: item.href,
      icon: ICONS[item.key],
      count: counts[item.key],
      match: item.match,
    })),
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
      sections={sections}
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
