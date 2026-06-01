"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { Info, Plus, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddSystemDialog } from "@/components/application/AddSystemDialog";
import { ComponentDiagramModal, type NodeLayout } from "@/components/application/ComponentDiagram";
import { ComponentDiagramPreview } from "@/components/application/ComponentDiagramPreview";
import {
  buildComponentDraft,
  COMPONENT_STATUSES,
  COMPONENT_TYPES,
} from "@/lib/component-utils";
import { aiRoleForProperties, aiRoleFromProperties } from "@/lib/ai-role-utils";
import { AiRoleField } from "@/components/ui/AiRoleField";
import type {
  AiRole,
  ComponentProperties,
  ComponentRuntimeRef,
  ComponentSystemRef,
  MinEAObject,
  ObjectStatus,
} from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: MinEAObject;
  onClose: () => void;
  onSuccess: (componentId: string) => void;
}

function initFromComponent(component?: MinEAObject) {
  const props = (component?.properties ?? {}) as ComponentProperties;
  const runtime = props.runtime;
  return {
    name: component?.name ?? "",
    componentType: props.component_type ?? "microservice",
    techStack: props.tech_stack ?? "",
    aiRole: aiRoleFromProperties(props.ai_role),
    tags: (component?.tags ?? []).join(", "),
    systems: props.systems ?? [],
    runtimeKey: runtime ? `${runtime.runtime_kind}:${runtime.runtime_id}` : "",
    owner: component?.owner ?? "",
    status: (component?.status ?? "planned") as ObjectStatus,
    draftLayout: props.node_layout ?? {},
  };
}

