"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { linkSuppliedByVendor } from "@/lib/vendor-link";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
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
} from "@/lib/platform-utils";
import { SECTION_LABEL, createFormSeed, groupCreateFields } from "@/lib/fields/registry";

interface Props {
  initialName?: string;
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
  allowEmpty = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 pr-8"
      >
        {allowEmpty && <option value="">Not set</option>}
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

export function CreatePlatformPanel({ initialName = "", onClose, onSuccess }: Props) {
  const seed = createFormSeed("platform");

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [vendor, setVendor] = useState(seed.vendor);
  const [vendorProduct, setVendorProduct] = useState("");
  const [platformType, setPlatformType] = useState("low_code");
  const [platformTypeOther, setPlatformTypeOther] = useState("");
  const [hostingModel, setHostingModel] = useState(seed.hosting_model);
  const [region, setRegion] = useState("");
  const [environments, setEnvironments] = useState<string[]>([]);
  const [envInput, setEnvInput] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [licenseModel, setLicenseModel] = useState(seed.license_model);
  const [contractRenewal, setContractRenewal] = useState("");
  const [annualCost, setAnnualCost] = useState("");
  const [slaTarget, setSlaTarget] = useState(seed.sla_target);
  const [lifecycle, setLifecycle] = useState(seed.lifecycle);
  const [criticality, setCriticality] = useState(seed.criticality);
  const ownership = useOwnershipForm();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  const textClass =
    "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500";

  const renderPlatformField = (key: string, label: string): ReactNode => {
    switch (key) {
      case "name":
        return (
          <div>
            <FieldLabel required>{label}</FieldLabel>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Power Platform (corporate)" className={textClass} />
          </div>
        );
      case "platform_type":
        return (
          <div>
            <FieldLabel required>{label}</FieldLabel>
            <SelectField value={platformType} onChange={setPlatformType} options={PLATFORM_TYPES} />
          </div>
        );
      case "platform_type_other":
        if (platformType !== "other") return null;
        return (
          <div>
            <FieldLabel required>{label}</FieldLabel>
            <input value={platformTypeOther} onChange={(e) => setPlatformTypeOther(e.target.value)} placeholder="Describe the platform type" className={textClass} />
          </div>
        );
      case "vendor_product":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={vendorProduct} onChange={(e) => setVendorProduct(e.target.value)} placeholder="e.g. Power Platform" className={textClass} />
            <p className="text-[11px] text-gray-400 mt-1">If different from instance name</p>
          </div>
        );
      case "tags":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="low-code, microsoft, strategic" className={textClass} />
          </div>
        );
      case "owner":
        return <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />;
      case "vendor":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <SelectField value={vendor} onChange={setVendor} options={PLATFORM_VENDORS} allowEmpty />
          </div>
        );
      case "license_model":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <SelectField value={licenseModel} onChange={setLicenseModel} options={PLATFORM_LICENSE} allowEmpty />
          </div>
        );
      case "cost":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={annualCost} onChange={(e) => setAnnualCost(e.target.value)} placeholder="e.g. $450,000" className={textClass} />
          </div>
        );
      case "contract_renewal":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={contractRenewal} onChange={(e) => setContractRenewal(e.target.value)} placeholder="YYYY-MM-DD" className={textClass} />
          </div>
        );
      case "hosting_model":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <SelectField value={hostingModel} onChange={setHostingModel} options={PLATFORM_HOSTING} allowEmpty />
          </div>
        );
      case "region":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. East US" className={textClass} />
          </div>
        );
      case "environments":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <div className="rounded-lg border border-gray-200 min-h-[44px] p-2.5 flex flex-wrap gap-1.5 items-center">
              {environments.map((env) => (
                <span key={env} className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full">
                  {env}
                  <button type="button" onClick={() => setEnvironments((list) => list.filter((item) => item !== env))} className="opacity-60 hover:opacity-100" aria-label={`Remove ${env}`}>
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
                <button type="button" onClick={addEnvironment} className="inline-flex items-center gap-1 text-xs text-slate-600 border border-dashed border-slate-300 px-2 py-0.5 rounded-full hover:bg-slate-50 transition-colors">
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>
          </div>
        );
      case "admin_url":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={adminUrl} onChange={(e) => setAdminUrl(e.target.value)} placeholder="https://admin.powerplatform.microsoft.com/..." className={textClass} />
          </div>
        );
      case "lifecycle":
      case "criticality":
      case "sla_target":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <SelectField
              value={key === "lifecycle" ? lifecycle : key === "criticality" ? criticality : slaTarget}
              onChange={key === "lifecycle" ? setLifecycle : key === "criticality" ? setCriticality : setSlaTarget}
              options={key === "lifecycle" ? PLATFORM_LIFECYCLE : key === "criticality" ? PLATFORM_CRITICALITY : PLATFORM_SLA}
              allowEmpty
            />
          </div>
        );
      case "description":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this platform used for in our org?" rows={3} className={`${textClass} resize-none`} />
          </div>
        );
      default:
        return null;
    }
  };

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
    platformType.trim().length > 0 &&
    ownership.isValid &&
    (platformType !== "other" || platformTypeOther.trim().length > 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!ownership.isValid) throw new Error("Owner is required");

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        ...ownership.toPayload(),
        ...(lifecycle ? { status: lifecycleToStatus(lifecycle) } : {}),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: properties as Record<string, unknown>,
      };

      const created = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "cloud_service", ...body },
        token
      );
      await linkSuppliedByVendor({
        queryClient,
        orgSlug,
        workspaceSlug,
        token,
        source: created,
        vendorRaw: vendor,
        objects: catalog.data?.objects ?? [],
      });
      return created;
    },
    onSuccess: (platform) => {
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: platform });
      onSuccess(platform.id);
    },
    onError: (err) =>
      setError(
        err instanceof Error ? err.message : "Could not create platform"
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
      <div className="fixed inset-0 z-[100] bg-black/25" onClick={onClose} />

      <div className="fixed right-0 top-0 z-[110] flex h-full w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New platform</h2>
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
            {groupCreateFields("platform").map((group) => (
              <section key={group.section} className="space-y-3">
                {(group.section === "cost" || group.section === "hosting" || group.section === "lifecycle") && (
                  <SectionHeader>{SECTION_LABEL[group.section]}</SectionHeader>
                )}
                {group.fields.map((field) => {
                  if (field.showIf && !field.showIf({ properties: { platform_type: platformType }, type: "cloud_service" })) return null;
                  return <div key={field.key}>{renderPlatformField(field.key, field.label)}</div>;
                })}
              </section>
            ))}

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
            {saveMutation.isPending ? "Creating…" : "Create platform"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
