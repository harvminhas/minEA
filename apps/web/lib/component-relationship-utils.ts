import { objectsApi, relationshipsApi } from "@/lib/api-client";
import type {
  ComponentProperties,
  ComponentRuntimeRef,
  ComponentSystemRef,
  MinEAObject,
  Relationship,
} from "@minea/types";

function relationshipKey(rel: Pick<Relationship, "type" | "from_object_id" | "to_object_id">) {
  return `${rel.type}:${rel.from_object_id}:${rel.to_object_id}`;
}

/** Derive architecture relationships from component properties for immediate UI display. */
export function architectureRelationshipsFromComponent(component: MinEAObject): Relationship[] {
  const props = (component.properties ?? {}) as ComponentProperties;
  const base = {
    workspace_id: component.workspace_id,
    org_id: component.org_id,
    created_by: null as string | null,
    created_at: component.updated_at,
    attributes: {} as Record<string, unknown>,
  };
  const rels: Relationship[] = [];

  for (const sys of props.systems ?? []) {
    rels.push({
      ...base,
      id: `arch-part-of-${sys.system_id}`,
      type: "part_of",
      from_object_id: component.id,
      from_type: "component",
      to_object_id: sys.system_id,
      to_type: "application",
    });
  }

  if (props.runtime) {
    rels.push({
      ...base,
      id: `arch-runs-on-${props.runtime.runtime_id}`,
      type: "runs_on",
      from_object_id: component.id,
      from_type: "component",
      to_object_id: props.runtime.runtime_id,
      to_type: props.runtime.runtime_kind,
    });
  }

  return rels;
}

export function mergeArchitectureRelationships(
  apiRels: Relationship[],
  component: MinEAObject
): Relationship[] {
  const apiKeys = new Set(apiRels.map(relationshipKey));
  const merged = [...apiRels];
  for (const rel of architectureRelationshipsFromComponent(component)) {
    if (!apiKeys.has(relationshipKey(rel))) {
      merged.push(rel);
    }
  }
  return merged;
}

function isComponentArchitectureRel(rel: {
  from_type: string;
  type: string;
}): boolean {
  return (
    rel.from_type === "component" && (rel.type === "part_of" || rel.type === "runs_on")
  );
}

export async function syncComponentRelationships(
  orgSlug: string,
  workspaceSlug: string,
  componentId: string,
  systems: ComponentSystemRef[],
  runtime: ComponentRuntimeRef | null,
  token: string
): Promise<void> {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: componentId },
    token
  );

  const archRels = existing.filter(isComponentArchitectureRel);
  const existingPartOf = archRels.filter((r) => r.type === "part_of");
  const existingRunsOn = archRels.find((r) => r.type === "runs_on");

  const desiredSystemIds = new Set(systems.map((s) => s.system_id));
  const desiredRuntimeKey = runtime
    ? `${runtime.runtime_kind}:${runtime.runtime_id}`
    : null;
  const existingRuntimeKey = existingRunsOn
    ? `${existingRunsOn.to_type}:${existingRunsOn.to_object_id}`
    : null;

  const linkedSystemIds = new Set(existingPartOf.map((r) => r.to_object_id));
  for (const rel of existingPartOf) {
    if (!desiredSystemIds.has(rel.to_object_id)) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
      linkedSystemIds.delete(rel.to_object_id);
    }
  }

  for (const sys of systems) {
    if (!linkedSystemIds.has(sys.system_id)) {
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
      linkedSystemIds.add(sys.system_id);
    }
  }

  if (desiredRuntimeKey !== existingRuntimeKey) {
    if (existingRunsOn) {
      await relationshipsApi.delete(orgSlug, workspaceSlug, existingRunsOn.id, token);
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
}

export type ComponentArchitectureUpdate = {
  systems?: ComponentSystemRef[];
  runtime?: ComponentRuntimeRef | null;
};

export async function persistComponentArchitecture(
  orgSlug: string,
  workspaceSlug: string,
  component: MinEAObject,
  updates: ComponentArchitectureUpdate,
  token: string
): Promise<MinEAObject> {
  const currentProps = (component.properties ?? {}) as ComponentProperties;
  const systems = updates.systems ?? currentProps.systems ?? [];
  const runtime =
    updates.runtime !== undefined ? updates.runtime : (currentProps.runtime ?? null);

  const properties: ComponentProperties = {
    ...currentProps,
    systems,
    runtime,
  };

  await syncComponentRelationships(
    orgSlug,
    workspaceSlug,
    component.id,
    systems,
    runtime,
    token
  );

  const updated = await objectsApi.update(
    orgSlug,
    workspaceSlug,
    component.id,
    { properties: properties as Record<string, unknown> },
    token
  );

  return {
    ...updated,
    properties: {
      ...(updated.properties ?? {}),
      systems,
      runtime,
    },
  };
}
