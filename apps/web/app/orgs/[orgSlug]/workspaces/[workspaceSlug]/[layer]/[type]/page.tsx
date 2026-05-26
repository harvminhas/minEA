"use client";

import { use, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { ObjectCard } from "@/components/objects/ObjectCard";
import { ObjectDetail } from "@/components/objects/ObjectDetail";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { CapabilityMapPage } from "@/components/capability-map/CapabilityMapPage";
import { OBJECT_TYPE_LABELS, type ObjectType, type MinEAObject } from "@minea/types";
import { getLayerColor } from "@/lib/utils";

const PATH_TO_TYPE: Record<string, ObjectType> = {
  capabilities: "capability",
  "value-streams": "value_stream",
  applications: "application",
  solutions: "solution",
  "tech-capabilities": "technical_capability",
  agents: "agent",
  "data-objects": "data_object",
  "data-stores": "data_store",
  apis: "api",
  events: "event",
  flows: "integration_flow",
  tools: "tool",
  "cloud-services": "cloud_service",
  models: "model",
};

const LAYER_LABELS: Record<string, string> = {
  strategy: "Strategy Layer",
  business: "Business Layer",
  application: "Application Layer",
  data: "Data Layer",
  integration: "Integration Layer",
  infrastructure: "Infrastructure Layer",
};

export default function ObjectListPage({ params }: { params: Promise<{ layer: string; type: string }> }) {
  const { layer, type: typePath } = use(params);

  if (layer === "business" && typePath === "capabilities") {
    return (
      <div className="flex flex-col h-full">
        <CapabilityMapPage />
      </div>
    );
  }

  return <RepositoryObjectList layer={layer} typePath={typePath} />;
}

function RepositoryObjectList({ layer, typePath }: { layer: string; typePath: string }) {
  const objectType = PATH_TO_TYPE[typePath] ?? (typePath as ObjectType);
  const layerColor = getLayerColor(layer === "business" && typePath === "capabilities" ? "strategy" : layer);
  const layerLabel = LAYER_LABELS[layer === "business" && typePath === "capabilities" ? "strategy" : layer] ?? layer;
  const typeLabel =
    layer === "application" && typePath === "applications"
      ? "System"
      : OBJECT_TYPE_LABELS[objectType] ?? objectType;
  const typeLabelPlural =
    layer === "application" && typePath === "applications" ? "Systems" : `${typeLabel}s`;

  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { orgSlug, workspaceSlug } = useTenancy();

  const [search, setSearch] = useState("");
  const [selectedObject, setSelectedObject] = useState<MinEAObject | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, objectType],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: objectType }, token!);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, objectType] });
      setSelectedObject(null);
    },
  });

  const objects: MinEAObject[] = data?.items ?? [];
  const filtered = search
    ? objects.filter((o: MinEAObject) => o.name.toLowerCase().includes(search.toLowerCase()))
    : objects;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ backgroundColor: `${layerColor}20`, color: layerColor }}
          >
            {layerLabel}
          </span>
          <h1 className="text-lg font-semibold text-gray-900">{typeLabelPlural}</h1>
          {data && (
            <span className="text-sm text-gray-400">
              {data.total} {data.total === 1 ? "record" : "records"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search objects..."
              className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm mb-3">No {typeLabel.toLowerCase()}s found.</p>
            <button onClick={() => setShowForm(true)} className="text-indigo-600 hover:underline text-sm">
              Add the first one →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((obj) => (
              <ObjectCard
                key={obj.id}
                object={obj}
                layerColor={layerColor}
                onClick={() => setSelectedObject(obj)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedObject && (
        <ObjectDetail
          object={selectedObject}
          onClose={() => setSelectedObject(null)}
          onDelete={() => deleteMutation.mutate(selectedObject.id)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, objectType] });
            setSelectedObject(null);
          }}
        />
      )}

      {showForm && (
        <ObjectForm
          objectType={objectType}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, objectType] });
          }}
        />
      )}
    </div>
  );
}
