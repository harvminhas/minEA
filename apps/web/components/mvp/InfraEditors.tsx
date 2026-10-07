"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship, RelationshipCreate } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog, type WorkspaceCatalog } from "@/lib/use-model-catalog";
import type { InfraField } from "@/lib/infra/fields";
import { REGISTRY, SECTION_LABEL, type FieldDef, type RecordType } from "@/lib/fields/registry";
import { applyPatch, fieldIsRequired, readField, sameFieldValue, toPatch, type FieldEdge, type FieldRecord } from "@/lib/fields/save";
import { savesWaiting, trackSave } from "@/lib/fields/save-queue";
import { isFieldManagedEdge, relationCreateLabel } from "@/lib/fields/shared-links";
import { formatOwnershipLabel, ownershipIsValid, type OwnershipValue } from "@/lib/owner-fields";
import { displayVendor, formatDate, knownVendors, moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { dollarsFromCents, readCostLines, runCents } from "@/lib/cost/math";
import { locationPresence } from "@/lib/infra/locations";
import { readRuntimeInfra } from "@/lib/infra/read";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { actsAsFlag, actsAsLabel, readActsAs } from "@/lib/ai/acts-as";
import { emptyTypeHint } from "@/lib/relationship-targets";
import { infraStatus } from "@/lib/infra/status";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { CostSection } from "@/components/mvp/CostSection";
import { ActsAsPicker } from "@/components/mvp/ActsAsPicker";
import { AddChip } from "@/components/mvp/pills";
import { usePermissions } from "@/lib/use-permissions";

function stored(object: MinEAObject, key: string): string {
  const value = (object.properties ?? {})[key];
  return typeof value === "string" ? value : "";
}

export function InfraFields({ object, fields }: { object: MinEAObject; fields: InfraField[] }) {
  return (
    <div>
      {fields.map((field) => (
        <InfraControl key={field.key} object={object} field={field} />
      ))}
    </div>
  );
}

export function InfraControl({
  object,
  field,
  compact,
}: {
  object: MinEAObject;
  field: InfraField;
  compact?: boolean;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const current = stored(object, field.key);
  const known = field.options?.some((option) => option.key === current) ?? false;
  const was = field.type === "enum" && current && !known ? current : "";
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(current);

  const save = async (next: string) => {
    setError("");
    const token = await getToken();
    if (!token || !orgSlug || !workspaceSlug) {
      setError("Not signed in");
      return;
    }
    try {
      const saved = await objectsApi.update(
        orgSlug,
        workspaceSlug,
        object.id,
        { properties: { [field.key]: next || null } },
        token
      );
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const control =
    field.type === "enum" ? (
      <select
        aria-label={field.label}
        value={known ? current : ""}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => save(event.target.value)}
        className="h-8 max-w-full rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px]"
      >
        <option value="">Not set</option>
        {(field.options ?? []).map((option) => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
    ) : field.type === "date" ? (
      <input
        aria-label={field.label}
        type="date"
        defaultValue={current}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => save(event.target.value)}
        className="h-8 rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
      />
    ) : (
      <input
        aria-label={field.label}
        value={draft}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== current) save(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save(draft);
          }
        }}
        className="h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
      />
    );

  if (compact) {
    return (
      <span onClick={(event) => event.stopPropagation()}>
        {control}
        {error && <span className="mt-1 block text-[11px] text-[#b42318]">{error}</span>}
      </span>
    );
  }

  return (
    <div className="py-1.5" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[#8b90a0]">{field.label}</span>
        {control}
      </div>
      {was && <p className="mt-1 text-right text-[12px] text-[#8b90a0]">Was: {was}</p>}
      {error && <p className="mt-1 text-right text-[12px] text-[#b42318]">{error}</p>}
    </div>
  );
}

export function toFieldEdges(rels: { id: string; type: string; from_object_id: string; from_type: string; to_object_id: string; to_type: string }[]): FieldEdge[] {
  return rels.map((rel) => ({
    id: rel.id,
    type: rel.type,
    from_object_id: rel.from_object_id,
    from_type: rel.from_type,
    to_object_id: rel.to_object_id,
    to_type: rel.to_type,
  }));
}

function asRecord(object: MinEAObject, edges: FieldEdge[]): FieldRecord {
  return {
    id: object.id,
    type: object.type,
    name: object.name,
    description: object.description,
    status: object.status,
    tags: object.tags ?? [],
    owner: object.owner,
    owner_team_id: object.owner_team_id,
    owner_team_name: object.owner_team_name,
    point_of_contact_id: object.point_of_contact_id,
    point_of_contact_name: object.point_of_contact_name,
    properties: { ...(object.properties ?? {}) },
    edges,
  };
}

function dateLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return formatDate(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function displayValue(def: FieldDef, record: FieldRecord, object: MinEAObject, edges: FieldEdge[], names: Map<string, string>): string {
  if (def.editor === "none") {
    if (def.key === "runs_on_it") {
      const count = edges.filter((edge) => edge.to_object_id === record.id && edge.type === "runs_on").length;
      return count ? String(count) : "";
    }
    if (def.key === "built_on_it") {
      const count = edges.filter((edge) => edge.to_object_id === record.id && (edge.type === "built_on" || edge.type === "runs_on")).length;
      return count ? String(count) : "";
    }
    if (def.key === "used_by") {
      const count = edges.filter((edge) => edge.to_object_id === record.id && edge.type === "uses_model").length;
      if (count === 0) return "";
      return count === 1 ? "1 agent" : `${count} agents`;
    }
    if (def.key === "status_calc") return infraStatus(readRuntimeInfra(object), new Date()).label;
    return "";
  }
  const value = readField(def, record, edges);
  if (def.key === "acts_as") return actsAsLabel(value);
  if (def.editor === "owner") {
    const owner = value as OwnershipValue;
    if (!owner.ownerTeamName.trim() && !owner.pointOfContactName.trim()) return "";
    return formatOwnershipLabel(owner.ownerTeamName, owner.pointOfContactName);
  }
  if (def.editor === "tags") return Array.isArray(value) ? value.join(", ") : "";
  if (def.editor === "costLines") {
    const lines = readCostLines({ cost_lines: value });
    if (!lines?.length) return "";
    return `${moneyLabel(dollarsFromCents(runCents(lines)))}/yr`;
  }
  if (def.editor === "relation") {
    const ids = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    if (ids.length === 0 && def.key === "vendor") {
      const stored = record.properties.vendor;
      return displayVendor(typeof stored === "string" ? stored : "");
    }
    return ids.map((id) => names.get(id) ?? id).join(", ");
  }
  if (def.editor === "select") {
    const stored = value == null ? "" : String(value);
    return def.options?.find((option) => option.value === stored)?.label ?? stored;
  }
  if (def.editor === "date") return typeof value === "string" && value ? dateLabel(value) : "";
  if (value == null) return "";
  return typeof value === "string" ? value : "";
}

function emptyInput(def: FieldDef, value: unknown): boolean {
  if (def.editor === "owner") return !ownershipIsValid(value as OwnershipValue);
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function RecordFields({
  type,
  object,
  edges,
  row,
  omit = [],
  openKey,
  onOpenKey,
}: {
  type: RecordType;
  object: MinEAObject;
  edges: FieldEdge[];
  row?: CatalogRow;
  omit?: string[];
  openKey?: string | null;
  onOpenKey?: (key: string | null) => void;
}) {
  const { canEdit } = usePermissions();
  const catalog = useModelCatalog();
  const names = new Map((catalog.data?.objects ?? []).map((item) => [item.id, item.name]));
  const record = asRecord(object, edges);
  const groups: { section: FieldDef["section"]; fields: FieldDef[] }[] = [];
  for (const def of REGISTRY[type]) {
    if (omit.includes(def.key)) continue;
    if (def.showIf && !def.showIf({ properties: record.properties, type: record.type })) continue;
    const group = groups.find((item) => item.section === def.section);
    if (group) group.fields.push(def);
    else groups.push({ section: def.section, fields: [def] });
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.section}>
          <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">{SECTION_LABEL[group.section].toUpperCase()}</h3>
          {group.fields.map((def) =>
            def.editor === "costLines" && row ? (
              <CostSection key={def.key} row={row} onSaved={() => undefined} readOnly={!canEdit} />
            ) : (
              <InlineField
                key={def.key}
                def={def}
                object={object}
                edges={edges}
                names={names}
                suggestion={def.key === "vendor" ? row?.suggestion : null}
                forceOpen={openKey === def.key}
                onCloseEdit={() => onOpenKey?.(null)}
              />
            )
          )}
        </section>
      ))}
    </div>
  );
}

