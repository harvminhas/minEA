"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Zap } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateEventPanel } from "@/components/integration/CreateEventPanel";
import { EventDetail } from "@/components/integration/EventDetail";
import {
  EVENT_DELIVERY_LABEL,
  formatProducerLabel,
  INTEGRATION_LAYER_COLOR,
} from "@/lib/event-utils";
import type { EventProperties, MinEAObject } from "@minea/types";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

const CRIT_COLOR: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-gray-100 text-gray-600",
};

function EventCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as EventProperties;
  const subCount = props.subscribers?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="text-left bg-white rounded-xl border border-gray-200 hover:border-teal-200 transition-colors w-full p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white flex-shrink-0"
          style={{ backgroundColor: INTEGRATION_LAYER_COLOR }}
        >
          <Zap size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate leading-tight">{item.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {props.topic && (
              <span className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded-full font-medium font-mono">
                {props.topic}
                {props.version ? ` ${props.version}` : ""}
              </span>
            )}
            {props.delivery && (
              <span className="text-[10px] text-gray-500">
                {EVENT_DELIVERY_LABEL[props.delivery] ?? props.delivery}
              </span>
            )}
            {props.criticality && (
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize",
                  CRIT_COLOR[props.criticality] ?? "bg-gray-100 text-gray-600"
                )}
              >
                {props.criticality}
              </span>
            )}
            {item.status && (
              <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize", getStatusColor(item.status))}>
                {getStatusLabel(item.status)}
              </span>
            )}
          </div>

          {props.producer && (
            <p className="text-[10px] text-gray-500 truncate mt-2">
              Producer: {formatProducerLabel(props.producer)}
            </p>
          )}

          {subCount > 0 && (
            <p className="text-[10px] text-gray-400 mt-1">
              {subCount} subscriber{subCount !== 1 ? "s" : ""}
            </p>
          )}

          {props.broker && (
            <p className="text-[10px] text-gray-400 truncate mt-1">Broker: {props.broker.broker_name}</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function EventList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const eventsQueryKey = ["objects", orgSlug, workspaceSlug, "event"] as const;

  const { data, isLoading } = useQuery({
    queryKey: eventsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "event" }, token!);
    },
    enabled,
  });

  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: eventsQueryKey });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${INTEGRATION_LAYER_COLOR}20`, color: INTEGRATION_LAYER_COLOR }}
          >
            Integration Layer
          </span>
          <h1 className="text-lg font-semibold text-gray-900">Events</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          New event
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-3">No events yet.</p>
            <button onClick={() => setShowCreate(true)} className="text-teal-600 hover:underline text-sm">
              Create the first event →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <EventCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateEventPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <EventDetail
          event={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            setSelectedId(null);
            refresh();
          }}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
