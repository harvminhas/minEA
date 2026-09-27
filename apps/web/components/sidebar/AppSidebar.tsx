"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Cpu,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Briefcase,
  AppWindow,
  Share2,
  Database,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { isViewsModePath, NAV_VIEWS } from "@/lib/views";
import {
  REPOSITORY_LAYERS,
  isNavItemDisabled,
  layerChildItems,
  layerHeaderItem,
  layerNavCountTotal,
  visibleNavItems,
  type RepositoryLayer,
  type RepositoryNavItem,
} from "@/lib/repository-nav";
import { useRepositoryNavCounts } from "@/lib/use-repository-nav-counts";
// ─── Icons assigned to each repository layer ─────────────────────────────

const LAYER_ICONS: Record<string, LucideIcon> = {
  systems: AppWindow,
  integrations: Share2,
  platforms: Cpu,
  people: Users,
  business: Briefcase,
  strategy: Target,
  data: Database,
};

function NavCount({ value, show }: { value: number; show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[10px] text-white/25 tabular-nums flex-shrink-0">{value}</span>
  );
}

function RepoNavItemRow({
  item,
  href,
  pathname,
  onNavigate,
  indent = true,
  count,
  showCounts,
}: {
  item: RepositoryNavItem;
  href: string;
  pathname: string;
  onNavigate?: () => void;
  indent?: boolean;
  count?: number;
  showCounts: boolean;
}) {
  const disabled = isNavItemDisabled(item);
  const isActive = !disabled && (pathname === href || pathname.startsWith(`${href}/`));
  const rowClass = cn(
    "flex items-center gap-2 py-1 text-sm transition-colors min-w-0",
    indent ? "pl-10 pr-4" : "px-4",
    disabled
      ? "text-white/25 cursor-not-allowed"
      : isActive
        ? "bg-indigo-600 text-white"
        : "text-white/55 hover:text-white hover:bg-white/5"
  );

  const content = (
    <>
      <span className="truncate text-[13px] flex-1 min-w-0">{item.label}</span>
      {!disabled && <NavCount value={count ?? 0} show={showCounts} />}
    </>
  );

  if (disabled) {
    return (
      <div key={item.segment} title="Coming soon" className={rowClass}>
        {content}
      </div>
    );
  }

  return (
    <Link key={item.segment} href={href} onClick={onNavigate} className={rowClass}>
      {content}
    </Link>
  );
}

// ─── Shared tooltip ───────────────────────────────────────────────────────

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity delay-75 z-50">
      {children}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
    </span>
  );
}

// ─── Icon button (collapsed state) ───────────────────────────────────────

function IconBtn({
  href,
  active,
  icon: Icon,
  tooltip,
  onClick,
  suppressTooltip,
  isOpen,
}: {
  href?: string;
  active?: boolean;
  icon: LucideIcon;
  tooltip: string;
  onClick?: () => void;
  suppressTooltip?: boolean;
  isOpen?: boolean;
}) {
  const activeClass = "bg-indigo-600 text-white";
  const inactiveClass = "text-white/50 hover:text-white hover:bg-white/8";

  const inner = (
    <>
      {(active || isOpen) && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-white/70" />
      )}
      <Icon size={16} />
      {!suppressTooltip && <Tooltip>{tooltip}</Tooltip>}
    </>
  );

  const cls = cn(
    "group relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors",
    active || isOpen ? activeClass : inactiveClass
  );

  if (href) {
    return (
      <Link href={href} title={tooltip} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} title={tooltip} className={cls}>
      {inner}
    </button>
  );
}

// ─── Collapsed: Views icon rail ───────────────────────────────────────────

