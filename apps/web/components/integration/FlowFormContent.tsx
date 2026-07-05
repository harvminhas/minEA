"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  FlowEndpointSelect,
  useFlowEndpointOptions,
} from "@/components/integration/FlowEndpointSelect";
import { RegisterFlowCarrierDialog } from "@/components/integration/RegisterFlowCarrierDialog";
import {
  formatCarrierOptionLabel,
  infraCarrierFieldHint,
  integrationInfraCarrierOptions,
  integrationInfraToolsQueryKey,
} from "@/lib/integration-infra-carriers";
import {
  carrierKeyFromRef,
  carrierRefFromKey,
  FLOW_MANUAL_TRIGGERS,
  FLOW_MECHANISMS,
} from "@/lib/flow-utils";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { useTenancy } from "@/lib/tenancy";
import type {
  FlowCarrierRef,
  FlowEndpointRef,
  FlowEndpointSide,
  FlowMechanism,
  FlowManualTrigger,
  IntegrationFlowProperties,
  MinEAObject,
} from "@minea/types";
import { cn } from "@/lib/utils";

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
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
        ▾
      </span>
    </div>
  );
}

export interface FlowFormState {
  name: string;
  description: string;
  from: FlowEndpointRef | null;
  to: FlowEndpointRef | null;
  mechanism: FlowMechanism;
  manualOwner: string;
  manualTrigger: FlowManualTrigger;
  schedule: string;
  platform: string;
  carrier: FlowCarrierRef | null;
}

interface Props {
  state: FlowFormState;
  onChange: (patch: Partial<FlowFormState>) => void;
  lockFrom?: boolean;
}

