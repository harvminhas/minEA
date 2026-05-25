"use client";

import { type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { getStatusColor, getStatusLabel, formatCurrency, getObjectInitial } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { relationshipsApi } from "@/lib/api-client";

interface Props {
  object: MinEAObject;
  layerColor: string;
  onClick?: () => void;
}

export function ObjectCard({ object, layerColor, onClick }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const { data: relationships } = useQuery({
    queryKey: ["relationships", "to", object.id],
    enabled: object.type === "application" && !!orgSlug,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: object.id }, token!);
    },
  });

  const supportedCapabilities = (relationships ?? []).filter((r) => r.type === "supported_by").length;
  const props = object.properties as Record<string, unknown>;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: layerColor }}
          >
            {getObjectInitial(object.name)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">{object.name}</p>
            {props.vendor != null && props.vendor !== "" && (
              <p className="text-xs text-gray-400">{String(props.vendor)}</p>
            )}
            {(props.vendor == null || props.vendor === "") && (
              <p className="text-xs text-gray-400">{OBJECT_TYPE_LABELS[object.type] ?? object.type}</p>
            )}
          </div>
        </div>
        {object.status && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 ${getStatusColor(object.status)}`}>
            {getStatusLabel(object.status)}
          </span>
        )}
      </div>

      {/* Properties */}
      <div className="space-y-1.5 text-xs">
        {!!props.category && (
          <PropertyRow label="Category" value={String(props.category)} />
        )}
        {props.annual_cost !== undefined && (
          <PropertyRow label="Annual cost" value={formatCurrency(Number(props.annual_cost))} />
        )}
        {object.type === "application" && (
          <PropertyRow label="Capabilities" value={String(supportedCapabilities)} />
        )}
        {object.owner && (
          <PropertyRow label="Owner" value={object.owner} />
        )}
        {!!props.maturity && (
          <PropertyRow label="Maturity" value={`${props.maturity} / 5`} />
        )}
        {!!props.classification && (
          <PropertyRow label="Classification" value={String(props.classification)} />
        )}
        {!!props.protocol && (
          <PropertyRow label="Protocol" value={String(props.protocol)} />
        )}
        {!!props.provider && (
          <PropertyRow label="Provider" value={String(props.provider)} />
        )}
        {!!props.store_type && (
          <PropertyRow label="Store type" value={String(props.store_type)} />
        )}
        {object.description && !props.category && props.annual_cost === undefined && (
          <p className="text-gray-500 line-clamp-2">{object.description}</p>
        )}
      </div>

      {/* Tags */}
      {object.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {object.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}