async function syncComponentRelationships(
  orgSlug: string,
  workspaceSlug: string,
  componentId: string,
  systems: ComponentSystemRef[],
  runtime: ComponentRuntimeRef | null,
  token: string
) {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: componentId },
    token
  );

  for (const rel of existing) {
    if (
      rel.from_type === "component" &&
      (rel.type === "part_of" || rel.type === "runs_on")
    ) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  for (const sys of systems) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "part_of",
        from_object_id: componentId,
        from_type: "component",
        to_object_id: sys.system_id,
        to_type: "application",
      },
      token
    );
  }

  if (runtime) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "runs_on",
        from_object_id: componentId,
        from_type: "component",
        to_object_id: runtime.runtime_id,
        to_type: runtime.runtime_kind,
      },
      token
    );
  }
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
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
      >
        {allowEmpty && (
          <option value="">{placeholder ?? "None"}</option>
        )}
        {!allowEmpty && placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
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

export function CreateComponentPanel({ initialValues, onClose, onSuccess }: Props) {
  const isEdit = !!initialValues;
  const init = initFromComponent(initialValues);

  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState(init.name);
  const [componentType, setComponentType] = useState(init.componentType);
  const [aiRole, setAiRole] = useState<AiRole>(init.aiRole);
  const [techStack, setTechStack] = useState(init.techStack);
  const [tags, setTags] = useState(init.tags);
  const [systems, setSystems] = useState<ComponentSystemRef[]>(init.systems);
  const [runtimeKey, setRuntimeKey] = useState(init.runtimeKey);
  const [owner, setOwner] = useState(init.owner);
  const [status, setStatus] = useState<ObjectStatus>(init.status);
  const [error, setError] = useState<string | null>(null);
  const [showSystemDialog, setShowSystemDialog] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [draftLayout, setDraftLayout] = useState<NodeLayout>(init.draftLayout);

  useEffect(() => setMounted(true), []);

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const runtimeQueries = useQueries({
    queries: (["tool", "model", "cloud_service"] as const).map((type) => ({
      queryKey: ["objects", orgSlug, workspaceSlug, type],
      queryFn: async () => {
        const token = await getToken();
        return objectsApi.list(orgSlug, workspaceSlug, { type }, token!);
      },
      enabled,
    })),
  });

  const runtimeOptions = useMemo(() => {
    const kinds = ["tool", "model", "cloud_service"] as const;
    return kinds.flatMap((kind, i) =>
      (runtimeQueries[i]?.data?.items ?? []).map((item) => ({
        value: `${kind}:${item.id}`,
        label: item.name,
        kind,
        id: item.id,
        name: item.name,
      }))
    );
  }, [runtimeQueries]);

  const selectedRuntime: ComponentRuntimeRef | null = useMemo(() => {
    if (!runtimeKey) return null;
    const opt = runtimeOptions.find((o) => o.value === runtimeKey);
    if (opt) {
      return {
        runtime_id: opt.id,
        runtime_name: opt.name,
        runtime_kind: opt.kind,
      };
    }
    const initRuntime = ((initialValues?.properties ?? {}) as ComponentProperties).runtime;
    if (initRuntime && `${initRuntime.runtime_kind}:${initRuntime.runtime_id}` === runtimeKey) {
      return initRuntime;
    }
    return null;
  }, [runtimeKey, runtimeOptions, initialValues]);

  const draftComponent = useMemo(
    () =>
      buildComponentDraft({
        name,
        componentType,
        techStack,
        systems,
        runtime: selectedRuntime,
        status,
        owner: owner.trim() || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        nodeLayout: Object.keys(draftLayout).length > 0 ? draftLayout : undefined,
      }),
    [name, componentType, techStack, systems, selectedRuntime, status, owner, tags, draftLayout]
  );

  const canSubmit = name.trim().length > 0 && systems.length > 0 && !!componentType;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const existingLayout = ((initialValues?.properties ?? {}) as ComponentProperties).node_layout;
      const properties: ComponentProperties = {
        component_type: componentType,
        tech_stack: techStack.trim() || undefined,
        ai_role: aiRoleForProperties(aiRole),
        systems,
        runtime: selectedRuntime,
        node_layout:
          Object.keys(draftLayout).length > 0 ? draftLayout : existingLayout,
      };

      if (isEdit && initialValues) {
        const component = await objectsApi.update(
          orgSlug,
          workspaceSlug,
          initialValues.id,
          {
            name: name.trim(),
            owner: owner.trim() || undefined,
            status,
            tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
            properties: properties as Record<string, unknown>,
          },
          token
        );

        await syncComponentRelationships(
          orgSlug,
          workspaceSlug,
          initialValues.id,
          systems,
          selectedRuntime,
          token
        );

        return component;
      }

      const component = await objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "component",
          name: name.trim(),
          owner: owner.trim() || undefined,
          status,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          properties: properties as Record<string, unknown>,
        },
        token
      );

      await syncComponentRelationships(
        orgSlug,
        workspaceSlug,
        component.id,
        systems,
        selectedRuntime,
        token
      );

      return component;
    },
    onSuccess: (component) => onSuccess(component.id),
    onError: (err) =>
      setError(err instanceof Error ? err.message : `Could not ${isEdit ? "save" : "create"} component`),
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
              {isEdit ? "Edit component" : "New component"}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit
                ? "Update placement, identity, and governance"
                : "Register a deployable unit within your systems"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 -mt-0.5">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-7">
            <section>
              <SectionHeader>Placement</SectionHeader>
              <div className="space-y-3">
                <div>
                  <FieldLabel required>Part of systems</FieldLabel>
                  <div className="rounded-lg border border-gray-200 p-3 min-h-[72px]">
                    <div className="flex flex-wrap gap-1.5">
                      {systems.map((sys) => (
                        <span
                          key={sys.system_id}
                          className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
                        >
                          {sys.system_name}
                          <button
                            type="button"
                            onClick={() => setSystems((s) => s.filter((x) => x.system_id !== sys.system_id))}
                            className="text-indigo-400 hover:text-indigo-700"
                            aria-label={`Remove ${sys.system_name}`}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setShowSystemDialog(true)}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 border border-dashed border-indigo-300 px-2 py-0.5 rounded-full hover:bg-indigo-50 transition-colors"
                      >
                        <Plus size={12} />
                        Add system
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    A component can be shared across multiple systems. Owner and lifecycle stay on the component itself.
                  </p>
                </div>

                <div>
                  <FieldLabel required>Type</FieldLabel>
                  <SelectField value={componentType} onChange={setComponentType} options={COMPONENT_TYPES} />
                </div>

                <AiRoleField value={aiRole} onChange={setAiRole} />

                <div>
                  <FieldLabel>Runs on</FieldLabel>
                  <SelectField
                    value={runtimeKey}
                    onChange={setRuntimeKey}
                    options={runtimeOptions.map((o) => ({ value: o.value, label: o.label }))}
                    placeholder="+ Register runtime"
                    allowEmpty
                  />
                </div>
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
                    placeholder="e.g. auth-service"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tech stack</FieldLabel>
                  <input
                    value={techStack}
                    onChange={(e) => setTechStack(e.target.value)}
                    placeholder="e.g. Java 17, Spring Boot"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <FieldLabel>Tags</FieldLabel>
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="auth, shared, core"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Governance</SectionHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <FieldLabel>Owner (team)</FieldLabel>
                  <input
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    list="component-owner-options"
                    placeholder="Search team…"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <datalist id="component-owner-options">
                    {(teamsData?.items ?? []).map((team) => (
                      <option key={team.id} value={team.name} />
                    ))}
                  </datalist>
                </div>
                <div className="col-span-2">
                  <FieldLabel>Lifecycle</FieldLabel>
                  <SelectField
                    value={status}
                    onChange={(v) => setStatus(v as ObjectStatus)}
                    options={COMPONENT_STATUSES}
                  />
                </div>
              </div>
            </section>

            <section>
              <SectionHeader>Architecture</SectionHeader>
              <p className="text-xs text-gray-400 mb-2">
                Preview updates as you assign systems and runtime.
              </p>
              <ComponentDiagramPreview component={draftComponent} onExpand={() => setShowChart(true)} />
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
            className={cn(
              "px-4 py-2 text-sm text-white rounded-md disabled:opacity-40 transition-colors",
              "bg-indigo-600 hover:bg-indigo-700"
            )}
          >
            {saveMutation.isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save"
                : "Create"}
          </button>
        </div>
      </div>

      {showSystemDialog && (
        <AddSystemDialog
          selected={systems}
          onClose={() => setShowSystemDialog(false)}
          onApply={(next) => {
            setSystems(next);
            setShowSystemDialog(false);
          }}
        />
      )}

      {showChart && (
        <ComponentDiagramModal
          component={draftComponent}
          onClose={() => setShowChart(false)}
          onLayoutSave={setDraftLayout}
          onResetLayout={() => setDraftLayout({})}
        />
      )}
    </>,
    document.body
  );
}
