"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { syncFlowCarrierRelationship } from "@/lib/flow-relationship-utils";
import { refreshObjectRelationshipQueries } from "@/lib/relationship-query-utils";
import {
  buildFlowProperties,
  flowFormStateFromFlow,
  FlowFormContent,
  type FlowFormState,
} from "@/components/integration/FlowFormContent";
import type { FlowEndpointRef, IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: (flowId: string) => void;
  initialFrom?: FlowEndpointRef | null;
  initialTo?: FlowEndpointRef | null;
  initialName?: string;
  lockFrom?: boolean;
}

export function CreateFlowPanel({
  initialValues,
  onClose,
  onSuccess,
  initialFrom = null,
  initialTo = null,
  initialName = "",
  lockFrom = false,
}: Props) {
  const isEdit = !!initialValues;
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formState, setFormState] = useState<FlowFormState>(() =>
    initialValues
      ? flowFormStateFromFlow(initialValues)
      : {
          name: initialName,
          description: "",
          from: initialFrom,
          to: initialTo,
          mechanism: "manual",
          manualOwner: "",
          manualTrigger: "per_transaction",
          schedule: "",
          platform: "",
          carrier: null,
        }
  );

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (isEdit || !initialFrom) return;
    setFormState((prev) => ({ ...prev, from: initialFrom }));
  }, [initialFrom, isEdit]);
  useEffect(() => {
    if (isEdit || !initialTo) return;
    setFormState((prev) => ({ ...prev, to: initialTo }));
  }, [initialTo, isEdit]);
  useEffect(() => {
    if (isEdit || !initialName) return;
    setFormState((prev) => ({ ...prev, name: initialName }));
  }, [initialName, isEdit]);

  const canSubmit =
    formState.name.trim().length > 0 && !!formState.from && !!formState.to;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!formState.from || !formState.to) throw new Error("From and To are required");

      const previousCarrierId = isEdit
        ? (((initialValues?.properties ?? {}) as IntegrationFlowProperties).carrier?.carrier_id ??
          null)
        : null;
      const carrier = formState.carrier?.carrier_id ? formState.carrier : null;

      const body = {
        name: formState.name.trim(),
        description: formState.description.trim() || undefined,
        properties: buildFlowProperties(formState, { clearLegacy: isEdit, isEdit }) as IntegrationFlowProperties as Record<
          string,
          unknown
        >,
      };

      let flow: MinEAObject;
      if (isEdit && initialValues) {
        flow = await objectsApi.update(orgSlug, workspaceSlug, initialValues.id, body, token);
      } else {
        flow = await objectsApi.create(
          orgSlug,
          workspaceSlug,
          {
            type: "integration_flow",
            ...body,
            status: "planned",
          },
          token
        );
      }

      await syncFlowCarrierRelationship(orgSlug, workspaceSlug, flow.id, carrier, token);

      const carrierIds = new Set(
        [previousCarrierId, carrier?.carrier_id].filter(Boolean) as string[]
      );
      for (const carrierId of carrierIds) {
        await refreshObjectRelationshipQueries(
          queryClient,
          orgSlug,
          workspaceSlug,
          carrierId,
          token
        );
      }

      return flow;
    },
    onSuccess: (flow) => onSuccess(flow.id),
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} flow`),
  });

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className={cn("fixed inset-0 bg-black/25", isEdit ? "z-[115]" : "z-[100]")}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl flex flex-col",
          isEdit ? "z-[120]" : "z-[110]"
        )}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit flow" : "New flow"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              A record of how data actually moves from one point to another.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <FlowFormContent
            state={formState}
            onChange={(patch) => setFormState((prev) => ({ ...prev, ...patch }))}
            lockFrom={lockFrom || (!!initialFrom && !isEdit)}
          />

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSubmit || saveMutation.isPending}
            className="px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-md disabled:opacity-40 transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save" : "Create flow"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
