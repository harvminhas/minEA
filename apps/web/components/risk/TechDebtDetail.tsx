"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Edit2, Trash2 } from "lucide-react";
import type { MinEAObject, TechDebtProperties } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import {
  RISK_LAYER_COLOR,
  TECH_DEBT_EFFORT_LABEL,
  TECH_DEBT_SEVERITY_LABEL,
  TECH_DEBT_STATUS_LABEL,
  techDebtTypeLabel,
  targetResolutionLabel,
} from "@/lib/tech-debt-utils";

interface Props {
  techDebt: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

function affectsKindLabel(kind: string): string {
  if (kind === "application") return "System";
  if (kind === "component") return "Component";
  return "Product";
}

export function TechDebtDetail({ techDebt, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const [showEditForm, setShowEditForm] = useState(false);

  const props = (techDebt.properties ?? {}) as TechDebtProperties;
  const typeLabel = techDebtTypeLabel(props);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, techDebt.id, token!);
    },
    onSuccess: onDelete,
  });

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: RISK_LAYER_COLOR }}
              >
                <AlertTriangle size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{techDebt.name}</h2>
                <p className="text-sm text-gray-400">Tech debt</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                aria-label="Edit tech debt"
              >
                <Edit2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="p-2 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600"
                aria-label="Delete tech debt"
              >
                <Trash2 size={15} />
              </button>
              <DetailPanelCloseButton onClose={onClose} />
            </div>
          </div>
        }
      >
        <DetailSection title="Identity">
          {techDebt.description && <DetailRow label="Description" value={techDebt.description} />}
          {techDebt.tags.length > 0 && <DetailRow label="Tags" value={techDebt.tags.join(", ")} />}
        </DetailSection>

        <DetailSection title="Classification">
          {props.severity && (
            <DetailRow label="Severity" value={TECH_DEBT_SEVERITY_LABEL[props.severity] ?? props.severity} />
          )}
          {typeLabel && <DetailRow label="Type" value={typeLabel} />}
          {props.debt_status && (
            <DetailRow label="Status" value={TECH_DEBT_STATUS_LABEL[props.debt_status] ?? props.debt_status} />
          )}
        </DetailSection>

        <DetailSection title="Attachment">
          {props.affects && (
            <DetailRow
              label="Affects"
              value={`${props.affects.object_name} (${affectsKindLabel(props.affects.object_kind)})`}
            />
          )}
          {techDebt.owner && <DetailRow label="Owner" value={techDebt.owner} />}
          {props.identified_by && <DetailRow label="Identified by" value={props.identified_by} />}
        </DetailSection>

        <DetailSection title="Timeline">
          {props.target_resolution && (
            <DetailRow
              label="Target resolution"
              value={targetResolutionLabel(props.target_resolution)}
            />
          )}
          {props.effort_estimate !== undefined && props.effort_estimate !== "" && (
            <DetailRow
              label="Effort estimate"
              value={TECH_DEBT_EFFORT_LABEL[props.effort_estimate] ?? props.effort_estimate}
            />
          )}
        </DetailSection>
      </DetailPanel>

      {showEditForm && (
        <CreateTechDebtPanel
          initialValues={techDebt}
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
