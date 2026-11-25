"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { FlowList } from "@/components/integration/FlowList";
import { ApiList } from "@/components/integration/ApiList";
import { EventList } from "@/components/integration/EventList";
import { IntegrationInfraList } from "@/components/integration/IntegrationInfraList";
import { CreateFlowPanel } from "@/components/integration/CreateFlowPanel";
import { CreateApiPanel } from "@/components/integration/CreateApiPanel";
import { CreateEventPanel } from "@/components/integration/CreateEventPanel";
import { CreateIntegrationInfraPanel } from "@/components/integration/CreateIntegrationInfraPanel";
import { useTenancy } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import {
  CONNECTIONS_TYPE_LABEL,
  connectionsPath,
  type ConnectionsType,
} from "@/lib/model-legacy-paths";
import { cn } from "@/lib/utils";

const TYPES: ConnectionsType[] = ["flows", "apis", "events", "tools"];

function asType(value: string | null): ConnectionsType | "all" {
  if (value && (TYPES as string[]).includes(value)) return value as ConnectionsType;
  return "all";
}

export function ConnectionsHub() {
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { canCreate } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = asType(searchParams.get("type"));
  const open = searchParams.get("open");
  const catalog = useModelCatalog();
  const queryClient = useQueryClient();
  const items = catalog.data?.connections ?? [];
  const matches = (itemType: string, wanted: ConnectionsType) =>
    labelFor(itemType) === CONNECTIONS_TYPE_LABEL[wanted] ||
    itemType === wanted ||
    itemType === wanted.slice(0, -1) ||
    (wanted === "flows" && itemType === "integration_flow") ||
    (wanted === "tools" && itemType === "tool");
  const filtered = type === "all" ? items : items.filter((item) => matches(item.type, type));
  const count = (wanted: ConnectionsType) => {
    const map: Record<ConnectionsType, string> = {
      flows: "integration_flow",
      apis: "api",
      events: "event",
      tools: "tool",
    };
    return items.filter((item) => item.type === map[wanted] || String(item.type) === wanted).length;
  };
  const setType = (next: ConnectionsType | "all") => {
    router.replace(connectionsPath(basePath, next === "all" ? null : next, open));
  };

  const hrefFor = (itemType: string, id: string) => {
    if (itemType === "api") return `${basePath}/integration/apis?open=${encodeURIComponent(id)}`;
    if (itemType === "event") return `${basePath}/integration/events?open=${encodeURIComponent(id)}`;
    if (itemType === "tool") return `${basePath}/integration/tools?open=${encodeURIComponent(id)}`;
    return `${basePath}/integration/flows?open=${encodeURIComponent(id)}`;
  };

  const [creating, setCreating] = useState<ConnectionsType | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const startCreate = (wanted: ConnectionsType) => {
    setMenuOpen(false);
    setCreating(wanted);
  };

  const onCreated = (wanted: ConnectionsType) => {
    setCreating(null);
    if (orgSlug && workspaceSlug) {
      void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    }
    if (type === "all") router.replace(connectionsPath(basePath, wanted));
  };

  return (
    <div className="px-6 py-5" data-testid="connections-hub">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">HOW SYSTEMS TALK</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            Connections <span className="text-[14px] font-normal text-[#8b90a0]">{items.length}</span>
          </h1>
          <p className="mt-1 text-[13px] text-[#6b7289]">Flows, APIs, events, and integration infrastructure in one list.</p>
        </div>
        {canCreate && !open && (
          <AddConnectionButton
            type={type}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            onPick={startCreate}
          />
        )}
      </div>
      <div className="mb-4 inline-flex items-center rounded-lg bg-[#f3f4f8] p-0.5" role="tablist" aria-label="Connection type">
        <FilterChip label={`All ${items.length}`} on={type === "all"} onClick={() => setType("all")} />
        {TYPES.map((item) => (
          <FilterChip
            key={item}
            label={`${CONNECTIONS_TYPE_LABEL[item]} ${count(item)}`}
            on={type === item}
            onClick={() => setType(item)}
          />
        ))}
      </div>

      {open && type === "flows" ? <FlowList /> : null}
      {open && type === "apis" ? <ApiList /> : null}
      {open && type === "events" ? <EventList /> : null}
      {open && type === "tools" ? <IntegrationInfraList /> : null}
      {!open && (
        <div className="divide-y divide-[#f0f1f5] overflow-hidden rounded-xl border border-[#e6e8ee]">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-[#8b90a0]">No connections yet.</p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => (type === "all" ? setMenuOpen(true) : startCreate(type))}
                  className="mt-2 text-[13px] font-medium text-[#5b4ce6] hover:underline"
                >
                  {addLabel(type)}
                </button>
              )}
            </div>
          )}
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={hrefFor(item.type, item.id)}
              className="flex items-center justify-between px-4 py-3 text-[13px] hover:bg-[#fafafb]"
            >
              <span className="font-medium text-[#1c2230]">{item.name}</span>
              <span className="text-[#8b90a0]">{labelFor(item.type)}</span>
            </Link>
          ))}
        </div>
      )}

      {creating === "flows" && (
        <CreateFlowPanel onClose={() => setCreating(null)} onSuccess={() => onCreated("flows")} />
      )}
      {creating === "apis" && (
        <CreateApiPanel onClose={() => setCreating(null)} onSuccess={() => onCreated("apis")} />
      )}
      {creating === "events" && (
        <CreateEventPanel onClose={() => setCreating(null)} onSuccess={() => onCreated("events")} />
      )}
      {creating === "tools" && (
        <CreateIntegrationInfraPanel onClose={() => setCreating(null)} onSuccess={() => onCreated("tools")} />
      )}
    </div>
  );
}

function addLabel(type: ConnectionsType | "all"): string {
  if (type === "all") return "Add a connection";
  if (type === "apis") return "Add an API";
  if (type === "tools") return "Add integration infra";
  if (type === "events") return "Add an event";
  return "Add a flow";
}

function AddConnectionButton({
  type,
  menuOpen,
  setMenuOpen,
  onPick,
}: {
  type: ConnectionsType | "all";
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onPick: (type: ConnectionsType) => void;
}) {
  if (type !== "all") {
    return (
      <button
        type="button"
        data-testid="connections-add"
        onClick={() => onPick(type)}
        className="inline-flex items-center gap-1 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
      >
        <Plus size={14} /> Add
      </button>
    );
  }
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="connections-add"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen(!menuOpen)}
        className="inline-flex items-center gap-1 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
      >
        <Plus size={14} /> Add
      </button>
      {menuOpen && (
        <div role="menu" data-testid="connections-add-menu" className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[#e6e8ee] bg-white py-1 shadow-lg">
          {TYPES.map((item) => (
            <button
              key={item}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f6f7f9]"
              onClick={() => onPick(item)}
            >
              {item === "apis" ? "API" : item === "tools" ? "Integration infra" : item === "events" ? "Event" : "Flow"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function labelFor(type: string): string {
  if (type === "integration_flow" || type === "flow" || type === "flows") return "Flow";
  if (type === "api" || type === "apis") return "API";
  if (type === "event" || type === "events") return "Event";
  if (type === "tool" || type === "tools") return "Integration infra";
  return type.replace(/_/g, " ");
}

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-md px-3 text-[12.5px]",
        on ? "bg-white font-semibold text-[#1c2230] shadow-sm" : "font-medium text-[#4b5163]",
      )}
    >
      {label}
    </button>
  );
}