export function InlineField({
  def,
  object,
  edges,
  names,
  suggestion,
  bare,
  forceOpen,
  onCloseEdit,
}: {
  def: FieldDef;
  object: MinEAObject;
  edges: FieldEdge[];
  names?: Map<string, string>;
  suggestion?: string | null;
  bare?: boolean;
  forceOpen?: boolean;
  onCloseEdit?: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { canEdit } = usePermissions();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const record = asRecord(object, edges);
  const lookup = names ?? new Map((catalog.data?.objects ?? []).map((item) => [item.id, item.name]));
  const shown = (() => {
    if (def.key === "items_there" || def.key === "apps_affected") {
      const apps = new Set(
        (catalog.data?.rows ?? []).filter((row) => row.kind === "application").map((row) => row.id)
      );
      const presence = locationPresence(object.id, impact.relationships, impact.nodes, impact.edges, apps);
      const count = def.key === "items_there" ? presence.items : presence.apps;
      return count > 0 ? String(count) : "";
    }
    return displayValue(def, record, object, edges, lookup);
  })();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const cancelRef = useRef(false);
  const dirtyRef = useRef(false);

  const openFromCurrent = () => {
    const current = readField(def, record, edges);
    setDraft(Array.isArray(current) ? current.join(", ") : current == null ? "" : String(current));
    setError("");
    cancelRef.current = false;
    dirtyRef.current = false;
    setEditing(true);
  };

  useEffect(() => {
    if (!forceOpen || !canEdit) return;
    openFromCurrent();
    // Opens once when the host link asks; a later catalog update must not reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen, canEdit]);

  const close = () => {
    setEditing(false);
    setError("");
    onCloseEdit?.();
  };

  const [savingVendor, setSavingVendor] = useState(false);
  const acceptVendor = async (vendorName: string) => {
    if (savingVendor) return;
    setSavingVendor(true);
    try {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const party = await ensureExternalParty(vendorName, catalog.data?.objects ?? [], orgSlug, workspaceSlug, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: party });
      await persist(party.id, party.name);
    } catch (err) {
      setError(`Couldn't save: ${err instanceof Error ? err.message : "Could not save"}`);
    } finally {
      setSavingVendor(false);
    }
  };

  const persist = async (value: unknown, label?: string) => {
    if (sameFieldValue(readField(def, record, edges), value)) {
      close();
      return;
    }
    if (fieldIsRequired(def, record) && emptyInput(def, value)) {
      setError("Required");
      return;
    }
    const created: Relationship[] = [];
    const deleted: string[] = [];
    let removed: Relationship[] = [];
    let pending: Relationship[] = [];
    let token: string | null = null;
    if (def.editor === "relation") setEditing(false);
    try {
      const typeOf = (id: string) => {
        const fresh =
          orgSlug && workspaceSlug
            ? queryClient.getQueryData<WorkspaceCatalog>(catalogQueryKey(orgSlug, workspaceSlug))
            : undefined;
        const objects = fresh?.objects ?? catalog.data?.objects ?? [];
        return objects.find((item) => item.id === id)?.type;
      };
      const patch = toPatch(
        def,
        value,
        record,
        edges,
        def.key === "vendor" ? label ?? lookup.get(String(Array.isArray(value) ? value[0] : value)) : undefined,
        typeOf
      );
      const applied = applyPatch(record, patch, edges);
      const optimistic = {
        ...object,
        name: applied.name ?? object.name,
        description: applied.description,
        status: (applied.status ?? object.status) as MinEAObject["status"],
        tags: applied.tags ?? [],
        owner: applied.owner ?? undefined,
        owner_team_id: applied.owner_team_id,
        owner_team_name: applied.owner_team_name,
        point_of_contact_id: applied.point_of_contact_id,
        point_of_contact_name: applied.point_of_contact_name,
        properties: applied.properties,
      } as MinEAObject;
      const catalogRels = catalog.data?.relationships ?? [];
      removed = (patch.removeRelIds ?? [])
        .map((id) => catalogRels.find((rel) => rel.id === id))
        .filter((rel): rel is Relationship => Boolean(rel));
      pending = (patch.addRel ?? []).map((rel, index) => optimisticRelationship(rel, index, object));
      if (orgSlug && workspaceSlug) {
        if (patch.object) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: optimistic });
        for (const rel of removed) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: rel.id });
        for (const rel of pending) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
      }
      token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      for (const rel of patch.addRel ?? []) {
        created.push(await relationshipsApi.create(orgSlug, workspaceSlug, rel, token));
      }
      for (const rel of pending) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: rel.id });
      for (const rel of created) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
      const kept = new Set(created.map((rel) => rel.id));
      for (const id of patch.removeRelIds ?? []) {
        if (kept.has(id)) continue;
        await relationshipsApi.delete(orgSlug, workspaceSlug, id, token);
        deleted.push(id);
      }
      if (patch.object) {
        const body = patch.object;
        const auth = token;
        const saved = await trackSave(object.id, () => objectsApi.update(orgSlug, workspaceSlug, object.id, body, auth));
        if (savesWaiting(object.id) === 0) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
      }
      if (def.editor === "owner") {
        queryClient.invalidateQueries({ queryKey: ["teams", orgSlug, workspaceSlug] });
        queryClient.invalidateQueries({ queryKey: ["people-teams", orgSlug, workspaceSlug] });
        queryClient.invalidateQueries({ queryKey: ["people-contacts", orgSlug, workspaceSlug] });
      }
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
      queryClient.invalidateQueries({ queryKey: ["object", orgSlug, workspaceSlug, object.id] });
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      close();
    } catch (err) {
      if (orgSlug && workspaceSlug) {
        if (token && deleted.length === 0) {
          for (const rel of created) {
            try {
              await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
            } catch {
              // A failed rollback must not hide the original save error.
            }
            applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: rel.id });
          }
        }
        for (const rel of removed.filter((item) => !deleted.includes(item.id))) {
          applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
        }
        for (const rel of pending) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: rel.id });
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
        queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
      }
      setError(`Couldn't save: ${err instanceof Error ? err.message : "Could not save"}`);
    }
  };

  const commitText = (raw: string) => {
    if (cancelRef.current) return;
    if (!dirtyRef.current) {
      close();
      return;
    }
    const next = def.editor === "tags" ? raw.split(",").map((item) => item.trim()).filter(Boolean) : raw;
    void persist(next);
  };

  const start = () => {
    if (!canEdit || def.editor === "none" || def.editor === "costLines") return;
    if (def.editor === "custom" && def.key !== "acts_as") return;
    openFromCurrent();
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      close();
    }
    if (event.key === "Enter" && (def.editor !== "longtext" || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitText(event.currentTarget.value);
    }
  };

  const valueClass = bare
    ? "truncate text-left text-[18px] font-semibold text-[#1c2230]"
    : "text-right text-[13px] text-[#1c2230]";
  const shared = def.source.kind === "rel" && isFieldManagedEdge(def.source.edge);
  const label = bare ? null : (
    <span className="text-[13px] text-[#6b7289]" title={shared ? "Shown in Relationships" : undefined}>{def.label}</span>
  );
  let editor: ReactNode = null;
  if (editing && def.editor === "select") {
    editor = (
      <select
        aria-label={def.label}
        autoFocus
        value={String(readField(def, record, edges) ?? "")}
        onChange={(event) => void persist(event.target.value)}
        onBlur={() => close()}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
        className="h-8 max-w-[220px] rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px]"
      >
        <option value="">Not set</option>
        {(def.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  } else if (editing && (def.editor === "text" || def.editor === "number" || def.editor === "date" || def.editor === "tags")) {
    editor = (
      <input
        aria-label={def.label}
        autoFocus
        type={def.editor === "date" ? "date" : def.editor === "number" ? "number" : "text"}
        value={draft}
        onChange={(event) => {
          dirtyRef.current = true;
          setDraft(event.target.value);
        }}
        onBlur={(event) => commitText(event.currentTarget.value)}
        onKeyDown={onKey}
        className="h-8 w-[220px] max-w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
      />
    );
  } else if (editing && def.editor === "longtext") {
    editor = (
      <textarea
        aria-label={def.label}
        autoFocus
        value={draft}
        onChange={(event) => {
          dirtyRef.current = true;
          setDraft(event.target.value);
        }}
        onBlur={(event) => commitText(event.currentTarget.value)}
        onKeyDown={onKey}
        className="min-h-[72px] w-full rounded-lg border border-[#e6e8ee] px-2 py-1 text-[13px]"
      />
    );
  } else if (editing && def.editor === "owner") {
    const current = readField(def, record, edges) as OwnershipValue;
    editor = (
      <OwnerPopover
        value={current}
        required={fieldIsRequired(def, record)}
        onCancel={close}
        onSave={(value) => void persist(value)}
      />
    );
  } else if (editing && def.key === "acts_as") {
    editor = (
      <ActsAsPicker
        value={readActsAs(readField(def, record, edges))}
        onCancel={close}
        onSave={(value) => void persist(value)}
      />
    );
  } else if (editing && def.editor === "relation" && def.source.kind === "rel") {
    editor = (
      <RelationPopover
        def={def}
        value={readField(def, record, edges)}
        selfId={object.id}
        onCancel={close}
        onSave={(value, label) => void persist(value, label)}
      />
    );
  }

  const actsFlag = !editing && def.key === "acts_as" ? actsAsFlag(readField(def, record, edges)) : null;

  return (
    <div className={bare ? "" : "py-1.5"} title={def.readOnlyReason}>
      <div className={bare ? "" : "flex items-start justify-between gap-3"}>
        {label}
        <div className={bare ? "" : "text-right"}>
          {editor ?? (
            shown ? (
              canEdit ? (
                <button type="button" onClick={start} className={valueClass}>
                  {shown}
                </button>
              ) : (
                <span className={valueClass}>{shown}</span>
              )
            ) : !canEdit || def.editor === "none" ? (
              <span className="text-[13px] text-[#b0b4c0]">—</span>
            ) : (
              <AddChip label="Add" onClick={start} />
            )
          )}
          {actsFlag && <p className="mt-1 text-[12px] text-[#b45309]">{actsFlag}</p>}
          {error && <p className="mt-1 text-[12px] text-[#b42318]">{error}</p>}
          {canEdit && def.key === "vendor" && !shown && !editing && suggestion && !dismissed && (
            <p className="mt-1 text-[12px] text-[#8b90a0]">
              Suggested: {suggestion}
              {" · "}
              <button type="button" className="text-[#5b4ce6] disabled:opacity-50" disabled={savingVendor} onClick={() => void acceptVendor(suggestion)}>Accept</button>
              {" · "}
              <button type="button" className="text-[#6b7289]" onClick={() => setDismissed(true)}>Dismiss</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function optimisticRelationship(rel: RelationshipCreate, index: number, object: MinEAObject): Relationship {
  return {
    id: `optimistic-${index}-${rel.from_object_id}-${rel.to_object_id}`,
    workspace_id: object.workspace_id,
    org_id: object.org_id,
    type: rel.type,
    from_object_id: rel.from_object_id,
    from_type: rel.from_type,
    to_object_id: rel.to_object_id,
    to_type: rel.to_type,
    attributes: rel.attributes ?? {},
    created_at: new Date().toISOString(),
  };
}

function OwnerPopover({
  value,
  required,
  onSave,
  onCancel,
}: {
  value: OwnershipValue;
  required: boolean;
  onSave: (value: OwnershipValue) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Close owner"
        className="fixed inset-0 z-10 cursor-default"
        onClick={() => {
          if (sameFieldValue(value, draft)) onCancel();
          else onSave(draft);
        }}
      />
      <div className="absolute right-0 z-20 w-[280px] rounded-lg border border-[#e6e8ee] bg-white p-3 text-left shadow-lg" onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
        <OwnershipFields value={draft} onChange={setDraft} required={required} keepContactOnTeamChange />
      </div>
    </div>
  );
}

function sameVendorName(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function ensureExternalParty(
  name: string,
  objects: MinEAObject[],
  orgSlug: string,
  workspaceSlug: string,
  token: string
) {
  const found = objects.find((item) => item.type === "external_party" && sameVendorName(item.name, name));
  if (found) return found;
  return objectsApi.create(orgSlug, workspaceSlug, { type: "external_party", name: name.trim(), properties: {} }, token);
}

function RelationPopover({
  def,
  value,
  selfId,
  onSave,
  onCancel,
}: {
  def: FieldDef;
  value: unknown;
  selfId: string;
  onSave: (value: unknown, label?: string) => void;
  onCancel: () => void;
}) {
  const source = def.source.kind === "rel" ? def.source : null;
  const catalog = useModelCatalog();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(Array.isArray(value) ? value.map(String) : value ? [String(value)] : []);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!source) return null;
  const needle = query.trim().toLowerCase();
  const objects = catalog.data?.objects ?? [];
  const choices = objects.filter(
    (item) => item.id !== selfId && source.target.includes(item.type) && (!needle || item.name.toLowerCase().includes(needle))
  );
  const partyNames = new Set(
    objects.filter((item) => item.type === "external_party").map((item) => item.name.trim().toLowerCase())
  );
  const textNames = def.key === "vendor"
    ? knownVendors(catalog.data?.rows ?? []).filter(
        (name) => !partyNames.has(name.trim().toLowerCase()) && (!needle || name.toLowerCase().includes(needle))
      )
    : [];
  const creatable =
    source.target.length === 1
      ? source.target.find((target) => target === "cloud_service" || target === "model" || target === "location")
      : undefined;
  const canCreate = def.key === "vendor" || Boolean(creatable);
  const createLabel = relationCreateLabel(source.target, query, [...choices.map((item) => item.name), ...textNames]);
  const noOptions = objects.every((item) => item.id === selfId || !source.target.includes(item.type));
  const choose = (id: string, label?: string) => {
    if (pending) return;
    if (source.single) {
      setQuery("");
      onSave(id, label);
      return;
    }
    setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const pickVendorName = async (vendorName: string) => {
    if (pending || !orgSlug || !workspaceSlug) return;
    setPending(true);
    setQuery("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const party = await ensureExternalParty(vendorName, objects, orgSlug, workspaceSlug, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: party });
      onSave(party.id, party.name);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Could not create");
    }
  };
  const createNamed = async () => {
    const name = query.trim();
    if (!name || !creatable || !orgSlug || !workspaceSlug || pending) return;
    setPending(true);
    setQuery("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const created = await objectsApi.create(orgSlug, workspaceSlug, {
        type: creatable,
        name,
        properties: creatable === "location" ? { location_type: "other" } : {},
      }, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
      if (source.single) onSave(created.id);
      else setPicked((current) => [...current, created.id]);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Could not create");
    }
  };

  // Esc and click-outside both keep the ticked items, like closing a menu.
  const finish = () => {
    const next = source.single ? (picked[0] ?? "") : picked;
    if (sameFieldValue(value, next)) onCancel();
    else onSave(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-10 cursor-default"
        onClick={finish}
      />
      <div
        className="absolute right-0 z-20 w-[260px] rounded-lg border border-[#e6e8ee] bg-white p-2 text-left shadow-lg"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          finish();
        }}
      >
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={noOptions && canCreate ? "Type a name to create" : "Search"} className="mb-2 h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[13px]" />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {choices.slice(0, 8).map((item) => (
            <button key={item.id} type="button" onClick={() => choose(item.id, def.key === "vendor" ? item.name : undefined)} className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#fafafb]">
              {!source.single && <span className="mr-2">{picked.includes(item.id) ? "✓" : ""}</span>}
              {item.name}
            </button>
          ))}
          {textNames.slice(0, 8).map((name) => (
            <button key={name} type="button" disabled={pending} onClick={() => void pickVendorName(name)} className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#fafafb] disabled:opacity-50">
              {name}
            </button>
          ))}
          {choices.length === 0 && textNames.length === 0 && !createLabel && !noOptions && (
            <p className="px-2 py-2 text-[12px] text-[#8b90a0]">Nothing matches.</p>
          )}
        </div>
        {noOptions && !canCreate && (
          <p className="px-2 py-2 text-[12px] text-[#8b90a0]">{emptyTypeHint(source.target[0] ?? "")}</p>
        )}
        {createLabel && !pending && (
          <button
            type="button"
            className="mt-2 text-[12px] font-medium text-[#5b4ce6]"
            onClick={() => void (def.key === "vendor" ? pickVendorName(query.trim()) : createNamed())}
          >
            {createLabel}
          </button>
        )}
        {error && <p className="mt-1 text-[12px] text-[#b42318]">{error}</p>}
      </div>
    </div>
  );
}
