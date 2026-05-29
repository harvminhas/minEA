"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Layers, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  buildPlatformProperties,
  lifecycleToStatus,
  PLATFORM_CRITICALITY,
  PLATFORM_HOSTING,
  PLATFORM_LICENSE,
  PLATFORM_LIFECYCLE,
  PLATFORM_SLA,
  PLATFORM_TYPES,
  PLATFORM_VENDORS,
  statusToLifecycle,
} from "@/lib/platform-utils";
import type { CloudServiceProperties, MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: (platformId: string) => void;
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

function initFromPlatform(platform?: MinEAObject) {
  const props = (platform?.properties ?? {}) as CloudServiceProperties;
  return {
    name: platform?.name ?? "",
    description: platform?.description ?? "",
    tags: (platform?.tags ?? []).join(", "),
    vendor: props.vendor ?? "microsoft",
    vendorProduct: props.vendor_product ?? "",
    platformType: props.platform_type ?? "low_code",
    platformTypeOther: props.platform_type_other ?? "",
    hostingModel: props.hosting_model ?? "saas",
    region: props.region ?? "",
    environments: props.environments ?? [],
    adminUrl: props.admin_url ?? "",
    licenseModel: props.license_model ?? "per_user",
    contractRenewal: props.contract_renewal ?? "",
    annualCost: props.annual_cost ?? "",
    slaTarget: props.sla_target ?? "99_9",
    lifecycle: props.lifecycle ?? statusToLifecycle(platform?.status),
    criticality: props.criticality ?? "low",
    owner: platform?.owner ?? "",
  };
}

export function CreatePlatformPanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromPlatform(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [vendor, setVendor] = useState<string>(init.vendor);
  const [vendorProduct, setVendorProduct] = useState(init.vendorProduct);
  const [platformType, setPlatformType] = useState<string>(init.platformType);
  const [platformTypeOther, setPlatformTypeOther] = useState(init.platformTypeOther);
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

  useEffect(() => setMounted(true), []);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const properties = useMemo(
    () =>
      buildPlatformProperties({
        vendor,
        vendorProduct,
        platformType,
        platformTypeOther,
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
      vendor,
      vendorProduct,
      platformType,
      platformTypeOther,
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
    vendor.trim().length > 0 &&
    platformType.trim().length > 0 &&
    owner.trim().length > 0 &&
    (platformType !== "other" || platformTypeOther.trim().length > 0);

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

      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "cloud_service", ...body },
        token
      );
    },
    onSuccess: (platform) => onSuccess(platform.id),
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} platform`
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
              {isEdit ? "Edit platform" : "New platform"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              A foundation that other systems are built on
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
              <SectionHeader>Identity</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Name</FieldLabel>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Power Platform (corporate)"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel required>Vendor</FieldLabel>
                    <SelectField value={vendor} onChange={setVendor} options={PLATFORM_VENDORS} />
                  </div>
                  <div>
                    <FieldLabel>Vendor product</FieldLabel>
                    <input
                      value={vendorProduct}
                      onChange={(e) => setVendorProduct(e.target.value)}
                      placeholder="e.g. Power Platform"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">If different from instance name</p>
                  </div>
                </div>

                <div>
                  <FieldLabel required>Type</FieldLabel>
                  <SelectField value={platformType} onChange={setPlatformType} options={PLATFORM_TYPES} />
                </div>

                {platformType === "other" && (
                  <div>
                    <FieldLabel required>Other type</FieldLabel>
                    <input
                      value={platformTypeOther}
                      onChange={(e) => setPlatformTypeOther(e.target.value)}
                      placeholder="Describe the platform type"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                )}

                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What's this platform used for in our org?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="low-code, microsoft, strategic"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Hosting</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel>Hosting model</FieldLabel>
                    <SelectField value={hostingModel} onChange={setHostingModel} options={PLATFORM_HOSTING} />
                  </div>
                  <div>
                    <FieldLabel>Region</FieldLabel>
                    <input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="e.g. EU, US-East"
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
                  <FieldLabel>Admin URL</FieldLabel>
                  <input
                    value={adminUrl}
                    onChange={(e) => setAdminUrl(e.target.value)}
                    placeholder="https://admin.powerplatform.microsoft.com/..."
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Contract</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel>License model</FieldLabel>
                    <SelectField value={licenseModel} onChange={setLicenseModel} options={PLATFORM_LICENSE} />
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
                    placeholder="e.g. $450,000"
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
                    list="platform-owner-options"
                    placeholder="Search team…"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <datalist id="platform-owner-options">
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

            <div className="flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Layers size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700">
                Systems built on this platform appear on the detail page once they reference it.
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
                : "Create platform"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
