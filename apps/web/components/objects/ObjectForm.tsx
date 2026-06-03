"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  type ApplicationProperties,
  type ObjectType,
  type MinEAObject,
  type ObjectUpdate,
  type PlatformRef,
  OBJECT_TYPE_LABELS,
} from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { capabilityMapApi, objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  filterEnterprisePlatforms,
  loadSystemPlatformRef,
  platformRefFromObject,
  syncSystemPlatformRelation,
} from "@/lib/platform-relationship-utils";
import {
  flattenMapCapabilities,
  invalidateSystemCaches,
  loadSystemCapabilityIds,
  syncSystemCapabilityRelations,
} from "@/lib/system-capability-utils";
import { FormDrawer, FormField, FormSection, formFieldClass } from "@/components/ui/FormDrawer";
import { AiRoleField } from "@/components/ui/AiRoleField";
import { aiRoleForProperties, aiRoleFromProperties, SYSTEM_OBJECT_TYPES } from "@/lib/ai-role-utils";
import type { AiRole } from "@minea/types";

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
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const isEdit = !!initialValues;
  const isApplication = objectType === "application";

  const initAppProps = (initialValues?.properties ?? {}) as ApplicationProperties;
  const [platformId, setPlatformId] = useState(initAppProps.platform?.platform_id ?? "");
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<string[]>([]);
  const [capSearch, setCapSearch] = useState("");

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
  const [aiRole, setAiRole] = useState<AiRole>(
    aiRoleFromProperties((initialValues?.properties as { ai_role?: AiRole } | undefined)?.ai_role)
  );

  const typeFields = TYPE_FIELDS[objectType] ?? [];
  const typeLabel = OBJECT_TYPE_LABELS[objectType] ?? objectType;
  const isSystemType = SYSTEM_OBJECT_TYPES.has(objectType);

  const { data: platformsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "cloud_service", "platforms"],
    queryFn: async () => {
      const token = await getToken();
      const res = await objectsApi.list(orgSlug, workspaceSlug, { type: "cloud_service" }, token!);
      return filterEnterprisePlatforms(res.items);
    },
    enabled: enabled && isApplication,
  });

  const platformOptions = useMemo(
    () => (platformsData ?? []).map((p) => ({ value: p.id, label: p.name })),
    [platformsData]
  );

  const { data: capabilityMapData } = useQuery({
    queryKey: ["capability-map", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.get(orgSlug, workspaceSlug, token!);
    },
    enabled: enabled && isApplication,
  });

  const mapCapabilityRows = useMemo(
    () => (capabilityMapData ? flattenMapCapabilities(capabilityMapData) : []),
    [capabilityMapData]
  );

  const filteredMapCapabilities = useMemo(() => {
    const query = capSearch.trim().toLowerCase();
    if (!query) return mapCapabilityRows;
    return mapCapabilityRows.filter(
      (row) =>
        row.capability.name.toLowerCase().includes(query) ||
        row.domainName.toLowerCase().includes(query)
    );
  }, [mapCapabilityRows, capSearch]);

  const groupedCapabilities = useMemo(() => {
    const groups: Record<string, typeof mapCapabilityRows> = {};
    for (const row of filteredMapCapabilities) {
      (groups[row.domainName] ??= []).push(row);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredMapCapabilities]);

  const toggleCapability = (id: string, checked: boolean) =>
    setSelectedCapabilityIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id)
    );

  useEffect(() => {
    if (!isEdit || !isApplication || !initialValues) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const ids = await loadSystemCapabilityIds(
        orgSlug,
        workspaceSlug,
        initialValues.id,
        token
      );
      if (!cancelled) setSelectedCapabilityIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, isApplication, initialValues, orgSlug, workspaceSlug, getToken]);

  useEffect(() => {
    if (!isEdit || !isApplication || !initialValues || platformId) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const ref = await loadSystemPlatformRef(orgSlug, workspaceSlug, initialValues.id, token);
      if (!cancelled && ref) setPlatformId(ref.platform_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, isApplication, initialValues, orgSlug, workspaceSlug, getToken, platformId]);

  const selectedPlatform: PlatformRef | null = useMemo(() => {
    if (!platformId) return null;
    const match = (platformsData ?? []).find((p) => p.id === platformId);
    if (match) return platformRefFromObject(match);
    const stored = initAppProps.platform;
    if (stored?.platform_id === platformId) return stored;
    return { platform_id: platformId, platform_name: "" };
  }, [platformId, platformsData, initAppProps.platform]);

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
      const storedAiRole = aiRoleForProperties(aiRole);
      if (storedAiRole) props.ai_role = storedAiRole;
      if (isApplication) {
        props.platform = selectedPlatform;
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
      let saved: MinEAObject;
      if (isEdit) {
        const updateBody: ObjectUpdate = shared;
        saved = await objectsApi.update(orgSlug, workspaceSlug, initialValues!.id, updateBody, token!);
      } else {
        saved = await objectsApi.create(
          orgSlug,
          workspaceSlug,
          { ...shared, type: objectType } as Parameters<typeof objectsApi.create>[2],
          token!
        );
      }
      if (isApplication) {
        await Promise.all([
          syncSystemPlatformRelation(
            orgSlug,
            workspaceSlug,
            saved.id,
            selectedPlatform,
            token!
          ),
          syncSystemCapabilityRelations(
            orgSlug,
            workspaceSlug,
            saved.id,
            selectedCapabilityIds,
            token!
          ),
        ]);
      }
      return saved;
    },
    onSuccess: async (saved) => {
      if (isApplication) {
        await invalidateSystemCaches(queryClient, orgSlug, workspaceSlug, saved.id);
      }
      onSuccess();
    },
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

      {isApplication && (
        <>
          <FormField label="Capabilities supported">
            <div className="flex items-baseline justify-between mb-1">
              {selectedCapabilityIds.length > 0 && (
                <span className="text-xs font-medium text-indigo-600">
                  {selectedCapabilityIds.length} selected
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              Pick L2 capabilities from your capability map (e.g. Products → Success management). These drive the domain mapping matrix.
            </p>
            <div className="relative mb-2">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={capSearch}
                onChange={(e) => setCapSearch(e.target.value)}
                placeholder="Search capabilities…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {mapCapabilityRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                No capabilities on the capability map yet. Add domains and L2 capabilities under Strategy → Capability map first.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
                {groupedCapabilities.length === 0 ? (
                  <p className="text-xs text-gray-400 px-3 py-3">No results for &ldquo;{capSearch}&rdquo;</p>
                ) : (
                  groupedCapabilities.map(([group, items]) => (
                    <div key={group}>
                      <div className="bg-gray-50 px-3 py-1.5 sticky top-0">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                          {group}
                        </span>
                      </div>
                      {items.map(({ capability }) => {
                        const maturity = capability.maturity;
                        return (
                          <label
                            key={capability.id}
                            className="flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50/50 cursor-pointer border-t border-gray-100"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedCapabilityIds.includes(capability.id)}
                                onChange={(e) =>
                                  toggleCapability(capability.id, e.target.checked)
                                }
                                className="accent-indigo-600 flex-shrink-0"
                              />
                              <span className="text-sm text-gray-800 truncate">
                                {capability.name}
                              </span>
                            </div>
                            {maturity && (
                              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                                maturity {maturity}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            )}
          </FormField>

          <FormField label="Built on platform">
            <select
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className={formFieldClass}
            >
              <option value="">— None —</option>
              {platformOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Link this system to an enterprise platform (e.g. Salesforce, ServiceNow).
            </p>
          </FormField>
        </>
      )}

      {(typeFields.length > 0 || isSystemType) && (
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
          {isSystemType && <AiRoleField value={aiRole} onChange={setAiRole} variant="drawer" />}
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
