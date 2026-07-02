"use client";

import { useState } from "react";
import { OwnershipDetailRow } from "@/components/ownership/OwnershipDetailRow";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Edit2, X } from "lucide-react";
import { DomainRollupPanel } from "@/components/data/DomainRollupPanel";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { buildDetailPropertyRows } from "@/lib/object-property-display";
import { getObjectInitial } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";

interface Props {
  object: MinEAObject;
  layerColor: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function DataDomainObjectDetail({ object, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { canEdit } = usePermissions();
  const [showEditForm, setShowEditForm] = useState(false);

  const { data: liveObject } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, object.id],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, object.id, token!);
    },
    initialData: object,
  });

  const detail = liveObject ?? object;
  const props = detail.properties as Record<string, unknown>;
  const detailPropertyRows = buildDetailPropertyRows(props, detail.type);
  const rollup = detail.domain_rollup ?? { entities: [], stores: [], systems: [] };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[80]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-[90] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-600 flex items-center justify-center text-white font-bold">
              {getObjectInitial(detail.name)}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{detail.name}</h2>
              <p className="text-sm text-gray-400">{OBJECT_TYPE_LABELS[detail.type]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setShowEditForm(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Edit2 size={14} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {detail.description && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Description
              </h3>
              <p className="text-sm text-gray-700">{detail.description}</p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Properties</h3>
            <div className="space-y-2 text-sm">
              <OwnershipDetailRow entity={detail} />
            </div>
          </div>

          {detailPropertyRows.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {OBJECT_TYPE_LABELS[detail.type]} Details
              </h3>
              <div className="space-y-2 text-sm">
                {detailPropertyRows.map((row) => (
                  <div key={row.key} className="flex items-start justify-between gap-4">
                    <span className="text-gray-400 flex-shrink-0">{row.label}</span>
                    <span className="text-gray-800 font-medium text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-gray-400 mb-4">
              Domains are passive groupings. Assign entities and stores to this domain from their own
              records; systems are inferred from those assignments.
            </p>
            <DomainRollupPanel rollup={rollup} />
          </div>
        </div>

        <div className="border-t border-gray-100 px-6 py-3">
          <p className="text-xs text-gray-400">
            Updated {new Date(detail.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {showEditForm && (
        <ObjectForm
          objectType={detail.type}
          initialValues={detail}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            onUpdate();
          }}
        />
      )}
    </>
  );
}
