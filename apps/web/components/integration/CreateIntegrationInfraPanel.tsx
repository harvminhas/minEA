"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddVendorDialog } from "@/components/integration/AddVendorDialog";
import {
  buildIntegrationInfraProperties,
  collectCustomVendors,
  INFRA_HOSTING,
  INFRA_KINDS,
  INFRA_LICENSE,
  INFRA_VENDORS,
  lifecycleToStatus,
  PLATFORM_CRITICALITY,
  PLATFORM_LIFECYCLE,
  PLATFORM_SLA,
  statusToLifecycle,
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

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 pr-8"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
        ▾
      </span>
    </div>
  );
}

function initFromInfra(infra?: MinEAObject) {
  const props = (infra?.properties ?? {}) as ToolProperties;
  return {
    name: infra?.name ?? "",
    description: infra?.description ?? "",
    tags: (infra?.tags ?? []).join(", "),
    kind: props.integration_infra_kind ?? "ipaas",
    kindOther: props.integration_infra_kind_other ?? "",
    vendor: props.vendor ?? "salesforce_mulesoft",
    vendorProduct: props.vendor_product ?? "",
    hostingModel: props.hosting_model ?? "saas",
    region: props.region ?? "",
    environments: props.environments ?? [],
    adminUrl: props.admin_url ?? "",
    licenseModel: props.license_model ?? "per_vcore",
    contractRenewal: props.contract_renewal ?? "",
    annualCost: props.annual_cost ?? "",
    slaTarget: props.sla_target ?? "99_9",
    lifecycle: props.lifecycle ?? statusToLifecycle(infra?.status),
    criticality: props.criticality ?? "low",
    owner: infra?.owner ?? "",
  };
}

export function CreateIntegrationInfraPanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromInfra(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [kind, setKind] = useState<string>(init.kind);
  const [kindOther, setKindOther] = useState(init.kindOther);
  const [vendor, setVendor] = useState<string>(init.vendor);
  const [vendorProduct, setVendorProduct] = useState(init.vendorProduct);
  const [hostingModel, setHostingModel] = useState<string>(init.hostingModel);
  const [region, setRegion] = useState(init.region);
  const [environments, setEnvironments] = useState<string[]>(init.environments);
  const [envInput, setEnvInput] = useState("");
  const [adminUrl, setAdminUrl] = useState(init.adminUrl);
  const [licenseModel, setLicenseModel] = useState<string>(init.licenseModel);
  const [contractRenewal, setContractRenewal] = useState(init.contractRenewal);
  const [annualCost, setAnnualCost] = useState(init.annualCost);
  const [slaTarget, setSlaTarget] = useState<string>(init.slaTarget);
  const [lifecycle, setLifecycle] = useState<string>(init.lifecycle);
  const [criticality, setCriticality] = useState<string>(init.criticality);
  const [owner, setOwner] = useState(init.owner);
  const [error, setError] = useState<string | null>(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [sessionVendors, setSessionVendors] = useState<string[]>([]);

  useEffect(() => setMounted(true), []);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

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

  const properties = useMemo(
    () =>
      buildIntegrationInfraProperties({
        kind,
        kindOther,
        vendor,
        vendorProduct,
        hostingModel,
        region,
        environments,
        adminUrl,
        licenseModel,
        contractRenewal,
        annualCost,
        slaTarget,
        lifecycle,
        criticality,
      }),
    [
      kind,
      kindOther,
      vendor,
      vendorProduct,
      hostingModel,
      region,
      environments,
      adminUrl,
      licenseModel,
      contractRenewal,
      annualCost,
      slaTarget,
      lifecycle,
      criticality,
    ]
  );

  const canSubmit =
    name.trim().length > 0 &&
    kind.trim().length > 0 &&
    vendor.trim().length > 0 &&
    owner.trim().length > 0 &&
    (kind !== "custom" || kindOther.trim().length > 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!owner.trim()) throw new Error("Owner is required");

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        owner: owner.trim(),
        status: lifecycleToStatus(lifecycle),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: properties as Record<string, unknown>,
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

  const addEnvironment = () => {
    const trimmed = envInput.trim().toLowerCase();
    if (!trimmed || environments.includes(trimmed)) return;
    setEnvironments((list) => [...list, trimmed]);
    setEnvInput("");
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={cn("fixed inset-0 bg-black/25", isEdit ? "z-[115]" : "z-[100]")} onClick={onClose} />

      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl flex flex-col overflow-hidden",
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
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 pb-8 space-y-7">
            <section>
              <FieldLabel required>Kind</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {INFRA_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "text-left rounded-lg border px-3 py-2.5 transition-colors",
                      kind === k.value
                        ? "border-slate-500 bg-slate-50 ring-1 ring-slate-500"
                        : "border-gray-200 hover:border-slate-300"
                    )}
                  >
                    <span className="text-sm font-medium text-gray-900 block">{k.label}</span>
                    <span className="text-[11px] text-gray-400 mt-0.5 block">{k.hint}</span>
                  </button>
                ))}
              </div>
              {kind === "custom" && (
                <div className="mt-3">
                  <FieldLabel required>Custom kind</FieldLabel>
                  <input
                    value={kindOther}
                    onChange={(e) => setKindOther(e.target.value)}
                    placeholder="Describe the carrier type"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              )}
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
                    placeholder="e.g. MuleSoft Anypoint (prod)"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
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
                        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 pr-8"
                      >
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
                      placeholder="e.g. Anypoint Platform"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this used for in our integration landscape?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="ipaas, strategic, eu"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Deployment</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel>Hosting model</FieldLabel>
                    <SelectField value={hostingModel} onChange={setHostingModel} options={INFRA_HOSTING} />
                  </div>
                  <div>
                    <FieldLabel>Region</FieldLabel>
                    <input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="e.g. EU-West"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Environments</FieldLabel>
                  <div className="rounded-lg border border-gray-200 min-h-[44px] p-2.5 flex flex-wrap gap-1.5 items-center">
                    {environments.map((env) => (
                      <span
                        key={env}
                        className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full"
                      >
                        {env}
                        <button
                          type="button"
                          onClick={() => setEnvironments((list) => list.filter((e) => e !== env))}
                          className="opacity-60 hover:opacity-100"
                          aria-label={`Remove ${env}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    <div className="inline-flex items-center gap-1">
                      <input
                        value={envInput}
                        onChange={(e) => setEnvInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addEnvironment();
                          }
                        }}
                        placeholder="prod"
                        className="w-16 text-xs border-0 focus:outline-none focus:ring-0 px-1 py-0.5"
                      />
                      <button
                        type="button"
                        onClick={addEnvironment}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 border border-dashed border-slate-300 px-2 py-0.5 rounded-full hover:bg-slate-50 transition-colors"
                      >
                        <Plus size={12} />
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <FieldLabel>Admin URL / endpoint</FieldLabel>
                  <input
                    value={adminUrl}
                    onChange={(e) => setAdminUrl(e.target.value)}
                    placeholder="https://anypoint.mulesoft.com/..."
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Where operators go to manage runs, monitor health, and configure
                  </p>
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Contract</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel>License model</FieldLabel>
                    <SelectField value={licenseModel} onChange={setLicenseModel} options={INFRA_LICENSE} />
                  </div>
                  <div>
                    <FieldLabel>Contract renewal</FieldLabel>
                    <input
                      value={contractRenewal}
                      onChange={(e) => setContractRenewal(e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Annual cost</FieldLabel>
                  <input
                    value={annualCost}
                    onChange={(e) => setAnnualCost(e.target.value)}
                    placeholder="e.g. $320,000"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Governance</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <FieldLabel required>Owner (team)</FieldLabel>
                  <input
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    list="infra-owner-options"
                    placeholder="Search team…"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <datalist id="infra-owner-options">
                    {(teamsData?.items ?? []).map((team) => (
                      <option key={team.id} value={team.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <FieldLabel>SLA target</FieldLabel>
                  <SelectField value={slaTarget} onChange={setSlaTarget} options={PLATFORM_SLA} />
                </div>
                <div>
                  <FieldLabel>Lifecycle</FieldLabel>
                  <SelectField value={lifecycle} onChange={setLifecycle} options={PLATFORM_LIFECYCLE} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Criticality</FieldLabel>
                  <SelectField value={criticality} onChange={setCriticality} options={PLATFORM_CRITICALITY} />
                </div>
              </div>
            </section>

            <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <ArrowLeftRight size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Integrations running on this infrastructure appear on the detail page.
              </p>
            </div>

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
            className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-700 text-white rounded-md disabled:bg-slate-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save"
                : "Create infrastructure"}
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
