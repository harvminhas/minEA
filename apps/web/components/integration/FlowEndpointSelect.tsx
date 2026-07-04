"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import type { ApplicationProperties, ComponentProperties, FlowEndpointRef } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { encodeFlowEndpointOption } from "@/lib/flow-utils";
import { useTenancy } from "@/lib/tenancy";

export function useFlowEndpointOptions() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const { data: appsData, isLoading: appsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application", "flow-endpoints"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application", page_size: 200 }, token!);
    },
    enabled,
  });

  const { data: solutionsData, isLoading: solutionsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "solution", "flow-endpoints"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "solution", page_size: 200 }, token!);
    },
    enabled,
  });

  const { data: techCapsData, isLoading: techCapsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "technical_capability", "flow-endpoints"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(
        orgSlug,
        workspaceSlug,
        { type: "technical_capability", page_size: 200 },
        token!
      );
    },
    enabled,
  });

  const { data: componentsData, isLoading: componentsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "component", "flow-endpoints"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "component", page_size: 200 }, token!);
    },
    enabled,
  });

  const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "data_object", "flow-endpoints"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "data_object", page_size: 200 }, token!);
    },
    enabled,
  });

  const options = useMemo(() => {
    const list: FlowEndpointRef[] = [];

    for (const app of appsData?.items ?? []) {
      const vendor = (app.properties as ApplicationProperties)?.vendor?.trim();
      list.push({
        endpoint_id: app.id,
        endpoint_name: app.name,
        endpoint_kind: "application",
        context_label: vendor || undefined,
      });
    }

    for (const solution of solutionsData?.items ?? []) {
      list.push({
        endpoint_id: solution.id,
        endpoint_name: solution.name,
        endpoint_kind: "solution",
      });
    }

    for (const cap of techCapsData?.items ?? []) {
      list.push({
        endpoint_id: cap.id,
        endpoint_name: cap.name,
        endpoint_kind: "technical_capability",
      });
    }

    for (const comp of componentsData?.items ?? []) {
      const props = (comp.properties ?? {}) as ComponentProperties;
      const systemName = props.systems?.[0]?.system_name;
      list.push({
        endpoint_id: comp.id,
        endpoint_name: comp.name,
        endpoint_kind: "component",
        context_label: systemName,
      });
    }

    for (const ent of entitiesData?.items ?? []) {
      list.push({
        endpoint_id: ent.id,
        endpoint_name: ent.name,
        endpoint_kind: "data_object",
      });
    }

    return list.sort((a, b) => a.endpoint_name.localeCompare(b.endpoint_name));
  }, [appsData, solutionsData, techCapsData, componentsData, entitiesData]);

  const isLoading =
    appsLoading || solutionsLoading || techCapsLoading || componentsLoading || entitiesLoading;

  return { options, isLoading };
}

export function FlowEndpointSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
}: {
  value: FlowEndpointRef | null;
  onChange: (ref: FlowEndpointRef | null) => void;
  options: FlowEndpointRef[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const selectedKey = value ? encodeFlowEndpointOption(value) : "";

  return (
    <div className="relative">
      <select
        value={selectedKey}
        disabled={disabled}
        onChange={(e) => {
          const next = options.find((o) => encodeFlowEndpointOption(o) === e.target.value) ?? null;
          onChange(next);
        }}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 pr-8 disabled:bg-gray-50"
      >
        <option value="">{placeholder}</option>
        <optgroup label="Systems">
          {options
            .filter((o) =>
              ["application", "solution", "technical_capability"].includes(o.endpoint_kind)
            )
            .map((o) => (
              <option key={encodeFlowEndpointOption(o)} value={encodeFlowEndpointOption(o)}>
                {o.context_label ? `${o.endpoint_name} (${o.context_label})` : o.endpoint_name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Components">
          {options
            .filter((o) => o.endpoint_kind === "component")
            .map((o) => (
              <option key={encodeFlowEndpointOption(o)} value={encodeFlowEndpointOption(o)}>
                {o.context_label ? `${o.endpoint_name} (${o.context_label})` : o.endpoint_name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Data entities">
          {options
            .filter((o) => o.endpoint_kind === "data_object")
            .map((o) => (
              <option key={encodeFlowEndpointOption(o)} value={encodeFlowEndpointOption(o)}>
                {o.endpoint_name}
              </option>
            ))}
        </optgroup>
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
        ▾
      </span>
    </div>
  );
}
