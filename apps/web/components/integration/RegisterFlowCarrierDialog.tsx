"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { integrationInfraToolsQueryKey } from "@/lib/integration-infra-carriers";
import { buildIntegrationInfraProperties, INFRA_KINDS } from "@/lib/integration-infra-utils";

interface Props {
  onClose: () => void;
  onCreated: (carrierId: string) => void;
}

export function RegisterFlowCarrierDialog({ onClose, onCreated }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [kind, setKind] = useState("ipaas");
  const [error, setError] = useState<string | null>(null);

  const flowKinds = INFRA_KINDS.filter((k) =>
    ["ipaas", "etl_elt", "transport"].includes(k.value)
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");

      const properties = buildIntegrationInfraProperties({
        kind,
        kindOther: "",
        handles: ["flows"],
        vendor: "",
        vendorProduct: "",
        hostingModel: "saas",
        region: "",
        environments: [],
        adminUrl: "",
        licenseModel: "flat_enterprise",
        contractRenewal: "",
        annualCost: "",
        slaTarget: "99_9",
        lifecycle: "active",
        criticality: "low",
      });

      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "tool",
          name: trimmed,
          status: "active",
          properties: properties as Record<string, unknown>,
        },
        token
      );
    },
    onSuccess: (carrier) => {
      queryClient.invalidateQueries({
        queryKey: integrationInfraToolsQueryKey(orgSlug, workspaceSlug),
      });
      onCreated(carrier.id);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not create integration infrastructure"),
  });

  return createPortal(
    <>
      <div className="fixed inset-0 z-[220] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[230] w-full max-w-sm bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">New flow infrastructure</h3>
            <p className="text-xs text-gray-400 mt-0.5">Quick-add a carrier for integration flows</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. MuleSoft (prod)"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {flowKinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40"
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
