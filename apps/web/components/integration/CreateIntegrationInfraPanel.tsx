"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddVendorDialog } from "@/components/integration/AddVendorDialog";
import {
  buildIntegrationInfraProperties,
  collectCustomVendors,
  defaultHandlesForKind,
  INFRA_HANDLES,
  INFRA_HOSTING,
  INFRA_KINDS,
  INFRA_VENDORS,
  lifecycleToStatus,
  statusToLifecycle,
  type IntegrationInfraHandle,
} from "@/lib/integration-infra-utils";
import type { MinEAObject, ToolProperties } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: (infraId: string) => void;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function initFromInfra(infra?: MinEAObject) {
  const props = (infra?.properties ?? {}) as ToolProperties;
  const kind = props.integration_infra_kind ?? "";
  return {
    name: infra?.name ?? "",
    description: infra?.description ?? "",
    tags: (infra?.tags ?? []).join(", "),
    kind,
    kindOther: props.integration_infra_kind_other ?? "",
    handles:
      props.integration_infra_handles ??
      (kind ? defaultHandlesForKind(kind) : ([] as IntegrationInfraHandle[])),
    vendor: props.vendor ?? "",
    vendorProduct: props.vendor_product ?? "",
    hostingModel: props.hosting_model ?? "saas",
    region: props.region ?? "",
    existingProps: props,
    lifecycle: props.lifecycle ?? statusToLifecycle(infra?.status),
    owner: infra?.owner ?? "",
  };
}

export function CreateIntegrationInfraPanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromInfra(initialValues);
  const ownership = useOwnershipForm(init);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [kind, setKind] = useState(init.kind);
  const [kindOther, setKindOther] = useState(init.kindOther);
  const [handles, setHandles] = useState<IntegrationInfraHandle[]>(init.handles);
  const [vendor, setVendor] = useState(init.vendor);
  const [vendorProduct, setVendorProduct] = useState(init.vendorProduct);
  const [hostingModel, setHostingModel] = useState<
    NonNullable<ToolProperties["hosting_model"]>
  >((init.hostingModel as NonNullable<ToolProperties["hosting_model"]>) ?? "saas");
  const [region, setRegion] = useState(init.region);
  const [error, setError] = useState<string | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [sessionVendors, setSessionVendors] = useState<string[]>([]);

  useEffect(() => setMounted(true), []);

  const { data: toolsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "integration_infra"],
    queryFn: async () => {
      const token = await getToken();
      const result = await objectsApi.list(orgSlug, workspaceSlug, { type: "tool" }, token!);
      return {
        ...result,
        items: result.items.filter(
          (t) => (t.properties as ToolProperties).integration_infra_kind != null
        ),
      };
    },
    enabled,
  });

  const customVendors = useMemo(() => {
    const fromItems = collectCustomVendors(toolsData?.items ?? []);
    return [...new Set([...fromItems, ...sessionVendors])];
  }, [toolsData, sessionVendors]);

  const updateKind = (value: string) => {
    setKind(value);
    setHandles(value ? defaultHandlesForKind(value) : []);
  };

  const toggleHandle = (handle: IntegrationInfraHandle) => {
    setHandles((prev) =>
      prev.includes(handle) ? prev.filter((h) => h !== handle) : [...prev, handle]
    );
  };

  const canSubmit =
    name.trim().length > 0 &&
    kind.trim().length > 0 &&
    vendor.trim().length > 0 &&
    handles.length > 0 &&
    (kind !== "custom" || kindOther.trim().length > 0) &&
    ownership.isValid;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const baseProps = buildIntegrationInfraProperties({
        kind,
        kindOther,
        handles,
        vendor,
        vendorProduct,
        hostingModel,
        region,
        environments: init.existingProps.environments ?? [],
        adminUrl: init.existingProps.admin_url ?? "",
        licenseModel: init.existingProps.license_model ?? "per_vcore",
        contractRenewal: init.existingProps.contract_renewal ?? "",
        annualCost: init.existingProps.annual_cost ?? "",
        slaTarget: init.existingProps.sla_target ?? "99_9",
        lifecycle: init.lifecycle,
        criticality: init.existingProps.criticality ?? "low",
      });

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        ...ownership.toPayload(),
        status: lifecycleToStatus(init.lifecycle),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        properties: baseProps as Record<string, unknown>,
      };

      if (isEdit && initialValues) {
        return objectsApi.update(orgSlug, workspaceSlug, initialValues.id, body, token);
      }

      return objectsApi.create(orgSlug, workspaceSlug, { type: "tool", ...body }, token);
    },
    onSuccess: (infra) => onSuccess(infra.id),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} infrastructure`
      ),
  });

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={cn("fixed inset-0 bg-black/25", isEdit ? "z-[115]" : "z-[100]")} onClick={onClose} />

      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl flex flex-col overflow-hidden",
          isEdit ? "z-[120]" : "z-[110]"
        )}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit integration infrastructure" : "New integration infrastructure"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              A carrier that moves data — not an endpoint
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

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 pb-8 space-y-7">
            <section>
              <SectionHeader>Kind</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Kind</FieldLabel>
                  <div className="relative">
                    <select
                      value={kind}
                      onChange={(e) => updateKind(e.target.value)}
                      className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                    >
                      <option value="">Select kind...</option>
                      {INFRA_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                      ▾
                    </span>
                  </div>
                </div>

                {kind === "custom" && (
                  <div>
                    <FieldLabel required>Custom kind</FieldLabel>
                    <input
                      value={kindOther}
                      onChange={(e) => setKindOther(e.target.value)}
                      placeholder="Describe the carrier type"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                )}

                <div>
                  <FieldLabel>Handles</FieldLabel>
                  <p className="text-[11px] text-gray-400 mb-2">
                    Which integration objects can link to this carrier
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {INFRA_HANDLES.map((h) => {
                      const on = handles.includes(h.value);
                      return (
                        <button
                          key={h.value}
                          type="button"
                          onClick={() => toggleHandle(h.value)}
                          disabled={!kind}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                            on
                              ? "bg-teal-50 text-teal-800 border-teal-300 ring-1 ring-teal-200"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-300",
                            !kind && "opacity-40 cursor-not-allowed"
                          )}
                        >
                          {h.label}
                        </button>
                      );
                    })}
                  </div>
                  {kind && handles.length === 0 && (
                    <p className="text-[11px] text-amber-600 mt-1.5">
                      Select at least one handle so APIs, events, and flows can find this carrier.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Identity</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Name</FieldLabel>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Apigee prod"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel required>Vendor</FieldLabel>
                    <div className="relative">
                      <select
                        value={vendor}
                        onChange={(e) => {
                          if (e.target.value === "__add_vendor__") {
                            setShowAddVendor(true);
                            return;
                          }
                          setVendor(e.target.value);
                        }}
                        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                      >
                        <option value="">Select vendor...</option>
                        <optgroup label="Vendors">
                          {INFRA_VENDORS.map((v) => (
                            <option key={v.value} value={v.value}>
                              {v.label}
                            </option>
                          ))}
                        </optgroup>
                        {customVendors.length > 0 && (
                          <optgroup label="Custom vendors">
                            {customVendors.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {vendor &&
                          !INFRA_VENDORS.some((v) => v.value === vendor) &&
                          !customVendors.includes(vendor) && (
                            <option value={vendor}>{vendor}</option>
                          )}
                        <option value="__add_vendor__">+ Add vendor</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                        ▾
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Vendor product</FieldLabel>
                    <input
                      value={vendorProduct}
                      onChange={(e) => setVendorProduct(e.target.value)}
                      placeholder="e.g. Apigee X"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this used for in your integration landscape?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. strategic, eu, prod"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Deployment</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel>Hosting model</FieldLabel>
                  <div className="relative">
                    <select
                      value={hostingModel}
                      onChange={(e) =>
                        setHostingModel(
                          e.target.value as NonNullable<ToolProperties["hosting_model"]>
                        )
                      }
                      className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                    >
                      {INFRA_HOSTING.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                      ▾
                    </span>
                  </div>
                </div>
                <div>
                  <FieldLabel>Region</FieldLabel>
                  <input
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="e.g. EU-West"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Governance</SectionHeader>
              <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />
            </section>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2 flex-shrink-0 bg-white">
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
            className="px-4 py-2 text-sm text-gray-700 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>

      {showAddVendor && (
        <AddVendorDialog
          onClose={() => setShowAddVendor(false)}
          onAdded={(vendorName) => {
            setSessionVendors((list) => [...list, vendorName]);
            setVendor(vendorName);
            setShowAddVendor(false);
          }}
        />
      )}
    </>,
    document.body
  );
}
