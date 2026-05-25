"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { type ObjectType, type MinEAObject, type ObjectUpdate, OBJECT_TYPE_LABELS } from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { FormDrawer, FormField, FormSection, formFieldClass } from "@/components/ui/FormDrawer";

interface Props {
  objectType: ObjectType;
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: () => void;
}

const TYPE_FIELDS: Record<
  string,
  Array<{ key: string; label: string; type: "text" | "number" | "select"; options?: string[] }>
> = {
  capability: [
    { key: "maturity", label: "Maturity (1-5)", type: "number" },
    { key: "investment", label: "Investment", type: "select", options: ["low", "medium", "high"] },
  ],
  application: [
    { key: "vendor", label: "Vendor", type: "text" },
    { key: "category", label: "Category", type: "text" },
    {
      key: "hosting_model",
      label: "Hosting Model",
      type: "select",
      options: ["cloud", "on_premise", "hybrid", "saas"],
    },
    { key: "annual_cost", label: "Annual Cost ($)", type: "number" },
  ],
  agent: [
    {
      key: "autonomy_level",
      label: "Autonomy Level",
      type: "select",
      options: ["suggest", "act_with_approval", "act_autonomously"],
    },
    { key: "scope", label: "Scope", type: "text" },
    { key: "human_escalation_point", label: "Human Escalation Point", type: "text" },
    {
      key: "eu_ai_act_risk_class",
      label: "EU AI Act Risk Class",
      type: "select",
      options: ["minimal", "limited", "high", "unacceptable"],
    },
  ],
  data_object: [
    {
      key: "classification",
      label: "Classification",
      type: "select",
      options: ["public", "internal", "confidential", "pii", "restricted"],
    },
  ],
  data_store: [
    {
      key: "store_type",
      label: "Store Type",
      type: "select",
      options: ["relational_db", "document_db", "data_warehouse", "data_lake", "file_store", "cache"],
    },
  ],
  api: [
    { key: "protocol", label: "Protocol", type: "select", options: ["rest", "graphql", "grpc", "soap"] },
  ],
  integration_flow: [
    { key: "direction", label: "Direction", type: "select", options: ["inbound", "outbound", "bidirectional"] },
    { key: "protocol", label: "Protocol", type: "text" },
    {
      key: "frequency",
      label: "Frequency",
      type: "select",
      options: ["realtime", "batch", "scheduled", "event_driven"],
    },
    {
      key: "criticality",
      label: "Criticality",
      type: "select",
      options: ["low", "medium", "high", "critical"],
    },
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

export function ObjectForm({ objectType, initialValues, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
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
  const typeLabel = OBJECT_TYPE_LABELS[objectType] ?? objectType;

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
      const shared = {
        name,
        description: description || undefined,
        owner: owner || undefined,
        status: status ? (status as ObjectUpdate["status"]) : undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        properties: props,
      };
      if (isEdit) {
        const updateBody: ObjectUpdate = shared;
        return objectsApi.update(orgSlug, workspaceSlug, initialValues!.id, updateBody, token!);
      }
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        { ...shared, type: objectType } as Parameters<typeof objectsApi.create>[2],
        token!
      );
    },
    onSuccess,
  });

  return (
    <FormDrawer
      title={`${isEdit ? "Edit" : "New"} ${typeLabel}`}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitLabel={isEdit ? "Save changes" : "Create"}
      isSubmitting={mutation.isPending}
      submitDisabled={!name}
      error={mutation.isError ? (mutation.error as Error).message : null}
    >
      <FormField label="Name" required>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={formFieldClass}
          placeholder={`e.g. ${objectType === "application" ? "Salesforce" : objectType === "capability" ? "Customer Management" : "Name"}`}
        />
      </FormField>

      <FormField label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`${formFieldClass} resize-none`}
        />
      </FormField>

      <FormField label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={formFieldClass}>
          <option value="">— No status —</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Owner">
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className={formFieldClass}
          placeholder="e.g. Sales Team"
        />
      </FormField>

      {typeFields.length > 0 && (
        <FormSection title={`${typeLabel} Properties`}>
          {typeFields.map((field) => (
            <FormField key={field.key} label={field.label}>
              {field.type === "select" ? (
                <select
                  value={properties[field.key] ?? ""}
                  onChange={(e) => setProperties((p) => ({ ...p, [field.key]: e.target.value }))}
                  className={`${formFieldClass} mb-3`}
                >
                  <option value="">—</option>
                  {field.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={properties[field.key] ?? ""}
                  onChange={(e) => setProperties((p) => ({ ...p, [field.key]: e.target.value }))}
                  className={`${formFieldClass} mb-3`}
                />
              )}
            </FormField>
          ))}
        </FormSection>
      )}

      <FormField label="Tags (comma-separated)">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className={formFieldClass}
          placeholder="e.g. crm, sales, critical"
        />
      </FormField>
    </FormDrawer>
  );
}
