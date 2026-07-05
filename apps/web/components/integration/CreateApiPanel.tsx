"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { syncApiRelationships } from "@/lib/api-relationship-utils";
import { refreshObjectRelationshipQueries } from "@/lib/relationship-query-utils";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddConsumerDialog } from "@/components/integration/AddConsumerDialog";
import { ApiDiagramModal, type NodeLayout } from "@/components/integration/ApiDiagram";
import { ApiDiagramPreview } from "@/components/integration/ApiDiagramPreview";
import { PickProviderDialog } from "@/components/integration/PickProviderDialog";
import {
  API_AUDIENCES,
  API_AUTH,
  API_CRITICALITY,
  API_STATUSES,
  API_STYLES,
  buildApiDraft,
  formatProviderLabel,
  gatewayKeyFromRef,
  gatewayRefFromKey,
} from "@/lib/api-utils";
import {
  apiGatewayCarrierOptions,
  formatCarrierOptionLabel,
  infraCarrierFieldHint,
  integrationInfraToolsQueryKey,
} from "@/lib/integration-infra-carriers";
import type {
  ApiConsumerRef,
  ApiGatewayRef,
  ApiProperties,
  ApiProviderRef,
  MinEAObject,
  ObjectStatus,
} from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  initialName?: string;
  initialProvider?: ApiProviderRef | null;
  onClose: () => void;
  onSuccess: (apiId: string) => void;
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
  placeholder,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
      >
        {allowEmpty && <option value="">{placeholder ?? "None"}</option>}
        {!allowEmpty &&
          options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        {allowEmpty &&
          options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>
  );
}

function initFromApi(api?: MinEAObject) {
  const props = (api?.properties ?? {}) as ApiProperties;
  return {
    name: api?.name ?? "",
    description: api?.description ?? "",
    tags: (api?.tags ?? []).join(", "),
    protocol: props.protocol ?? "rest",
    version: props.version ?? "",
    baseUrl: props.base_url ?? "",
    auth: props.auth ?? "oauth2",
    provider: props.provider ?? null,
    consumers: props.consumers ?? [],
    gatewayKey: gatewayKeyFromRef(props.gateway ?? null),
    audience: props.audience ?? "internal",
    criticality: props.criticality ?? "low",
    owner: api?.owner ?? "",
    status: (api?.status ?? "planned") as ObjectStatus,
    draftLayout: props.node_layout ?? {},
  };
}

