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
  AlertTriangle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { NAV_VIEWS } from "@/lib/views";
import { usePlanFeatures } from "@/lib/use-plan-features";
import {
  REPOSITORY_LAYERS,
  isNavItemDisabled,
  layerNavCountTotal,
  visibleNavItems,
  type NavBadge,
  type RepositoryLayer,
  type RepositoryNavItem,
} from "@/lib/repository-nav";
import { useRepositoryNavCounts } from "@/lib/use-repository-nav-counts";
// ─── Icons assigned to each repository layer ─────────────────────────────

const LAYER_ICONS: Record<string, LucideIcon> = {
  strategy: Target,
  business: Briefcase,
  application: AppWindow,
  integration: Share2,
  data: Database,
  technology: Cpu,
  people: Users,
  risk: AlertTriangle,
};

function NavCount({ value, show }: { value: number; show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-[10px] text-white/25 tabular-nums flex-shrink-0">{value}</span>
  );
}

function NavBadgePill({ badge }: { badge: NavBadge }) {
  if (badge === "new") {
    return (
      <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
        New
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide bg-white/5 text-white/25 border border-white/10">
      Upcoming
    </span>
  );
}

function RepoNavItemRow({
  item,
  layer,
  href,
  pathname,
  onNavigate,
  indent = true,
  count,
  showCounts,
}: {
  item: RepositoryNavItem;
  layer: RepositoryLayer;
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
        ? "bg-white/10 text-white"
        : "text-white/45 hover:text-white hover:bg-white/5"
  );

  const content = (
    <>
      <span
        className={cn("h-1 w-1 rounded-full flex-shrink-0", disabled && "opacity-40")}
        style={{ backgroundColor: layer.color }}
      />
      <span className="truncate text-[13px] flex-1 min-w-0">{item.label}</span>
      {!disabled && <NavCount value={count ?? 0} show={showCounts} />}
      {item.badge && <NavBadgePill badge={item.badge} />}
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
  color,
  onClick,
  isViews,
  suppressTooltip,
  isOpen,
}: {
  href?: string;
  active?: boolean;
  icon: LucideIcon;
  tooltip: string;
  color?: string;
  onClick?: () => void;
  isViews?: boolean;
  suppressTooltip?: boolean;
  isOpen?: boolean;
}) {
  const activeClass = isViews
    ? "bg-violet-500 text-white"
    : "bg-white/10 text-white";
  const inactiveClass = isViews
    ? "text-violet-300/60 hover:text-violet-100 hover:bg-violet-800/60"
    : "text-white/50 hover:text-white hover:bg-white/8";

  const inner = (
    <>
      {(active || isOpen) && (
        <span
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r",
            isViews ? "bg-violet-300" : "bg-white/70"
          )}
        />
      )}
      {color ? (
        <span
          className="h-5 w-5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon size={13} />
        </span>
      ) : (
        <Icon size={16} />
      )}
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
  const galleryHref = `${basePath}/views`;
  const isOnGallery = pathname === galleryHref;

  return (
    <>
      <IconBtn
        href={galleryHref}
        active={isOnGallery}
        icon={LayoutGrid}
        tooltip="Gallery"
        isViews
      />
      <div className="w-6 h-px bg-violet-700/40 my-0.5" />
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
            color={view.color}
            isViews
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
        color={layer.color}
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
              layer={layer}
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
              color={layer.color}
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
  const { allowsView } = usePlanFeatures();
  const galleryHref = `${basePath}/views`;
  const isOnGallery = pathname === galleryHref;

  return (
    <div>
      <div className="flex items-center justify-between px-4 mb-1">
        <p className="text-[10px] font-semibold text-violet-300/50 uppercase tracking-wider">
          Views
        </p>
      </div>

      {/* Gallery */}
      <Link
        href={galleryHref}
        className={cn(
          "flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors",
          isOnGallery
            ? "bg-violet-500/30 text-violet-100"
            : "text-violet-300/60 hover:text-violet-100 hover:bg-violet-800/40"
        )}
      >
        <span className="h-5 w-5 rounded flex items-center justify-center flex-shrink-0 bg-violet-500/20">
          <LayoutGrid size={11} className="text-violet-300" />
        </span>
        <span className="truncate">Gallery</span>
      </Link>

      <div className="mx-4 my-1.5 h-px bg-violet-700/40" />

      {NAV_VIEWS.map((view) => {
        const href = `${basePath}/${view.segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = view.icon;
        const locked = !allowsView(view.id);
        const rowClass = cn(
          "flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors",
          locked
            ? "text-violet-300/30 cursor-not-allowed"
            : isActive
              ? "bg-violet-500/30 text-violet-100"
              : "text-violet-300/60 hover:text-violet-100 hover:bg-violet-800/40"
        );
        const content = (
          <>
            <span
              className="h-5 w-5 rounded flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${view.color}22` }}
            >
              <Icon size={11} style={{ color: view.color, opacity: locked ? 0.45 : 1 }} />
            </span>
            <span className="truncate flex-1">{view.label}</span>
            {locked && (
              <span className="text-[8px] font-semibold uppercase tracking-wide text-violet-300/40 flex-shrink-0">
                Solo
              </span>
            )}
          </>
        );
        return locked ? (
          <div key={view.id} title="Available on Solo and Team plans" className={rowClass}>
            {content}
          </div>
        ) : (
          <Link key={view.id} href={href} className={rowClass}>
            {content}
          </Link>
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

  return (
    <div>
      <div className="px-4 mb-1">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
          Repository
        </p>
      </div>

      {REPOSITORY_LAYERS.map((layer) => {
        const items = visibleNavItems(layer);
        const isCollapsed = collapsedLayers[layer.id] ?? true;
        const LayerIcon = LAYER_ICONS[layer.id] ?? Briefcase;
        const isLayerActive = items.some((item) => {
          if (isNavItemDisabled(item)) return false;
          const href = `${basePath}/${item.segment}`;
          return pathname === href || pathname.startsWith(`${href}/`);
        });

        return (
          <div key={layer.id}>
            <button
              type="button"
              onClick={() => toggleLayer(layer.id)}
              className={cn(
                "flex w-full items-center gap-2 px-4 py-1.5 text-sm transition-colors min-w-0",
                isLayerActive && isCollapsed
                  ? "text-white"
                  : "text-white/55 hover:text-white hover:bg-white/5"
              )}
            >
              <ChevronRight
                size={12}
                className={cn("flex-shrink-0 transition-transform", !isCollapsed && "rotate-90")}
              />
              <span
                className="h-4 w-4 rounded border border-white/15 flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${layer.color}18` }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: layer.color }}
                />
              </span>
              <span className="truncate flex-1 text-left">{layer.label}</span>
              {layer.badge && <NavBadgePill badge={layer.badge} />}
              <NavCount
                value={layerNavCountTotal(layer, countsBySegment)}
                show={showCounts}
              />
            </button>

            {!isCollapsed && (
              <div className="mb-0.5">
                {items.map((item) => (
                  <RepoNavItemRow
                    key={item.segment}
                    item={item}
                    layer={layer}
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

  const isViews = viewMode === "views";

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
        isViews
          ? "text-violet-300/50 hover:text-violet-100 hover:bg-violet-800/40"
          : "text-white/35 hover:text-white hover:bg-white/8"
      )}
    >
      {sidebarExpanded ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
    </button>
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-12 bottom-0 flex flex-col z-40 transition-[width] duration-200 overflow-hidden",
        isViews
          ? "bg-violet-950/90 border-r border-violet-800/40"
          : "sidebar border-r border-white/10",
        sidebarExpanded ? "w-[200px]" : "w-[52px]"
      )}
    >
      {/* ── Header row with toggle ── */}
      <div
        className={cn(
          "flex items-center flex-shrink-0 border-b h-10",
          isViews ? "border-violet-800/40" : "border-white/8",
          sidebarExpanded ? "px-3 justify-between" : "justify-center"
        )}
      >
        {sidebarExpanded && (
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wider select-none",
              isViews ? "text-violet-300/50" : "text-white/30"
            )}
          >
            {isViews ? "Views" : "Repository"}
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
        <div className={cn("border-t py-1", isViews ? "border-violet-800/40" : "border-white/10")}>
          <Link
            href={settingsHref}
            className={cn(
              "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
              isViews
                ? isOnSettings
                  ? "bg-violet-500/30 text-violet-100"
                  : "text-violet-300/50 hover:text-violet-100 hover:bg-violet-800/40"
                : isOnSettings
                  ? "bg-white/10 text-white"
                  : "text-white/45 hover:text-white hover:bg-white/5"
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