function CollapsedViewsNav({
  basePath,
  pathname,
}: {
  basePath: string;
  pathname: string;
}) {
  return (
    <>
      {NAV_VIEWS.map((view) => {
        const href = `${basePath}/${view.segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <IconBtn
            key={view.id}
            href={href}
            active={isActive}
            icon={view.icon}
            tooltip={view.label}
          />
        );
      })}
    </>
  );
}

// ─── Collapsed: Repository icon rail ─────────────────────────────────────

function CollapsedLayerFlyout({
  layer,
  basePath,
  pathname,
  isOpen,
  onToggle,
  onClose,
  countsBySegment,
  showCounts,
}: {
  layer: RepositoryLayer;
  basePath: string;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  countsBySegment: Record<string, number>;
  showCounts: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const LayerIcon = LAYER_ICONS[layer.id] ?? Briefcase;
  const items = visibleNavItems(layer);
  const isLayerActive = items.some((item) => {
    if (isNavItemDisabled(item)) return false;
    const href = `${basePath}/${item.segment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });

  useEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setCoords(null);
      return;
    }

    function updatePosition() {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + 8,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={anchorRef} className="relative">
        <IconBtn
        active={isLayerActive}
        icon={LayerIcon}
        tooltip={layer.label}
        onClick={onToggle}
        suppressTooltip={isOpen}
        isOpen={isOpen}
      />

      {isOpen && coords && (
        <div
          className="fixed z-[60] min-w-[200px] -translate-y-1/2 rounded-lg border border-white/10 bg-[#1e293b] py-1.5 shadow-2xl"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="flex items-center justify-between gap-2 px-3 pb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
              {layer.label}
            </p>
            <NavCount
              value={layerNavCountTotal(layer, countsBySegment)}
              show={showCounts}
            />
          </div>
          {items.map((item) => (
            <RepoNavItemRow
              key={item.segment}
              item={item}
              href={`${basePath}/${item.segment}`}
              pathname={pathname}
              onNavigate={onClose}
              indent={false}
              count={countsBySegment[item.segment]}
              showCounts={showCounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CollapsedRepoNav({
  basePath,
  pathname,
  countsBySegment,
  showCounts,
}: {
  basePath: string;
  pathname: string;
  countsBySegment: Record<string, number>;
  showCounts: boolean;
}) {
  const overviewHref = basePath;
  const isOnOverview = pathname === basePath;
  const [openLayerId, setOpenLayerId] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenLayerId(null);
  }, [pathname]);

  useEffect(() => {
    if (!openLayerId) return;

    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenLayerId(null);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenLayerId(null);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openLayerId]);

  return (
    <div ref={navRef} className="flex flex-col items-center gap-1">
      <IconBtn
        href={overviewHref}
        active={isOnOverview}
        icon={LayoutGrid}
        tooltip="Overview"
      />
      <div className="w-6 h-px bg-white/10 my-0.5" />
      {REPOSITORY_LAYERS.map((layer) => {
        const items = visibleNavItems(layer);
        const availableItems = items.filter((item) => !isNavItemDisabled(item));
        const hasSubnav = items.length > 1;

        if (!hasSubnav && availableItems.length === 1) {
          const item = availableItems[0];
          const href = `${basePath}/${item.segment}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          const LayerIcon = LAYER_ICONS[layer.id] ?? Briefcase;

          return (
            <IconBtn
              key={layer.id}
              href={href}
              active={isActive}
              icon={LayerIcon}
              tooltip={layer.label}
            />
          );
        }

        return (
          <CollapsedLayerFlyout
            key={layer.id}
            layer={layer}
            basePath={basePath}
            pathname={pathname}
            isOpen={openLayerId === layer.id}
            onToggle={() => setOpenLayerId((current) => (current === layer.id ? null : layer.id))}
            onClose={() => setOpenLayerId(null)}
            countsBySegment={countsBySegment}
            showCounts={showCounts}
          />
        );
      })}
    </div>
  );
}

// ─── Expanded: Views full nav ─────────────────────────────────────────────

function ExpandedViewsNav({
  basePath,
  pathname,
}: {
  basePath: string;
  pathname: string;
}) {
  return (
    <div>
      {NAV_VIEWS.map((view, index) => {
        const href = `${basePath}/${view.segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        const rowClass = cn(
          "flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-indigo-600 text-white"
            : "text-white/55 hover:text-white hover:bg-white/5"
        );
        return (
          <div key={view.id}>
            {index === 3 && <div className="mx-4 my-1.5 h-px bg-white/10" />}
            <Link href={href} className={rowClass}>
              <span className="truncate flex-1">{view.label}</span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

// ─── Expanded: Repository full nav ────────────────────────────────────────

function ExpandedRepoNav({
  basePath,
  pathname,
  countsBySegment,
  showCounts,
}: {
  basePath: string;
  pathname: string;
  countsBySegment: Record<string, number>;
  showCounts: boolean;
}) {
  const { collapsedLayers, toggleLayer } = useAppStore();
  const overviewHref = basePath;
  const isOnOverview = pathname === basePath;

  return (
    <div>
      <Link
        href={overviewHref}
        className={cn(
          "flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors",
          isOnOverview
            ? "bg-indigo-600 text-white"
            : "text-white/55 hover:text-white hover:bg-white/5"
        )}
      >
        <span className="truncate flex-1">Overview</span>
      </Link>

      <div className="mx-4 my-1.5 h-px bg-white/8" />

      {REPOSITORY_LAYERS.map((layer) => {
        const items = visibleNavItems(layer);
        const header = layerHeaderItem(layer);
        const children = layerChildItems(layer);
        const isCollapsed = collapsedLayers[layer.id] ?? true;
        const headerHref = header ? `${basePath}/${header.segment}` : null;
        const headerActive =
          !!headerHref && (pathname === headerHref || pathname.startsWith(`${headerHref}/`));
        const childActive = children.some((item) => {
          if (isNavItemDisabled(item)) return false;
          const href = `${basePath}/${item.segment}`;
          return pathname === href || pathname.startsWith(`${href}/`);
        });
        const headerCount = header
          ? countsBySegment[header.segment] ?? 0
          : layerNavCountTotal(layer, countsBySegment);
        const rowClass = cn(
          "flex w-full items-center gap-2 px-4 py-1.5 text-sm transition-colors min-w-0",
          headerActive
            ? "bg-indigo-600 text-white"
            : childActive && isCollapsed
              ? "text-white"
              : "text-white/55 hover:text-white hover:bg-white/5"
        );

        return (
          <div key={layer.id}>
            <div className={rowClass}>
              <button
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className="flex-shrink-0"
                aria-label={isCollapsed ? `Expand ${layer.label}` : `Collapse ${layer.label}`}
              >
                <ChevronRight
                  size={12}
                  className={cn("transition-transform", !isCollapsed && "rotate-90")}
                />
              </button>
              {headerHref ? (
                <Link href={headerHref} className="truncate flex-1 text-left">
                  {layer.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleLayer(layer.id)}
                  className="truncate flex-1 text-left"
                >
                  {layer.label}
                </button>
              )}
              <NavCount value={headerCount} show={showCounts} />
            </div>

            {!isCollapsed && children.length > 0 && (
              <div className="mb-0.5">
                {children.map((item) => (
                  <RepoNavItemRow
                    key={item.segment}
                    item={item}
                    href={`${basePath}/${item.segment}`}
                    pathname={pathname}
                    count={countsBySegment[item.segment]}
                    showCounts={showCounts}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main AppSidebar ──────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { viewMode, sidebarExpanded, setSidebarExpanded } = useAppStore();
  const { data: navCounts } = useRepositoryNavCounts(orgSlug ?? "", workspaceSlug ?? "");
  const countsBySegment = navCounts ?? {};
  const showCounts = navCounts !== undefined;

  const isViews = viewMode !== "split" && (viewMode === "views" || isViewsModePath(pathname));
  const sidebarModeLabel = isViews ? "Views" : "Repository";

  const settingsHref = orgSlug ? `/orgs/${orgSlug}/settings` : "/home";
  const isOnSettings = pathname.endsWith("/settings");

  const toggleBtn = (
    <button
      type="button"
      onClick={() => setSidebarExpanded(!sidebarExpanded)}
      title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
      className={cn(
        "flex items-center gap-2 rounded-md transition-colors text-sm",
        sidebarExpanded ? "px-1.5 py-1" : "h-9 w-9 justify-center",
        "text-white/35 hover:text-white hover:bg-white/8"
      )}
    >
      {sidebarExpanded ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
    </button>
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-14 bottom-0 flex flex-col z-40 transition-[width] duration-200 overflow-hidden sidebar border-r border-white/10",
        sidebarExpanded ? "w-[200px]" : "w-[52px]"
      )}
    >
      {/* ── Header row with toggle ── */}
      <div
        className={cn(
          "flex items-center flex-shrink-0 border-b h-10 border-white/8",
          sidebarExpanded ? "px-3 justify-between" : "justify-center"
        )}
      >
        {sidebarExpanded && (
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider select-none text-white/30"
            )}
          >
            {sidebarModeLabel}
          </span>
        )}
        {toggleBtn}
      </div>

      {/* ── Scrollable nav ── */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto py-2",
          sidebarExpanded ? "" : "flex flex-col items-center gap-1",
          // hide scrollbar cross-browser
          "[&::-webkit-scrollbar]:hidden"
        )}
        style={{ scrollbarWidth: "none" }}
      >
        {workspaceSlug && orgSlug && (
          sidebarExpanded ? (
            isViews ? (
              <ExpandedViewsNav basePath={basePath} pathname={pathname} />
            ) : (
              <ExpandedRepoNav
                basePath={basePath}
                pathname={pathname}
                countsBySegment={countsBySegment}
                showCounts={showCounts}
              />
            )
          ) : (
            isViews ? (
              <CollapsedViewsNav basePath={basePath} pathname={pathname} />
            ) : (
              <CollapsedRepoNav
                basePath={basePath}
                pathname={pathname}
                countsBySegment={countsBySegment}
                showCounts={showCounts}
              />
            )
          )
        )}
      </nav>

      {/* ── Footer: settings (expanded only) ── */}
      {sidebarExpanded && (
        <div className="border-t border-white/10 py-1">
          <Link
            href={settingsHref}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
              isOnSettings
                ? "bg-indigo-600 text-white"
                : "text-white/55 hover:text-white hover:bg-white/5"
            )}
          >
            <Settings size={14} />
            Org settings
          </Link>
        </div>
      )}
    </aside>
  );
}
