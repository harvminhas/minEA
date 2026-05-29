"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Cpu, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddProviderDialog } from "@/components/infrastructure/AddProviderDialog";
import {
  buildRuntimeProperties,
  collectCustomProviders,
  lifecycleToStatus,
  PLATFORM_CRITICALITY,
  PLATFORM_LIFECYCLE,
  PLATFORM_SLA,
  RUNTIME_COST_MODEL,
  RUNTIME_HOSTING,
  RUNTIME_KINDS,
  RUNTIME_PROVIDERS,
  statusToLifecycle,
} from "@/lib/runtime-utils";
import type { MinEAObject, ModelProperties } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
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

function initFromRuntime(runtime?: MinEAObject) {
  const props = (runtime?.properties ?? {}) as ModelProperties;
  return {
    name: runtime?.name ?? "",
    description: runtime?.description ?? "",
    tags: (runtime?.tags ?? []).join(", "),
    kind: props.compute_runtime_kind ?? "kubernetes",
    provider: props.runtime_provider ?? "aws",
    serviceProduct: props.service_product ?? "",
    hostingModel: props.hosting_model ?? "public_cloud",
    region: props.region ?? "",
    environments: props.environments ?? [],
    consoleUrl: props.console_url ?? "",
    costModel: props.cost_model ?? "per_vcpu_memory",
    commitmentEnds: props.commitment_ends ?? "",
    annualCost: props.annual_cost ?? "",
    slaTarget: props.sla_target ?? "99_9",
    lifecycle: props.lifecycle ?? statusToLifecycle(runtime?.status),
    criticality: props.criticality ?? "low",
    owner: runtime?.owner ?? "",
  };
}

export function CreateRuntimePanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromRuntime(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(init.name);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [kind, setKind] = useState<string>(init.kind);
  const [provider, setProvider] = useState<string>(init.provider);
  const [serviceProduct, setServiceProduct] = useState(init.serviceProduct);
  const [hostingModel, setHostingModel] = useState<string>(init.hostingModel);
  const [region, setRegion] = useState(init.region);
  const [environments, setEnvironments] = useState<string[]>(init.environments);
  const [envInput, setEnvInput] = useState("");
  const [consoleUrl, setConsoleUrl] = useState(init.consoleUrl);
  const [costModel, setCostModel] = useState<string>(init.costModel);
  const [commitmentEnds, setCommitmentEnds] = useState(init.commitmentEnds);
  const [annualCost, setAnnualCost] = useState(init.annualCost);
  const [slaTarget, setSlaTarget] = useState<string>(init.slaTarget);
  const [lifecycle, setLifecycle] = useState<string>(init.lifecycle);
  const [criticality, setCriticality] = useState<string>(init.criticality);
  const [owner, setOwner] = useState(init.owner);
  const [error, setError] = useState<string | null>(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [sessionProviders, setSessionProviders] = useState<string[]>([]);

  useEffect(() => setMounted(true), []);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

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
        provider,
        serviceProduct,
        hostingModel,
        region,
        environments,
        consoleUrl,
        costModel,
        commitmentEnds,
        annualCost,
        slaTarget,
        lifecycle,
        criticality,
      }),
    [
      kind,
      provider,
      serviceProduct,
      hostingModel,
      region,
      environments,
      consoleUrl,
      costModel,
      commitmentEnds,
      annualCost,
      slaTarget,
      lifecycle,
      criticality,
    ]
  );

  const canSubmit =
    name.trim().length > 0 && kind.trim().length > 0 && provider.trim().length > 0 && owner.trim().length > 0;

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

      return objectsApi.create(orgSlug, workspaceSlug, { type: "model", ...body }, token);
    },
    onSuccess: (runtime) => onSuccess(runtime.id),
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} runtime`),
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
              {isEdit ? "Edit runtime" : "New runtime"}
            </h2>
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
            <section>
              <FieldLabel required>Kind</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {RUNTIME_KINDS.map((k) => (
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
                    placeholder="e.g. EKS prod (eu-west-1)"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <FieldLabel required>Provider</FieldLabel>
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
                          {RUNTIME_PROVIDERS.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </optgroup>
                        {customProviders.length > 0 && (
                          <optgroup label="Custom providers">
                            {customProviders.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {provider &&
                          !RUNTIME_PROVIDERS.some((p) => p.value === provider) &&
                          !customProviders.includes(provider) && (
                            <option value={provider}>{provider}</option>
                          )}
                        <option value="__add_provider__">+ Add provider</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                        ▾
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Service / product</FieldLabel>
                    <input
                      value={serviceProduct}
                      onChange={(e) => setServiceProduct(e.target.value)}
                      placeholder="e.g. EKS"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What runs here? Any deployment patterns?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>

                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="prod, eu, multi-tenant"
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
                    <SelectField value={hostingModel} onChange={setHostingModel} options={RUNTIME_HOSTING} />
                  </div>
                  <div>
                    <FieldLabel>Region</FieldLabel>
                    <input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="e.g. eu-west-1"
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
                  <FieldLabel>Console / admin URL</FieldLabel>
                  <input
                    value={consoleUrl}
                    onChange={(e) => setConsoleUrl(e.target.value)}
                    placeholder="https://console.aws.amazon.com/eks/..."
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
                    <FieldLabel>Cost model</FieldLabel>
                    <SelectField value={costModel} onChange={setCostModel} options={RUNTIME_COST_MODEL} />
                  </div>
                  <div>
                    <FieldLabel>Commitment ends</FieldLabel>
                    <input
                      value={commitmentEnds}
                      onChange={(e) => setCommitmentEnds(e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Annual cost (est.)</FieldLabel>
                  <input
                    value={annualCost}
                    onChange={(e) => setAnnualCost(e.target.value)}
                    placeholder="e.g. $180,000"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Consumption-based costs may be approximate
                  </p>
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
                    list="runtime-owner-options"
                    placeholder="Search team…"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <datalist id="runtime-owner-options">
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
            {saveMutation.isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save"
                : "Create runtime"}
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
