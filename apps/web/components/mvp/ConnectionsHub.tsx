"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FlowList } from "@/components/integration/FlowList";
import { ApiList } from "@/components/integration/ApiList";
import { EventList } from "@/components/integration/EventList";
import { IntegrationInfraList } from "@/components/integration/IntegrationInfraList";
import { useTenancy } from "@/lib/tenancy";
import {
  CONNECTIONS_TYPE_LABEL,
  connectionsPath,
  type ConnectionsType,
} from "@/lib/model-legacy-paths";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { cn } from "@/lib/utils";

const TYPES: ConnectionsType[] = ["flows", "apis", "events", "tools"];

function asType(value: string | null): ConnectionsType | "all" {
  if (value && (TYPES as string[]).includes(value)) return value as ConnectionsType;
  return "all";
}

export function ConnectionsHub() {
  const { basePath } = useTenancy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = asType(searchParams.get("type"));
  const catalog = useModelCatalog();
  const items = catalog.data?.connections ?? [];
  const matches = (itemType: string, wanted: ConnectionsType) => labelFor(itemType) === CONNECTIONS_TYPE_LABEL[wanted] || itemType === wanted || itemType === wanted.slice(0, -1) || (wanted === "flows" && itemType === "integration_flow") || (wanted === "tools" && itemType === "tool");
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
    const open = searchParams.get("open");
    router.replace(connectionsPath(basePath, next === "all" ? null : next, open));
  };

  const hrefFor = (itemType: string, id: string) => {
    if (itemType === "api") return `${basePath}/integration/apis?open=${encodeURIComponent(id)}`;
    if (itemType === "event") return `${basePath}/integration/events?open=${encodeURIComponent(id)}`;
    if (itemType === "tool") return `${basePath}/integration/tools?open=${encodeURIComponent(id)}`;
    return `${basePath}/integration/flows?open=${encodeURIComponent(id)}`;
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

      {searchParams.get("open") && type === "flows" ? <FlowList /> : null}
      {searchParams.get("open") && type === "apis" ? <ApiList /> : null}
      {searchParams.get("open") && type === "events" ? <EventList /> : null}
      {searchParams.get("open") && type === "tools" ? <IntegrationInfraList /> : null}
      {!searchParams.get("open") && (
        <div className="divide-y divide-[#f0f1f5] overflow-hidden rounded-xl border border-[#e6e8ee]">
          {filtered.length === 0 && <p className="px-4 py-8 text-[13px] text-[#8b90a0]">No connections yet.</p>}
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
