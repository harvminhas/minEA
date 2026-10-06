"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { capabilityMapApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
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
import {
  APPLICATION_HOSTING_OPTIONS,
  OBJECT_FORM_FLOW_DIRECTION,
  SECTION_LABEL,
  SYSTEM_LIFECYCLE_OPTIONS,
  createFormSeed,
  groupCreateFields,
} from "@/lib/fields/registry";
import { FormDrawer, FormField, FormSection, formFieldClass } from "@/components/ui/FormDrawer";
import { CostLinesEditor } from "@/components/mvp/CostSection";
import { VendorField } from "@/components/mvp/VendorField";
import { type CostLine, parseLegacyAnnualCost, readCostLines } from "@/lib/cost/math";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { AiRoleField } from "@/components/ui/AiRoleField";
import {
  readSystemCategoryFields,
  SystemCategoryFields,
} from "@/components/application/SystemCategoryFields";
import {
  readSystemGovernanceFields,
  SystemGovernanceFields,
} from "@/components/application/SystemGovernanceFields";
import { isShadowGovernance } from "@/lib/system-governance";
import { PLATFORM_SLA } from "@/lib/platform-utils";
import { aiRoleForProperties, aiRoleFromProperties, SYSTEM_OBJECT_TYPES } from "@/lib/ai-role-utils";
import type { AiRole, SystemGovernanceStatus } from "@minea/types";

interface Props {
  objectType: ObjectType;
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: () => void;
}

function systemLifecycleOptions(current: string) {
  if (!current || SYSTEM_LIFECYCLE_OPTIONS.some((option) => option.value === current)) {
    return SYSTEM_LIFECYCLE_OPTIONS;
  }
  return [
    ...SYSTEM_LIFECYCLE_OPTIONS,
    {
      value: current,
      label: current.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    },
  ];
}

type FormPropertyField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  options?: string[];
  optionLabels?: Record<string, string>;
};

const SYSTEM_CATALOG_FIELDS: FormPropertyField[] = [
  { key: "vendor", label: "Vendor", type: "text" },
  { key: "contract_renewal", label: "Renewal", type: "text" },
  {
    key: "hosting_model",
    label: "Hosting model",
    type: "select",
    options: APPLICATION_HOSTING_OPTIONS.map((option) => option.value),
    optionLabels: Object.fromEntries(APPLICATION_HOSTING_OPTIONS.map((option) => [option.value, option.label])),
  },
  {
    key: "criticality",
    label: "Criticality",
    type: "select",
    options: ["low", "medium", "high", "tier1"],
    optionLabels: {
      low: "Low",
      medium: "Medium",
      high: "High",
      tier1: "Critical",
    },
  },
  {
    key: "sla_target",
    label: "SLA target",
    type: "select",
    options: PLATFORM_SLA.map((option) => option.value),
    optionLabels: Object.fromEntries(PLATFORM_SLA.map((option) => [option.value, option.label])),
  },
];

