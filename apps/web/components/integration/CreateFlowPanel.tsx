"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import {
  FlowEndpointSelect,
  useFlowEndpointOptions,
} from "@/components/integration/FlowEndpointSelect";
import {
  FLOW_MANUAL_TRIGGERS,
  FLOW_MECHANISMS,
} from "@/lib/flow-utils";
import type {
  FlowEndpointRef,
  FlowMechanism,
  FlowManualTrigger,
  IntegrationFlowProperties,
} from "@minea/types";

interface Props {
  onClose: () => void;
  onSuccess: (flowId: string) => void;
  initialFrom?: FlowEndpointRef | null;
  initialTo?: FlowEndpointRef | null;
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
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
        ▾
      </span>
    </div>
  );
}

export function CreateFlowPanel({ onClose, onSuccess, initialFrom = null, initialTo = null }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [mounted, setMounted] = useState(false);
  const { options, isLoading: optionsLoading } = useFlowEndpointOptions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [from, setFrom] = useState<FlowEndpointRef | null>(initialFrom);
  const [to, setTo] = useState<FlowEndpointRef | null>(initialTo);
  const [mechanism, setMechanism] = useState<FlowMechanism>("manual");
  const [manualOwner, setManualOwner] = useState("");
  const [manualTrigger, setManualTrigger] = useState<FlowManualTrigger>("per_transaction");
  const [schedule, setSchedule] = useState("");
  const [platform, setPlatform] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (initialFrom) setFrom(initialFrom);
  }, [initialFrom]);
  useEffect(() => {
    if (initialTo) setTo(initialTo);
  }, [initialTo]);

  const canSubmit = name.trim().length > 0 && !!from && !!to;

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      if (!from || !to) throw new Error("From and To are required");

      const properties: IntegrationFlowProperties = {
        from,
        to,
        mechanism,
      };

      if (mechanism === "manual") {
        if (manualOwner.trim()) properties.manual_owner = manualOwner.trim();
        properties.manual_trigger = manualTrigger;
      }
      if (mechanism === "batch_scheduled" || mechanism === "file_based") {
        if (schedule.trim()) properties.schedule = schedule.trim();
      }
      if (mechanism === "no_code_ipaas" && platform.trim()) {
        properties.platform = platform.trim();
      }

      const flow = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "integration_flow",
          name: name.trim(),
          description: description.trim() || undefined,
          status: "planned",
          properties: properties as Record<string, unknown>,
        },
        token
      );

      return flow;
    },
    onSuccess: (flow) => onSuccess(flow.id),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not create flow"),
  });

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/25" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-[110] w-full max-w-[480px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">New flow</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              A record of how data actually moves from one point to another.
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <FieldLabel required>Name</FieldLabel>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Opportunity to sales order"'
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>From</FieldLabel>
              <FlowEndpointSelect
                value={from}
                onChange={setFrom}
                options={options}
                placeholder={optionsLoading ? "Loading…" : "Select source…"}
                disabled={optionsLoading}
              />
            </div>
            <div>
              <FieldLabel required>To</FieldLabel>
              <FlowEndpointSelect
                value={to}
                onChange={setTo}
                options={options}
                placeholder={optionsLoading ? "Loading…" : "Select destination…"}
                disabled={optionsLoading}
              />
            </div>
          </div>

          <div>
            <FieldLabel required>Mechanism</FieldLabel>
            <SelectField
              value={mechanism}
              onChange={(v) => setMechanism(v as FlowMechanism)}
              options={FLOW_MECHANISMS}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              How this flow is actually carried out, not how it should be.
            </p>
          </div>

          {mechanism === "manual" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 space-y-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Manual details
              </p>
              <div>
                <FieldLabel>Responsible owner</FieldLabel>
                <input
                  value={manualOwner}
                  onChange={(e) => setManualOwner(e.target.value)}
                  placeholder="e.g. Sales Ops"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <FieldLabel>Trigger</FieldLabel>
                <SelectField
                  value={manualTrigger}
                  onChange={(v) => setManualTrigger(v as FlowManualTrigger)}
                  options={FLOW_MANUAL_TRIGGERS}
                />
              </div>
            </div>
          )}

          {(mechanism === "batch_scheduled" || mechanism === "file_based") && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
              <FieldLabel>Schedule</FieldLabel>
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder='e.g. "nightly", "every Monday"'
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          {mechanism === "no_code_ipaas" && (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3">
              <FieldLabel>Platform</FieldLabel>
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder='e.g. "Zapier"'
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          )}

          <div>
            <FieldLabel>Description</FieldLabel>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional notes about this flow"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
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
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            className="px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-md disabled:opacity-40 transition-colors"
          >
            {createMutation.isPending ? "Creating…" : "Create flow"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