export function FlowFormContent({ state, onChange, lockFrom }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const { options, isLoading: optionsLoading } = useFlowEndpointOptions();
  const [showRegisterCarrier, setShowRegisterCarrier] = useState(false);

  const { data: infraToolsData } = useQuery({
    queryKey: integrationInfraToolsQueryKey(orgSlug, workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tool" }, token!);
    },
    enabled,
  });

  const registeredCarriers = useMemo(
    () => integrationInfraCarrierOptions(infraToolsData?.items ?? [], "flows"),
    [infraToolsData]
  );

  const carrierKey = carrierKeyFromRef(state.carrier);
  const carrierHint = infraCarrierFieldHint("flows", registeredCarriers.length > 0);

  return (
    <>
      <div>
        <FieldLabel required>Name</FieldLabel>
        <input
          value={state.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder='e.g. "Opportunity to sales order"'
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel required>From</FieldLabel>
          <FlowEndpointSelect
            value={state.from}
            onChange={(from) => onChange({ from })}
            options={options}
            placeholder={optionsLoading ? "Loading…" : "Select source…"}
            disabled={optionsLoading || lockFrom}
          />
        </div>
        <div>
          <FieldLabel required>To</FieldLabel>
          <FlowEndpointSelect
            value={state.to}
            onChange={(to) => onChange({ to })}
            options={options}
            placeholder={optionsLoading ? "Loading…" : "Select destination…"}
            disabled={optionsLoading}
          />
        </div>
      </div>

      <div>
        <FieldLabel required>Mechanism</FieldLabel>
        <SelectField
          value={state.mechanism}
          onChange={(v) => onChange({ mechanism: v as FlowMechanism })}
          options={FLOW_MECHANISMS}
        />
        <p className="text-[11px] text-gray-400 mt-1.5">
          How this flow is actually carried out, not how it should be.
        </p>
      </div>

      {state.mechanism === "manual" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 space-y-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            Manual details
          </p>
          <div>
            <FieldLabel>Responsible owner</FieldLabel>
            <input
              value={state.manualOwner}
              onChange={(e) => onChange({ manualOwner: e.target.value })}
              placeholder="e.g. Sales Ops"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <FieldLabel>Trigger</FieldLabel>
            <SelectField
              value={state.manualTrigger}
              onChange={(v) => onChange({ manualTrigger: v as FlowManualTrigger })}
              options={FLOW_MANUAL_TRIGGERS}
            />
          </div>
        </div>
      )}

      {(state.mechanism === "batch_scheduled" || state.mechanism === "file_based") && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
          <FieldLabel>Schedule</FieldLabel>
          <input
            value={state.schedule}
            onChange={(e) => onChange({ schedule: e.target.value })}
            placeholder='e.g. "nightly", "every Monday"'
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      {state.mechanism === "no_code_ipaas" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
          <FieldLabel>Platform</FieldLabel>
          <input
            value={state.platform}
            onChange={(e) => onChange({ platform: e.target.value })}
            placeholder='e.g. "Zapier"'
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      <div className="rounded-lg border border-gray-200 px-4 py-3 space-y-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Infrastructure
        </p>
        <div>
          <FieldLabel>Integration infrastructure</FieldLabel>
          <div className="relative">
            <select
              value={carrierKey}
              onChange={(e) => {
                const next = e.target.value;
                onChange({
                  carrier: carrierRefFromKey(next, registeredCarriers),
                });
              }}
              className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8"
            >
              <option value="">
                {registeredCarriers.length > 0 ? "Not set" : "No flow infrastructure available"}
              </option>
              {registeredCarriers.length > 0 && (
                <optgroup label="Integration infrastructure">
                  {registeredCarriers.map((carrier) => (
                    <option key={carrier.id} value={`registered:${carrier.id}`}>
                      {formatCarrierOptionLabel(carrier)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
              ▾
            </span>
          </div>
          <p
            className={cn(
              "text-[11px] mt-1.5",
              carrierHint.tone === "notice" ? "text-amber-700" : "text-gray-400"
            )}
          >
            {carrierHint.text}
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Optional — the iPaaS, ETL, or transport layer that physically carries this flow
          </p>
          <button
            type="button"
            onClick={() => setShowRegisterCarrier(true)}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-teal-600 hover:text-teal-700"
          >
            <Plus size={12} />
            New flow infrastructure
          </button>
        </div>
      </div>

      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Optional notes about this flow"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {showRegisterCarrier && (
        <RegisterFlowCarrierDialog
          onClose={() => setShowRegisterCarrier(false)}
          onCreated={(carrier) => {
            onChange({
              carrier: { carrier_id: carrier.id, carrier_name: carrier.name },
            });
            setShowRegisterCarrier(false);
          }}
        />
      )}
    </>
  );
}

export function legacyFlowEndpointFromSide(side?: FlowEndpointSide): FlowEndpointRef | null {
  const system = side?.systems?.[0];
  if (system) {
    return {
      endpoint_id: system.system_id,
      endpoint_name: system.system_name,
      endpoint_kind: "application",
    };
  }
  const entity = side?.entities?.[0];
  if (entity) {
    return {
      endpoint_id: entity.entity_id,
      endpoint_name: entity.entity_name,
      endpoint_kind: "data_object",
      context_label: entity.system_name ?? undefined,
    };
  }
  return null;
}

export function flowFormStateFromFlow(flow: MinEAObject): FlowFormState {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  return {
    name: flow.name,
    description: flow.description ?? "",
    from: props.from ?? legacyFlowEndpointFromSide(props.sources),
    to: props.to ?? legacyFlowEndpointFromSide(props.destinations),
    mechanism: props.mechanism ?? "manual",
    manualOwner: props.manual_owner ?? "",
    manualTrigger: props.manual_trigger ?? "per_transaction",
    schedule: props.schedule ?? "",
    platform: props.platform ?? "",
    carrier: props.carrier ?? null,
  };
}

export function buildFlowProperties(
  state: FlowFormState,
  options?: { clearLegacy?: boolean; isEdit?: boolean }
) {
  const properties = {
    from: state.from!,
    to: state.to!,
    mechanism: state.mechanism,
  } as Record<string, unknown>;

  if (state.mechanism === "manual") {
    if (state.manualOwner.trim()) properties.manual_owner = state.manualOwner.trim();
    properties.manual_trigger = state.manualTrigger;
  }
  if (state.mechanism === "batch_scheduled" || state.mechanism === "file_based") {
    if (state.schedule.trim()) properties.schedule = state.schedule.trim();
  }
  if (state.mechanism === "no_code_ipaas" && state.platform.trim()) {
    properties.platform = state.platform.trim();
  }

  if (state.carrier?.carrier_id) {
    properties.carrier = state.carrier;
  } else if (options?.isEdit) {
    properties.carrier = null;
  }

  if (options?.clearLegacy) {
    properties.direction = null;
    properties.protocol = null;
    properties.format = null;
    properties.frequency = null;
    properties.auth = null;
    properties.criticality = null;
    properties.data_classification = null;
    properties.sources = null;
    properties.destinations = null;
  }

  return properties;
}