function consumerChipClass(consumer: ApiConsumerRef) {
  if (consumer.consumer_kind === "custom") {
    const lower = consumer.consumer_name.toLowerCase();
    if (lower.includes("partner")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  }
  return "bg-teal-50 text-teal-700 border-teal-100";
}

export function CreateApiPanel({
  initialValues,
  initialName = "",
  initialProvider = null,
  onClose,
  onSuccess,
}: Props) {
  const isEdit = !!initialValues;
  const init = initFromApi(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(isEdit ? init.name : initialName || init.name);
  const [description, setDescription] = useState(init.description);
  const [tags, setTags] = useState(init.tags);
  const [protocol, setProtocol] = useState<string>(init.protocol);
  const [version, setVersion] = useState(init.version);
  const [baseUrl, setBaseUrl] = useState(init.baseUrl);
  const [auth, setAuth] = useState<string>(init.auth);
  const [provider, setProvider] = useState<ApiProviderRef | null>(
    isEdit ? init.provider : initialProvider ?? init.provider
  );
  const [consumers, setConsumers] = useState<ApiConsumerRef[]>(init.consumers);
  const [gatewayKey, setGatewayKey] = useState(init.gatewayKey);
  const [audience, setAudience] = useState<string>(init.audience);
  const [criticality, setCriticality] = useState<string>(init.criticality);
  const ownership = useOwnershipForm(init);
  const [status, setStatus] = useState<ObjectStatus>(init.status);
  const [error, setError] = useState<string | null>(null);
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [showConsumerDialog, setShowConsumerDialog] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [draftLayout, setDraftLayout] = useState<NodeLayout>(init.draftLayout);

  useEffect(() => setMounted(true), []);

  const { data: infraToolsData } = useQuery({
    queryKey: integrationInfraToolsQueryKey(orgSlug, workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tool" }, token!);
    },
    enabled,
  });

  const registeredGateways = useMemo(
    () => apiGatewayCarrierOptions(infraToolsData?.items ?? []),
    [infraToolsData]
  );

  const selectedGateway: ApiGatewayRef | null = useMemo(() => {
    const ref = gatewayRefFromKey(gatewayKey, registeredGateways);
    if (ref) return ref;
    if (gatewayKey.startsWith("registered:") && initialValues) {
      const initGateway = ((initialValues.properties ?? {}) as ApiProperties).gateway;
      if (initGateway?.gateway_id === gatewayKey.slice(11)) return initGateway;
    }
    return null;
  }, [gatewayKey, registeredGateways, initialValues]);

  const draftApi = useMemo(
    () =>
      buildApiDraft({
        name,
        protocol,
        version,
        auth,
        provider,
        consumers,
        gateway: selectedGateway,
        audience,
        criticality,
        status,
        owner: ownership.toPayload().owner,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        nodeLayout: Object.keys(draftLayout).length > 0 ? draftLayout : undefined,
      }),
    [
      name,
      protocol,
      version,
      auth,
      provider,
      consumers,
      selectedGateway,
      audience,
      criticality,
      status,
      ownership.value,
      tags,
      draftLayout,
    ]
  );

  const canSubmit = name.trim().length > 0 && !!provider && ownership.isValid;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!provider) throw new Error("Provider is required");

      const existingLayout = ((initialValues?.properties ?? {}) as ApiProperties).node_layout;
      const properties: ApiProperties = {
        protocol: protocol as ApiProperties["protocol"],
        version: version.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        auth,
        provider,
        consumers,
        gateway: selectedGateway,
        audience: audience as ApiProperties["audience"],
        criticality: criticality as ApiProperties["criticality"],
        node_layout:
          Object.keys(draftLayout).length > 0 ? draftLayout : existingLayout,
      };

      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        ...ownership.toPayload(),
        status,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: properties as Record<string, unknown>,
      };

      const previousGatewayId = isEdit
        ? (((initialValues?.properties ?? {}) as ApiProperties).gateway?.gateway_id ?? null)
        : null;

      if (isEdit && initialValues) {
        const api = await objectsApi.update(
          orgSlug,
          workspaceSlug,
          initialValues.id,
          body,
          token
        );
        await syncApiRelationships(
          orgSlug,
          workspaceSlug,
          initialValues.id,
          provider,
          consumers,
          selectedGateway,
          token
        );
        return { api, previousGatewayId };
      }

      const api = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: "api", ...body },
        token
      );
      await syncApiRelationships(
        orgSlug,
        workspaceSlug,
        api.id,
        provider,
        consumers,
        selectedGateway,
        token
      );
      return { api, previousGatewayId: null };
    },
    onSuccess: async ({ api, previousGatewayId }) => {
      const token = await getToken();
      const nextGatewayId = ((api.properties ?? {}) as ApiProperties).gateway?.gateway_id ?? null;
      const gatewayIds = new Set(
        [previousGatewayId, nextGatewayId].filter(Boolean) as string[]
      );
      if (token) {
        for (const gatewayId of gatewayIds) {
          await refreshObjectRelationshipQueries(
            queryClient,
            orgSlug,
            workspaceSlug,
            gatewayId,
            token
          );
        }
      }
      await queryClient.invalidateQueries({
        queryKey: ["objects", orgSlug, workspaceSlug, "api", "infra-refs"],
      });
      onSuccess(api.id);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} API`),
  });

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={cn("fixed inset-0 bg-black/25", isEdit ? "z-[115]" : "z-[100]")} onClick={onClose} />

      <div className={cn(
        "fixed right-0 top-0 h-full w-full max-w-[560px] bg-white shadow-2xl flex flex-col",
        isEdit ? "z-[120]" : "z-[110]"
      )}>
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit API" : "Document API"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              A capability one provider exposes for others to call
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-7">
            <section>
              <SectionHeader>Provider &amp; consumers</SectionHeader>

              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <FieldLabel required>Provider</FieldLabel>
                  <button
                    type="button"
                    onClick={() => setShowProviderDialog(true)}
                    className={cn(
                      "w-full text-left rounded-lg border min-h-[88px] p-3 transition-colors",
                      provider
                        ? "border-gray-200 bg-white hover:border-teal-300"
                        : "border-dashed border-gray-300 bg-gray-50/50 hover:border-teal-300"
                    )}
                  >
                    {provider ? (
                      <span className="text-sm font-medium text-gray-800 truncate block">
                        {formatProviderLabel(provider)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Select system or component…</span>
                    )}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    The system or component exposing this API
                  </p>
                </div>

                <div className="flex flex-col items-center pt-7 flex-shrink-0 w-10">
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                    <ArrowLeft size={14} />
                  </div>
                  <span className="mt-1 text-[9px] font-semibold text-gray-400 whitespace-nowrap -rotate-0">
                    called by
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <FieldLabel>Consumers</FieldLabel>
                  <div className="rounded-lg border border-gray-200 min-h-[88px] p-3 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {consumers.map((c) => (
                        <span
                          key={c.consumer_id ?? c.consumer_name}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
                            consumerChipClass(c)
                          )}
                        >
                          {c.consumer_name}
                          <button
                            type="button"
                            onClick={() =>
                              setConsumers((list) =>
                                list.filter(
                                  (x) =>
                                    (x.consumer_id ?? x.consumer_name) !==
                                    (c.consumer_id ?? c.consumer_name)
                                )
                              )
                            }
                            className="opacity-60 hover:opacity-100"
                            aria-label={`Remove ${c.consumer_name}`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowConsumerDialog(true)}
                        className="inline-flex items-center gap-1 text-xs text-teal-600 border border-dashed border-teal-300 px-2 py-0.5 rounded-full hover:bg-teal-50 transition-colors"
                      >
                        <Plus size={12} />
                        Add consumer
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Leave empty for public APIs with unknown consumers
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <Info size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Endpoints and the entities they touch are configured after creation.
                </p>
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
                    placeholder="e.g. Orders API"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this API do?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="orders, public, v2"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Contract</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel>Style</FieldLabel>
                  <SelectField
                    value={protocol}
                    onChange={setProtocol}
                    options={API_STYLES}
                  />
                </div>
                <div>
                  <FieldLabel>Version</FieldLabel>
                  <input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g. v2"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Base URL</FieldLabel>
                  <input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/orders"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Auth</FieldLabel>
                  <SelectField value={auth} onChange={setAuth} options={API_AUTH} />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Infrastructure</SectionHeader>
              <div>
                <FieldLabel>Fronted by (gateway)</FieldLabel>
                <div className="relative">
                  <select
                    value={gatewayKey}
                    onChange={(e) => setGatewayKey(e.target.value)}
                    className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                  >
                    <option value="">— None / direct</option>
                    {registeredGateways.length > 0 && (
                      <optgroup label="Integration infrastructure">
                        {registeredGateways.map((g) => (
                          <option key={g.id} value={`registered:${g.id}`}>
                            {formatCarrierOptionLabel(g)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                    ▾
                  </span>
                </div>
                {(() => {
                  const hint = infraCarrierFieldHint("apis", registeredGateways.length > 0);
                  return (
                    <p
                      className={cn(
                        "text-[11px] mt-1.5",
                        hint.tone === "notice" ? "text-amber-700" : "text-gray-400"
                      )}
                    >
                      {hint.text}
                    </p>
                  );
                })()}
                <p className="text-[11px] text-gray-400 mt-1">
                  Where rate limits, auth, and routing are governed
                </p>
              </div>
            </section>

            <section>
              <SectionHeader>Architecture</SectionHeader>
              <p className="text-xs text-gray-400 mb-2">
                Preview updates as you assign provider, consumers, and gateway.
              </p>
              <ApiDiagramPreview api={draftApi} onExpand={() => setShowChart(true)} />
            </section>

            <section>
              <SectionHeader>Governance</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />
                </div>
                <div>
                  <FieldLabel>Lifecycle</FieldLabel>
                  <SelectField
                    value={status}
                    onChange={(v) => setStatus(v as ObjectStatus)}
                    options={API_STATUSES}
                  />
                </div>
                <div>
                  <FieldLabel>Audience</FieldLabel>
                  <SelectField
                    value={audience}
                    onChange={setAudience}
                    options={API_AUDIENCES}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Criticality</FieldLabel>
                  <SelectField
                    value={criticality}
                    onChange={setCriticality}
                    options={API_CRITICALITY}
                  />
                </div>
              </div>
            </section>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </div>
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
            className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40 transition-colors"
          >
            {saveMutation.isPending
              ? "Saving…"
              : isEdit
                ? "Save"
                : "Save documentation"}
          </button>
        </div>
      </div>

      {showProviderDialog && (
        <PickProviderDialog
          selected={provider}
          onClose={() => setShowProviderDialog(false)}
          onApply={(next) => {
            setProvider(next);
            setShowProviderDialog(false);
          }}
        />
      )}

      {showConsumerDialog && (
        <AddConsumerDialog
          selected={consumers}
          onClose={() => setShowConsumerDialog(false)}
          onApply={(next) => {
            setConsumers(next);
            setShowConsumerDialog(false);
          }}
        />
      )}

      {showChart && (
        <ApiDiagramModal
          api={draftApi}
          onClose={() => setShowChart(false)}
          onLayoutSave={setDraftLayout}
          onResetLayout={() => setDraftLayout({})}
        />
      )}

    </>,
    document.body
  );
}
