"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { applyCatalogWrite } from "@/lib/use-model-catalog";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { VendorField } from "@/components/mvp/VendorField";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddProviderDialog } from "@/components/infrastructure/AddProviderDialog";
import {
  buildRuntimeProperties,
  collectCustomProviders,
  isBareMetalRuntimeKind,
  lifecycleToStatus,
  PLATFORM_CRITICALITY,
  PLATFORM_LIFECYCLE,
  PLATFORM_SLA,
  RUNTIME_COST_MODEL,
  RUNTIME_HOSTING,
  RUNTIME_KINDS,
  RUNTIME_PROVIDERS,
} from "@/lib/runtime-utils";
import type { ModelProperties } from "@minea/types";
import { SECTION_LABEL, createFormSeed, groupCreateFields } from "@/lib/fields/registry";
import { cn } from "@/lib/utils";

interface Props {
  initialName?: string;
  onClose: () => void;
  onSuccess: (runtimeId: string) => void;
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

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-400 mt-1">{children}</p>;
}

export function CreateRuntimePanel({ initialName = "", onClose, onSuccess }: Props) {
  const seed = createFormSeed("server");

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [kind, setKind] = useState(seed.kind);
  const [vendor, setVendor] = useState(seed.vendor);
  const [provider, setProvider] = useState(seed.provider);
  const [serviceProduct, setServiceProduct] = useState("");
  const [hostingModel, setHostingModel] = useState(seed.hosting_model);
  const [region, setRegion] = useState("");
  const [environments, setEnvironments] = useState<string[]>([]);
  const [envInput, setEnvInput] = useState("");
  const [accessMethod, setAccessMethod] = useState("");
  const [costModel, setCostModel] = useState(seed.cost_model);
  const [commitmentEnds, setCommitmentEnds] = useState("");
  const [annualCost, setAnnualCost] = useState("");
  const [slaTarget, setSlaTarget] = useState(seed.sla_target);
  const [lifecycle, setLifecycle] = useState(seed.lifecycle);
  const [criticality, setCriticality] = useState(seed.criticality);
  const ownership = useOwnershipForm();
  const [error, setError] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [sessionProviders, setSessionProviders] = useState<string[]>([]);

  useEffect(() => setMounted(true), []);

  const { data: runtimesData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "compute_runtime"],
    queryFn: async () => {
      const token = await getToken();
      const result = await objectsApi.list(orgSlug, workspaceSlug, { type: "model" }, token!);
      return {
        ...result,
        items: result.items.filter((t) => (t.properties as ModelProperties).compute_runtime_kind != null),
      };
    },
    enabled,
  });

  const customProviders = useMemo(() => {
    const fromItems = collectCustomProviders(runtimesData?.items ?? []);
    return [...new Set([...fromItems, ...sessionProviders])];
  }, [runtimesData, sessionProviders]);

  const properties = useMemo(
    () =>
      buildRuntimeProperties({
        kind,
        vendor,
        provider,
        serviceProduct,
        hostingModel,
        region,
        environments,
        accessMethod,
        costModel,
        commitmentEnds,
        annualCost,
        slaTarget,
        lifecycle,
        criticality,
      }),
    [
      kind,
      vendor,
      provider,
      serviceProduct,
      hostingModel,
      region,
      environments,
      accessMethod,
      costModel,
      commitmentEnds,
      annualCost,
      slaTarget,
      lifecycle,
      criticality,
    ]
  );

  const canSubmit =
    name.trim().length > 0 && kind.trim().length > 0 && provider.trim().length > 0 && ownership.isValid;

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

      return objectsApi.create(orgSlug, workspaceSlug, { type: "model", ...body }, token);
    },
    onSuccess: (runtime) => {
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: runtime });
      onSuccess(runtime.id);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not create runtime"),
  });

  const addEnvironment = () => {
    const trimmed = envInput.trim().toLowerCase();
    if (!trimmed || environments.includes(trimmed)) return;
    setEnvironments((list) => [...list, trimmed]);
    setEnvInput("");
  };

  const applyBareMetalDefaults = () => {
    setHostingModel("on_premise");
    setProvider("self_hosted");
    setCostModel("capex");
  };

  const selectKind = (value: string) => {
    setKind(value);
    if (isBareMetalRuntimeKind(value)) {
      applyBareMetalDefaults();
    }
  };

  const namePlaceholder = isBareMetalRuntimeKind(kind)
    ? "e.g. AS/400 (Fastener Systems site)"
    : "e.g. EKS prod (eu-west-1)";

  const serviceProductPlaceholder = isBareMetalRuntimeKind(kind)
    ? "e.g. IBM AS/400"
    : "e.g. EKS";

  const locationPlaceholder = isBareMetalRuntimeKind(kind)
    ? "e.g. HQ data closet"
    : "e.g. eu-west-1";

  const textClass =
    "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500";

  const renderRuntimeField = (key: string, label: string): ReactNode => {
    switch (key) {
      case "name":
        return (
          <div>
            <FieldLabel required>{label}</FieldLabel>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} className={textClass} />
          </div>
        );
      case "compute_runtime_kind":
        return (
          <div>
            <FieldLabel required>{label}</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              {RUNTIME_KINDS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectKind(item.value)}
                  className={cn(
                    "text-left rounded-lg border px-3 py-2.5 transition-colors",
                    kind === item.value ? "border-slate-500 bg-slate-50 ring-1 ring-slate-500" : "border-gray-200 hover:border-slate-300"
                  )}
                >
                  <span className="text-sm font-medium text-gray-900 block">{item.label}</span>
                  <span className="text-[11px] text-gray-400 mt-0.5 block">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case "service_product":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={serviceProduct} onChange={(e) => setServiceProduct(e.target.value)} placeholder={serviceProductPlaceholder} className={textClass} />
          </div>
        );
      case "tags":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="prod, eu, multi-tenant" className={textClass} />
          </div>
        );
      case "owner":
        return <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />;
      case "vendor":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <VendorField value={vendor} onChange={setVendor} placeholder="Start typing a vendor" className={textClass} />
          </div>
        );
      case "runtime_provider":
        return (
          <div>
            <FieldLabel required>{label}</FieldLabel>
            <div className="relative">
              <select
                value={provider}
                onChange={(e) => {
                  if (e.target.value === "__add_provider__") {
                    setShowAddProvider(true);
                    return;
                  }
                  setProvider(e.target.value);
                }}
                className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 pr-8"
              >
                <optgroup label="Providers">
                  {RUNTIME_PROVIDERS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </optgroup>
                {customProviders.length > 0 && (
                  <optgroup label="Custom providers">
                    {customProviders.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </optgroup>
                )}
                {provider && !RUNTIME_PROVIDERS.some((item) => item.value === provider) && !customProviders.includes(provider) && (
                  <option value={provider}>{provider}</option>
                )}
                <option value="__add_provider__">+ Add provider</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
            </div>
          </div>
        );
      case "cost":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={annualCost} onChange={(e) => setAnnualCost(e.target.value)} placeholder="e.g. $180,000 or support fee" className={textClass} />
          </div>
        );
      case "cost_model":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <SelectField value={costModel} onChange={setCostModel} options={RUNTIME_COST_MODEL} allowEmpty />
            <FieldHint>Consumption-based costs may be approximate</FieldHint>
          </div>
        );
      case "commitment_ends":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={commitmentEnds} onChange={(e) => setCommitmentEnds(e.target.value)} placeholder="YYYY-MM-DD" className={textClass} />
          </div>
        );
      case "region":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={locationPlaceholder} className={textClass} />
            <FieldHint>Cloud region or physical site</FieldHint>
          </div>
        );
      case "hosting_model":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <SelectField value={hostingModel} onChange={setHostingModel} options={RUNTIME_HOSTING} allowEmpty />
            <FieldHint>Who owns and shares the infrastructure</FieldHint>
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
      case "access_method":
        return (
          <div>
            <FieldLabel>{label}</FieldLabel>
            <input value={accessMethod} onChange={(e) => setAccessMethod(e.target.value)} placeholder="e.g. 5250 terminal session, VPN, https://console…" className={textClass} />
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What runs here? Any deployment patterns?" rows={3} className={`${textClass} resize-none`} />
          </div>
        );
      default:
        return null;
    }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/25" onClick={onClose} />

      <div className="fixed right-0 top-0 z-[110] flex h-full w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New runtime</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Compute or hosting where components and integrations run
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-5 pb-8 space-y-7">
            {groupCreateFields("server").map((group) => (
              <section key={group.section} className="space-y-3">
                {(group.section === "cost" || group.section === "hosting" || group.section === "lifecycle") && (
                  <SectionHeader>{SECTION_LABEL[group.section]}</SectionHeader>
                )}
                {group.fields.map((field) => (
                  <div key={field.key}>{renderRuntimeField(field.key, field.label)}</div>
                ))}
              </section>
            ))}

            <div className="flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Cpu size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-700">
                Components and integrations running here appear on the detail page.
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
            {saveMutation.isPending ? "Creating…" : "Create runtime"}
          </button>
        </div>
      </div>

      {showAddProvider && (
        <AddProviderDialog
          onClose={() => setShowAddProvider(false)}
          onAdded={(providerName) => {
            setSessionProviders((list) => [...list, providerName]);
            setProvider(providerName);
            setShowAddProvider(false);
          }}
        />
      )}
    </>,
    document.body
  );
}
