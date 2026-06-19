"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import type { MinEAObject, TechDebtProperties } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { OwnershipDetailRow } from "@/components/ownership/OwnershipDetailRow";
import {
  DetailPanel,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { DetailObjectActions } from "@/components/ui/DetailObjectActions";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { usePermissions } from "@/lib/use-permissions";
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
  const { canEdit, canDelete } = usePermissions();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const props = (techDebt.properties ?? {}) as TechDebtProperties;
  const typeLabel = techDebtTypeLabel(props);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, techDebt.id, token!);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onDelete();
    },
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
            <DetailObjectActions
              onClose={onClose}
              onEdit={() => setShowEditForm(true)}
              onDelete={() => setShowDeleteConfirm(true)}
              deletePending={deleteMutation.isPending}
              editLabel="Edit tech debt"
              deleteLabel="Delete tech debt"
            />
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
          <OwnershipDetailRow entity={techDebt} />
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

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete tech debt"
          message={`Are you sure you want to delete "${techDebt.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {canEdit && showEditForm && (
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