const TYPE_FIELDS: Record<string, FormPropertyField[]> = {
  capability: [
    { key: "maturity", label: "Maturity (1-5)", type: "number" },
    { key: "investment", label: "Investment", type: "select", options: ["low", "medium", "high"] },
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
    { key: "direction", label: "Direction", type: "select", options: OBJECT_FORM_FLOW_DIRECTION.map((option) => option.value) },
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
  const { getToken, user } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const enabled = useAuthQueryEnabled();
  const isEdit = !!initialValues;
  const isApplication = objectType === "application";
  const isSystemApp = SYSTEM_OBJECT_TYPES.has(objectType);

  const initAppProps = (initialValues?.properties ?? {}) as ApplicationProperties;
  const initCategoryFields = readSystemCategoryFields(initAppProps);
  const initGovernanceFields = readSystemGovernanceFields(initAppProps);
  const [platformId, setPlatformId] = useState(initAppProps.platform?.platform_id ?? "");
  const [selectedCapabilityIds, setSelectedCapabilityIds] = useState<string[]>([]);
  const [capSearch, setCapSearch] = useState("");
  const [category, setCategory] = useState(initCategoryFields.category);
  const [isCustomBuilt, setIsCustomBuilt] = useState(initCategoryFields.isCustomBuilt);
  const [governanceStatus, setGovernanceStatus] = useState<SystemGovernanceStatus>(
    initGovernanceFields.governanceStatus
  );
  const [discovery, setDiscovery] = useState(initGovernanceFields.discovery);

  const ownership = useOwnershipForm(initialValues);

  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [status, setStatus] = useState(
    initialValues?.status ?? (SYSTEM_OBJECT_TYPES.has(objectType) ? createFormSeed("application").lifecycle : "")
  );
  const [tags, setTags] = useState((initialValues?.tags ?? []).join(", "));
  const [properties, setProperties] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initialValues?.properties ?? {}).map(([k, v]) => [k, String(v)])
    )
  );
  const [aiRole, setAiRole] = useState<AiRole>(
    aiRoleFromProperties((initialValues?.properties as { ai_role?: AiRole } | undefined)?.ai_role)
  );

  const isSystemType = SYSTEM_OBJECT_TYPES.has(objectType);
  const initialCostProps = (initialValues?.properties ?? {}) as Record<string, unknown>;
  const [costLines, setCostLines] = useState<CostLine[]>(() => readCostLines(initialCostProps) ?? []);
  const [costTouched, setCostTouched] = useState(false);
  const legacyCost = costLines.length ? null : parseLegacyAnnualCost(initialCostProps.annual_cost);
  const typeFields = isSystemType ? SYSTEM_CATALOG_FIELDS : (TYPE_FIELDS[objectType] ?? []);
  const typeLabel = OBJECT_TYPE_LABELS[objectType] ?? objectType;
  const isShadowSystem = isSystemApp && isShadowGovernance(governanceStatus);

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
      if (isSystemApp) {
        props.governance_status = governanceStatus;
        if (discovery.trim()) props.discovery = discovery.trim();
        else delete props.discovery;
        if (category.trim()) props.category = category.trim();
        else delete props.category;
        props.is_custom_built = isCustomBuilt;
      }
      if (isApplication) {
        props.platform = selectedPlatform;
      }
      if (isSystemType && costTouched) {
        props.cost_lines = costLines;
      }
      const shared = {
        name,
        description: description || undefined,
        ...ownership.toPayload(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        properties: props,
      };
      const statusValue = status ? (status as ObjectUpdate["status"]) : undefined;
      let saved: MinEAObject;
      if (isEdit) {
        const updateBody: ObjectUpdate = { ...shared, status: statusValue };
        saved = await objectsApi.update(orgSlug, workspaceSlug, initialValues!.id, updateBody, token!);
      } else {
        saved = await objectsApi.create(
          orgSlug,
          workspaceSlug,
          { ...shared, ...(statusValue ? { status: statusValue } : {}), type: objectType } as Parameters<typeof objectsApi.create>[2],
          token!
        );
      }
      if (isApplication) {
        await Promise.all([
          syncSystemPlatformRelation(
            orgSlug,
            workspaceSlug,
            saved.id,
            saved.type,
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
      const vendorName = properties.vendor?.trim() ?? "";
      if (!isEdit && isSystemApp && vendorName) {
        const parties = (catalog.data?.objects ?? []).filter((object) => object.type === "external_party");
        let party = parties.find((object) => object.name.trim().toLowerCase() === vendorName.toLowerCase());
        if (!party) {
          party = await objectsApi.create(orgSlug, workspaceSlug, {
            type: "external_party",
            name: vendorName,
            properties: {},
          }, token!);
          applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: party });
        }
        const link = await relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "supplied_by",
          from_object_id: saved.id,
          from_type: saved.type,
          to_object_id: party.id,
          to_type: "external_party",
        }, token!);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: link });
      }
      return saved;
    },
    onSuccess: async (saved) => {
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
      if (isApplication) {
        await invalidateSystemCaches(queryClient, orgSlug, workspaceSlug, saved.id);
      }
      onSuccess();
    },
  });

  const catalogSpec = (key: string) => SYSTEM_CATALOG_FIELDS.find((field) => field.key === key);

  const systemField = (key: string, label: string): ReactNode => {
    if (key === "is_custom_built" || key === "discovery") return null;
    switch (key) {
      case "name":
        return (
          <FormField label={label} required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={formFieldClass}
              placeholder={`e.g. ${objectType === "application" ? "Salesforce" : "Name"}`}
            />
          </FormField>
        );
      case "category":
        return (
          <SystemCategoryFields
            category={category}
            onCategoryChange={setCategory}
            isCustomBuilt={isCustomBuilt}
            onCustomBuiltChange={setIsCustomBuilt}
            reviewRequired={initCategoryFields.reviewRequired}
            legacyCategory={initCategoryFields.legacyCategory}
          />
        );
      case "governance_status":
        return (
          <SystemGovernanceFields
            governanceStatus={governanceStatus}
            onGovernanceStatusChange={setGovernanceStatus}
            discovery={discovery}
            onDiscoveryChange={setDiscovery}
          />
        );
      case "ai_role":
        return <AiRoleField value={aiRole} onChange={setAiRole} variant="drawer" />;
      case "capabilities":
        return (
          <FormField label={label}>
            <div className="flex items-baseline justify-between mb-1">
              {selectedCapabilityIds.length > 0 && (
                <span className="text-xs font-medium text-indigo-600">{selectedCapabilityIds.length} selected</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mb-2">
              Pick L2 capabilities from your capability map (e.g. Products → Success management). These drive the domain mapping matrix.
            </p>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group}</span>
                      </div>
                      {items.map(({ capability }) => {
                        const maturity = capability.maturity;
                        return (
                          <label key={capability.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50/50 cursor-pointer border-t border-gray-100">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedCapabilityIds.includes(capability.id)}
                                onChange={(e) => toggleCapability(capability.id, e.target.checked)}
                                className="accent-indigo-600 flex-shrink-0"
                              />
                              <span className="text-sm text-gray-800 truncate">{capability.name}</span>
                            </div>
                            {maturity && <span className="text-xs text-gray-400 flex-shrink-0 ml-2">maturity {maturity}</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            )}
          </FormField>
        );
      case "tags":
        return (
          <FormField label={label}>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={formFieldClass} placeholder="e.g. crm, sales, critical" />
          </FormField>
        );
      case "owner":
        return <OwnershipFields value={ownership.value} onChange={ownership.setValue} required={!isShadowSystem} />;
      case "cost":
        return (
          <CostLinesEditor
            lines={costLines}
            vendor={properties.vendor ?? ""}
            legacyDollars={legacyCost}
            actor={user?.uid || "user"}
            onChange={(next) => {
              setCostLines(next);
              setCostTouched(true);
            }}
          />
        );
      case "vendor":
      case "contract_renewal":
      case "hosting_model":
      case "criticality":
      case "sla_target": {
        const spec = catalogSpec(key);
        if (!spec) return null;
        return (
          <FormField label={label}>
            {spec.type === "select" ? (
              <select
                value={properties[key] ?? ""}
                onChange={(e) => setProperties((current) => ({ ...current, [key]: e.target.value }))}
                className={formFieldClass}
              >
                <option value="">—</option>
                {spec.options?.map((option) => (
                  <option key={option} value={option}>{spec.optionLabels?.[option] ?? option}</option>
                ))}
              </select>
            ) : key === "vendor" ? (
              <VendorField
                value={properties.vendor ?? ""}
                onChange={(vendor) => setProperties((current) => ({ ...current, vendor }))}
                placeholder="Start typing a vendor"
                className={formFieldClass}
              />
            ) : (
              <input
                type={spec.type}
                value={properties[key] ?? ""}
                onChange={(e) => setProperties((current) => ({ ...current, [key]: e.target.value }))}
                className={formFieldClass}
              />
            )}
          </FormField>
        );
      }
      case "built_on":
        return (
          <FormField label={label}>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)} className={formFieldClass}>
              <option value="">— None —</option>
              {platformOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">Link this system to an enterprise platform (e.g. Salesforce, ServiceNow).</p>
          </FormField>
        );
      case "status":
        return (
          <FormField label={label}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={formFieldClass}>
              <option value="">Not set</option>
              {systemLifecycleOptions(status).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FormField>
        );
      case "description":
        return (
          <FormField label={label}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${formFieldClass} resize-none`} />
          </FormField>
        );
      default:
        return null;
    }
  };

  return (
    <FormDrawer
      title={`${isEdit ? "Edit" : "New"} ${typeLabel}`}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      submitLabel={isEdit ? "Save changes" : "Create"}
      isSubmitting={mutation.isPending}
      submitDisabled={!name || (!isShadowSystem && !ownership.isValid)}
      error={mutation.isError ? (mutation.error as Error).message : null}
    >
      {isSystemApp ? (
        groupCreateFields("application").map((group) => {
          const fields = group.fields.filter(
            (field) => !field.showIf || field.showIf({ properties: {}, type: objectType })
          );
          if (fields.length === 0) return null;
          const body = fields.map((field) => {
            const node = systemField(field.key, field.label);
            return node ? <div key={field.key}>{node}</div> : null;
          });
          if (group.section === "cost") return <FormSection key={group.section} title={SECTION_LABEL.cost}>{body}</FormSection>;
          return <div key={group.section} className="space-y-3">{body}</div>;
        })
      ) : (
        <>
          <FormField label="Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={formFieldClass}
              placeholder={`e.g. ${objectType === "capability" ? "Customer Management" : "Name"}`}
            />
          </FormField>
          <FormField label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${formFieldClass} resize-none`} />
          </FormField>
          <FormField label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={formFieldClass}>
              <option value="">— No status —</option>
              {STATUSES.map((item) => ({
                value: item,
                label: item.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
              })).map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </FormField>
          <OwnershipFields value={ownership.value} onChange={ownership.setValue} required={!isShadowSystem} />
          {typeFields.length > 0 && (
            <FormSection title={`${typeLabel} Properties`}>
              {typeFields.map((field) => (
                <FormField key={field.key} label={field.label}>
                  {field.type === "select" ? (
                    <select
                      value={properties[field.key] ?? ""}
                      onChange={(e) => setProperties((current) => ({ ...current, [field.key]: e.target.value }))}
                      className={`${formFieldClass} mb-3`}
                    >
                      <option value="">—</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>{field.optionLabels?.[option] ?? option}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type}
                      value={properties[field.key] ?? ""}
                      onChange={(e) => setProperties((current) => ({ ...current, [field.key]: e.target.value }))}
                      className={`${formFieldClass} mb-3`}
                    />
                  )}
                </FormField>
              ))}
            </FormSection>
          )}
          <FormField label="Tags (comma-separated)">
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={formFieldClass} placeholder="e.g. crm, sales, critical" />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}
