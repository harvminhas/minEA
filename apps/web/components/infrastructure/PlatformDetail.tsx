"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Edit2, Layers, Trash2 } from "lucide-react";
import type { CloudServiceProperties, MinEAObject } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { CreatePlatformPanel } from "@/components/infrastructure/CreatePlatformPanel";
import {
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_HOSTING_LABEL,
  PLATFORM_LICENSE_LABEL,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_SLA_LABEL,
  PLATFORM_VENDOR_LABEL,
  platformTypeLabel,
  TECHNOLOGY_LAYER_COLOR,
} from "@/lib/platform-utils";

interface Props {
  platform: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function PlatformDetail({ platform, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const [showEditForm, setShowEditForm] = useState(false);

  const props = (platform.properties ?? {}) as CloudServiceProperties;
  const typeLabel = platformTypeLabel(props);
  const vendorLabel = PLATFORM_VENDOR_LABEL[props.vendor ?? ""] ?? props.vendor;

  const { data: systemsData } = useQuery({
    queryKey: ["platform-systems", orgSlug, workspaceSlug, platform.id],
    queryFn: async () => {
      const token = await getToken();
      const [rels, apps] = await Promise.all([
        relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: platform.id }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!),
      ]);
      const relIds = new Set(
        rels
          .filter((r) => r.type === "runs_on" && r.from_type === "application")
          .map((r) => r.from_object_id)
      );
      return apps.items.filter((item) => relIds.has(item.id));
    },
    enabled,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, platform.id, token!);
    },
    onSuccess: onDelete,
  });

  const systems = systemsData ?? [];

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: TECHNOLOGY_LAYER_COLOR }}
              >
                <Layers size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{platform.name}</h2>
                <p className="text-sm text-gray-400">Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                aria-label="Edit platform"
              >
                <Edit2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="p-2 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600"
                aria-label="Delete platform"
              >
                <Trash2 size={15} />
              </button>
              <DetailPanelCloseButton onClose={onClose} />
            </div>
          </div>
        }
      >
        <DetailSection title="Identity">
          {typeLabel && <DetailRow label="Type" value={typeLabel} />}
          {vendorLabel && <DetailRow label="Vendor" value={vendorLabel} />}
          {props.vendor_product && <DetailRow label="Vendor product" value={props.vendor_product} />}
          {platform.description && <DetailRow label="Description" value={platform.description} />}
          {platform.tags.length > 0 && (
            <DetailRow label="Tags" value={platform.tags.join(", ")} />
          )}
        </DetailSection>

        <DetailSection title="Hosting">
          {props.hosting_model && (
            <DetailRow
              label="Hosting model"
              value={PLATFORM_HOSTING_LABEL[props.hosting_model] ?? props.hosting_model}
            />
          )}
          {props.region && <DetailRow label="Region" value={props.region} />}
          {props.environments && props.environments.length > 0 && (
            <DetailRow label="Environments" value={props.environments.join(", ")} />
          )}
          {props.admin_url && <DetailRow label="Admin URL" value={props.admin_url} />}
        </DetailSection>

        <DetailSection title="Contract">
          {props.license_model && (
            <DetailRow
              label="License model"
              value={PLATFORM_LICENSE_LABEL[props.license_model] ?? props.license_model}
            />
          )}
          {props.contract_renewal && (
            <DetailRow label="Contract renewal" value={props.contract_renewal} />
          )}
          {props.annual_cost && <DetailRow label="Annual cost" value={props.annual_cost} />}
        </DetailSection>

        <DetailSection title="Governance">
          {platform.owner && <DetailRow label="Owner" value={platform.owner} />}
          {props.sla_target && (
            <DetailRow label="SLA target" value={PLATFORM_SLA_LABEL[props.sla_target] ?? props.sla_target} />
          )}
          {props.lifecycle && (
            <DetailRow
              label="Lifecycle"
              value={PLATFORM_LIFECYCLE_LABEL[props.lifecycle] ?? props.lifecycle}
            />
          )}
          {props.criticality && (
            <DetailRow
              label="Criticality"
              value={PLATFORM_CRITICALITY_LABEL[props.criticality] ?? props.criticality}
            />
          )}
        </DetailSection>

        <DetailSection title="Systems on platform">
          {systems.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 pb-4">
              No systems reference this platform yet.
            </p>
          ) : (
            <ul className="px-6 pb-4 space-y-1.5">
              {systems.map((system) => (
                <li key={system.id} className="text-sm text-gray-700">
                  {system.name}
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </DetailPanel>

      {showEditForm && (
        <CreatePlatformPanel
          initialValues={platform}
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
