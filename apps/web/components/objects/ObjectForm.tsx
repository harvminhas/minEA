"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { type ObjectType, type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { objectsApi } from "@/lib/api-client";

interface Props {
  objectType: ObjectType;
  workspaceId: string;
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: () => void;
}

// Type-specific property field definitions
const TYPE_FIELDS: Record<string, Array<{ key: string; label: string; type: "text" | "number" | "select"; options?: string[] }>> = {
  capability: [
    { key: "maturity", label: "Maturity (1-5)", type: "number" },
    { key: "investment", label: "Investment", type: "select", options: ["low", "medium", "high"] },
  ],
  application: [
    { key: "vendor", label: "Vendor", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "hosting_model", label: "Hosting Model", type: "select", options: ["cloud", "on_premise", "hybrid", "saas"] },
    { key: "annual_cost", label: "Annual Cost ($)", type: "number" },
  ],
  agent: [
    { key: "autonomy_level", label: "Autonomy Level", type: "select", options: ["suggest", "act_with_approval", "act_autonomously"] },
    { key: "scope", label: "Scope", type: "text" },
    { key: "human_escalation_point", label: "Human Escalation Point", type: "text" },
    { key: "eu_ai_act_risk_class", label: "EU AI Act Risk Class", type: "select", options: ["minimal", "limited", "high", "unacceptable"] },
  ],
  data_object: [
    { key: "classification", label: "Classification", type: "select", options: ["public", "internal", "confidential", "pii", "restricted"] },
  ],
  data_store: [
    { key: "store_type", label: "Store Type", type: "select", options: ["relational_db", "document_db", "data_warehouse", "data_lake", "file_store", "cache"] },
  ],
  api: [
    { key: "protocol", label: "Protocol", type: "select", options: ["rest", "graphql", "grpc", "soap"] },
  ],
  integration_flow: [
    { key: "direction", label: "Direction", type: "select", options: ["inbound", "outbound", "bidirectional"] },
    { key: "protocol", label: "Protocol", type: "text" },
    { key: "frequency", label: "Frequency", type: "select", options: ["realtime", "batch", "scheduled", "event_driven"] },
    { key: "criticality", label: "Criticality", type: "select", options: ["low", "medium", "high", "critical"] },
  ],
  tool: [
    { key: "action_type", label: "Action Type", type: "select", options: ["read", "write", "external_side_effect"] },
    { key: "reversibility", label: "Reversibility", type: "select", options: ["reversible", "irreversible"] },
    { key: "auth_mechanism", label: "Auth Mechanism", type: "text" },
    { key: "cost_per_call", label: "Cost Per Call ($)", type: "number" },
  ],
  cloud_service: [
    { key: "provider", label: "Provider", type: "select", options: ["aws", "azure", "gcp", "other"] },
    { key: "service_type", label: "Service Type", type: "text" },
  ],
  model: [
    { key: "provider", label: "Provider", type: "text" },
    { key: "model_version", label: "Model Version", type: "text" },
    { key: "version_pin_policy", label: "Version Pin Policy", type: "select", options: ["pinned", "latest", "rolling"] },
    { key: "cost_per_million_tokens_input", label: "Cost/M Tokens Input ($)", type: "number" },
    { key: "cost_per_million_tokens_output", label: "Cost/M Tokens Output ($)", type: "number" },
    { key: "data_residency", label: "Data Residency", type: "text" },
  ],
};

const STATUSES = ["planned", "active", "retiring", "retired", "deprecated", "under_evaluation"];

export function ObjectForm({ objectType, workspaceId, initialValues, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const isEdit = !!initialValues;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [owner, setOwner] = useState(initialValues?.owner ?? "");
  const [status, setStatus] = useState(initialValues?.status ?? "");
  const [tags, setTags] = useState((initialValues?.tags ?? []).join(", "));
  const [properties, setProperties] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initialValues?.properties ?? {}).map(([k, v]) => [k, String(v)])
    )
  );

  const typeFields = TYPE_FIELDS[objectType] ?? [];

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const props: Record<string, unknown> = {};
      for (const field of typeFields) {
        const val = properties[field.key];
        if (val) {
          props[field.key] = field.type === "number" ? Number(val) : val;
        }
      }
      const body = {
        workspace_id: workspaceId,
        type: objectType,
        name,
        description: description || undefined,
        owner: owner || undefined,
        status: (status || undefined) as any,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        properties: props,
      };
      if (isEdit) {
        return objectsApi.update(initialValues!.id, body, token!);
      }
      return objectsApi.create(body as any, token!);
    },
    onSuccess,
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-50" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            {isEdit ? "Edit" : "New"} {OBJECT_TYPE_LABELS[objectType] ?? objectType}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={`e.g. ${objectType === "application" ? "Salesforce" : objectType === "capability" ? "Customer Management" : "Name"}`}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— No status —</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          {/* Owner */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Owner</label>
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Sales Team"
            />
          </div>

          {/* Type-specific fields */}
          {typeFields.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {OBJECT_TYPE_LABELS[objectType]} Properties
              </p>
              {typeFields.map((field) => (
                <div key={field.key} className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      value={properties[field.key] ?? ""}
                      onChange={(e) => setProperties((p) => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">—</option>
                      {field.options?.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={properties[field.key] ?? ""}
                      onChange={(e) => setProperties((p) => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. crm, sales, critical"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || mutation.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            {mutation.isPending ? "Saving..." : isEdit ? "Save changes" : "Create"}
          </button>
        </div>
      </div>
    </>
  );
}
