"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Info, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { dataApi, objectsApi } from "@/lib/api-client";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { syncFlowCarrierRelationship } from "@/lib/flow-relationship-utils";
import { AddFlowEndpointDialog } from "@/components/integration/AddFlowEndpointDialog";
import {
  formatCarrierOptionLabel,
  infraCarrierFieldHint,
  integrationInfraCarrierOptions,
  integrationInfraToolsQueryKey,
} from "@/lib/integration-infra-carriers";
import {
  carrierRefFromKey,
  emptyEndpointSide,
  FLOW_AUTH,
  FLOW_CRITICALITY,
  FLOW_DIRECTIONS,
  FLOW_FORMATS,
  FLOW_FREQUENCIES,
  FLOW_PROTOCOLS,
  FLOW_STATUSES,
  groupSideChips,
  inheritedClassification,
  INTEGRATION_LAYER_COLOR,
  resolveSideEntities,
} from "@/lib/flow-utils";
import type { FlowEndpointSide, IntegrationFlowProperties, ObjectStatus } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  onSuccess: (flowId: string) => void;
}

// ─── Shared field primitives ─────────────────────────────────────────────────

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
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
    </div>
  );
}

// ─── Endpoint box ─────────────────────────────────────────────────────────────

function EndpointBox({
  label,
  side,
  required,
  onAdd,
  onRemoveSystem,
  onRemoveEntity,
}: {
  label: string;
  side: FlowEndpointSide;
  required?: boolean;
  onAdd: () => void;
  onRemoveSystem: (systemId: string) => void;
  onRemoveEntity: (entityId: string) => void;
}) {
  const groups = groupSideChips(side);
  const hasContent = groups.length > 0;

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </p>
      <div
        className={cn(
          "rounded-lg border min-h-[148px] p-3 flex flex-col gap-2 transition-colors",
          hasContent ? "border-gray-200 bg-white" : "border-dashed border-gray-300 bg-gray-50/50"
        )}
      >
        {/* Chip groups */}
        {groups.map((group) => (
          <div key={group.systemId}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {group.systemName}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <span
                  key={item.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                    item.wildcard
                      ? "bg-violet-50 border-violet-200 text-violet-700"
                      : "bg-white border-gray-200 text-gray-700"
                  )}
                >
                  {item.name}
                  <button
                    type="button"
                    onClick={() =>
                      item.wildcard ? onRemoveSystem(group.systemId) : onRemoveEntity(item.id)
                    }
                    className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                    aria-label={`Remove ${item.name}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* Add button */}
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            "mt-auto w-full rounded-md border border-dashed py-2 text-xs flex items-center justify-center gap-1 transition-colors",
            hasContent
              ? "border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600"
              : "border-gray-300 text-gray-400 hover:border-teal-400 hover:text-teal-600"
          )}
        >
          <Plus size={12} />
          Add {label.toLowerCase()} entity
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CreateFlowPanel({ onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  // Connection state
  const [sources, setSources] = useState<FlowEndpointSide>(emptyEndpointSide());
  const [destinations, setDestinations] = useState<FlowEndpointSide>(emptyEndpointSide());
  const [endpointDialog, setEndpointDialog] = useState<"source" | "destination" | null>(null);

  // Identity
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  // Transport
  const [direction, setDirection] = useState("one_way");
  const [protocol, setProtocol] = useState("rest_api");
  const [format, setFormat] = useState("json");
  const [frequency, setFrequency] = useState("realtime");
  const [auth, setAuth] = useState("oauth2");

  // Governance
  const ownership = useOwnershipForm();
  const [status, setStatus] = useState("planned");
  const [criticality, setCriticality] = useState("low");
  const [dataClassification, setDataClassification] = useState("inherited");
  const [carrierKey, setCarrierKey] = useState("");

  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const { data: catalog } = useQuery({
    queryKey: ["flow-endpoint-catalog", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getFlowEndpointCatalog(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const { data: infraToolsData } = useQuery({
    queryKey: integrationInfraToolsQueryKey(orgSlug, workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tool" }, token!);
    },
    enabled,
  });

  const flowCarriers = useMemo(
    () => integrationInfraCarrierOptions(infraToolsData?.items ?? [], "flows"),
    [infraToolsData]
  );

  const selectedCarrier = useMemo(
    () => carrierRefFromKey(carrierKey, flowCarriers),
    [carrierKey, flowCarriers]
  );

  const inherited = useMemo(() => {
    if (!catalog) return { level: "internal", piiLabels: [] as string[], hasWildcard: false };
    return inheritedClassification(sources, destinations, catalog);
  }, [catalog, sources, destinations]);

  const sourceCount = catalog ? resolveSideEntities(sources, catalog).length : sources.systems.length;
  const destCount = catalog ? resolveSideEntities(destinations, catalog).length : destinations.systems.length;

  // Systems are mandatory on both sides
  const canSubmit =
    name.trim().length > 0 &&
    sources.systems.length > 0 &&
    destinations.systems.length > 0 &&
    ownership.isValid;

  const classificationLabel = useMemo(() => {
    const base = dataClassification === "inherited" ? inherited.level : dataClassification;
    const label = base.charAt(0).toUpperCase() + base.slice(1);
    return dataClassification === "inherited" ? `${label} (inherited)` : label;
  }, [dataClassification, inherited.level]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const classification =
        dataClassification === "inherited" ? inherited.level : dataClassification;

      const properties: IntegrationFlowProperties = {
        direction: direction as IntegrationFlowProperties["direction"],
        protocol,
        format,
        frequency: frequency as IntegrationFlowProperties["frequency"],
        auth,
        criticality: criticality as IntegrationFlowProperties["criticality"],
        data_classification: classification,
        sources,
        destinations,
        carrier: selectedCarrier,
      };

      const flow = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "integration_flow",
          name: name.trim(),
          description: description.trim() || undefined,
          ...ownership.toPayload(),
          status: status as ObjectStatus,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          properties: properties as Record<string, unknown>,
        },
        token
      );

      if (selectedCarrier) {
        await syncFlowCarrierRelationship(
          orgSlug,
          workspaceSlug,
          flow.id,
          selectedCarrier,
          token
        );
      }

      // Create data links for resolved entities
      if (catalog) {
        const linkEntity = async (entityId: string, roleTag: "source" | "target") => {
          await dataApi.addEntityLink(orgSlug, workspaceSlug, entityId, {
            entity_kind: "integration_flow",
            entity_id: flow.id,
            link_kind: "moved_by",
            role_tag: roleTag,
          }, token);
        };
        for (const entity of resolveSideEntities(sources, catalog)) {
          await linkEntity(entity.id, "source");
        }
        for (const entity of resolveSideEntities(destinations, catalog)) {
          await linkEntity(entity.id, "target");
        }
      }

      return flow;
    },
    onSuccess: (flow) => onSuccess(flow.id),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not create flow"),
  });

  // Remove helpers
  const removeSrcSystem = (id: string) =>
    setSources((s) => ({ ...s, systems: s.systems.filter((x) => x.system_id !== id) }));
  const removeSrcEntity = (id: string) =>
    setSources((s) => ({ ...s, entities: s.entities.filter((x) => x.entity_id !== id) }));
  const removeDstSystem = (id: string) =>
    setDestinations((s) => ({ ...s, systems: s.systems.filter((x) => x.system_id !== id) }));
  const removeDstEntity = (id: string) =>
    setDestinations((s) => ({ ...s, entities: s.entities.filter((x) => x.entity_id !== id) }));

  const showInheritedBanner =
    sources.systems.length > 0 || destinations.systems.length > 0 || inherited.piiLabels.length > 0;

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[100] bg-black/25" onClick={onClose} />

      {/* Panel — right-side slide-over matching wireframe */}
      <div className="fixed right-0 top-0 h-full z-[110] w-full max-w-[560px] bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New flow</h2>
            <p className="text-xs text-gray-400 mt-0.5">Connect data entities across systems</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-7">

            {/* CONNECTION ───────────────────────────────────────────────── */}
            <section>
              <SectionHeader>Connection</SectionHeader>

              {/* Source / arrow / Destination */}
              <div className="flex items-start gap-2">
                <EndpointBox
                  label="Sources"
                  side={sources}
                  required
                  onAdd={() => setEndpointDialog("source")}
                  onRemoveSystem={removeSrcSystem}
                  onRemoveEntity={removeSrcEntity}
                />

                {/* Arrow badge */}
                <div className="flex flex-col items-center pt-7 flex-shrink-0 w-10">
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                    <ArrowRight size={14} />
                  </div>
                  {(sourceCount > 0 || destCount > 0) && (
                    <span className="mt-1 text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                      {sourceCount}→{destCount}
                    </span>
                  )}
                </div>

                <EndpointBox
                  label="Destinations"
                  side={destinations}
                  required
                  onAdd={() => setEndpointDialog("destination")}
                  onRemoveSystem={removeDstSystem}
                  onRemoveEntity={removeDstEntity}
                />
              </div>

              {/* Inherited classification banner */}
              {showInheritedBanner && (inherited.level === "restricted" || inherited.piiLabels.length > 0 || inherited.hasWildcard) && (
                <div className="mt-3 flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <Info size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-red-800">
                      Inherited classification: Restricted
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      {inherited.piiLabels.length > 0
                        ? `${inherited.piiLabels.join(" and ")} contain PII. Strictest level applies.`
                        : "Wildcard system selections may include sensitive entities. Strictest level applies."}
                    </p>
                  </div>
                </div>
              )}

              {/* Direction */}
              <div className="mt-4">
                <FieldLabel>Direction</FieldLabel>
                <SelectField value={direction} onChange={setDirection} options={FLOW_DIRECTIONS} />
              </div>

              {/* Field mapping note */}
              <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
                <Info size={12} className="text-gray-400 flex-shrink-0" />
                <p className="text-xs text-gray-500">
                  Field mapping will be configured after the flow is created.
                </p>
              </div>
            </section>

            {/* IDENTITY ────────────────────────────────────────────────── */}
            <section>
              <SectionHeader>Identity</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Name</FieldLabel>
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Customer 360 — CRM & billing to warehouse"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this flow do and why?"
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="crm, billing, customer-360"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </section>

            {/* INFRASTRUCTURE ───────────────────────────────────────────── */}
            <section>
              <SectionHeader>Infrastructure</SectionHeader>
              <div>
                <FieldLabel>Carried by</FieldLabel>
                <div className="relative">
                  <select
                    value={carrierKey}
                    onChange={(e) => setCarrierKey(e.target.value)}
                    className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
                  >
                    <option value="">— None / unspecified</option>
                    {flowCarriers.length > 0 && (
                      <optgroup label="Integration infrastructure">
                        {flowCarriers.map((c) => (
                          <option key={c.id} value={`registered:${c.id}`}>
                            {formatCarrierOptionLabel(c)}
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
                  const hint = infraCarrierFieldHint("flows", flowCarriers.length > 0);
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
                  iPaaS, ETL, or transport that physically moves this flow
                </p>
              </div>
            </section>

            {/* TRANSPORT & SCHEDULE ─────────────────────────────────────── */}
            <section>
              <SectionHeader>Transport &amp; Schedule</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <FieldLabel>Protocol</FieldLabel>
                  <SelectField value={protocol} onChange={setProtocol} options={FLOW_PROTOCOLS} />
                </div>
                <div>
                  <FieldLabel>Format</FieldLabel>
                  <SelectField value={format} onChange={setFormat} options={FLOW_FORMATS} />
                </div>
                <div>
                  <FieldLabel>Frequency</FieldLabel>
                  <SelectField value={frequency} onChange={setFrequency} options={FLOW_FREQUENCIES} />
                </div>
                <div>
                  <FieldLabel>Auth</FieldLabel>
                  <SelectField value={auth} onChange={setAuth} options={FLOW_AUTH} />
                </div>
              </div>
            </section>

            {/* GOVERNANCE ──────────────────────────────────────────────── */}
            <section>
              <SectionHeader>Governance</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <OwnershipFields value={ownership.value} onChange={ownership.setValue} required />
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <SelectField value={status} onChange={setStatus} options={FLOW_STATUSES} />
                </div>
                <div>
                  <FieldLabel>Criticality</FieldLabel>
                  <SelectField value={criticality} onChange={setCriticality} options={FLOW_CRITICALITY} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Data classification</FieldLabel>
                  <SelectField
                    value={dataClassification}
                    onChange={setDataClassification}
                    options={[
                      { value: "inherited", label: classificationLabel },
                      { value: "public", label: "Public" },
                      { value: "internal", label: "Internal" },
                      { value: "confidential", label: "Confidential" },
                      { value: "restricted", label: "Restricted" },
                    ]}
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Info size={11} className="text-gray-300" />
            You can configure field mapping after creating.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40 transition-colors"
            >
              {createMutation.isPending ? "Creating…" : "Create flow"}
            </button>
          </div>
        </div>
      </div>

      {/* Endpoint dialog — rendered on top with higher z */}
      {endpointDialog && (
        <AddFlowEndpointDialog
          side={endpointDialog}
          current={endpointDialog === "source" ? sources : destinations}
          onClose={() => setEndpointDialog(null)}
          onApply={(next) => {
            if (endpointDialog === "source") setSources(next);
            else setDestinations(next);
            setEndpointDialog(null);
          }}
        />
      )}

    </>,
    document.body
  );
}
