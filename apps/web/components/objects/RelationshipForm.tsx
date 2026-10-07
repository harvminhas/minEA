"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search } from "lucide-react";
import { type MinEAObject, type ObjectListResponse, type ObjectType, type Relationship, type RelationshipType, ALLOWED_TRIPLES, RELATIONSHIP_LABELS } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { tripleKey } from "@/lib/allowed-triples";
import { appendComponentSystemRef } from "@/lib/component-relationship-utils";
import { applyPatch, type FieldEdge, type FieldRecord } from "@/lib/fields/save";
import { CreateComponentPanel } from "@/components/application/CreateComponentPanel";
import { catalogStats, catalogVendorNames } from "@/lib/model-catalog";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { usePermissions } from "@/lib/use-permissions";
import { useTenancy } from "@/lib/tenancy";
import { detailsAlsoSetsHint } from "@/lib/fields/shared-links";
import {
  emptyTypeHint,
  linkGroupsFor,
  linksForTarget,
  linkTargetsFor,
  NAME_ONLY_LINK_TYPES,
  patchForPickedLink,
  pickedLinkExisted,
  uiTypeLabel,
} from "@/lib/relationship-targets";

interface Props {
  fromObject: MinEAObject;
  onClose: () => void;
  onSuccess: (rel: Relationship) => void;
  /** Pre-select target object type in the link picker (e.g. data_store). */
  initialTargetType?: string;
}

type PickerChoice = {
  id: string;
  name: string;
  type: string;
  object?: MinEAObject;
  createName?: string;
};

type RelDirection = "outbound" | "inverse";

type RelOption = {
  key: string;
  type: RelationshipType;
  label: string;
  outbound: boolean;
  inverse: boolean;
};

const ALLOWED_TRIPLE_KEYS = new Set(
  ALLOWED_TRIPLES.map(([type, from, to]) => tripleKey(type, from, to))
);

function allowedTriple(type: string, from: string, to: string): boolean {
  return ALLOWED_TRIPLE_KEYS.has(tripleKey(type, from, to));
}

function connectableTargetTypes(fromType: string): string[] {
  const types: string[] = [];
  for (const link of linkTargetsFor(fromType)) {
    if (!types.includes(link.target)) types.push(link.target);
  }
  return types;
}

function defaultDirection(option: RelOption): RelDirection {
  return option.outbound ? "outbound" : "inverse";
}

function buildRelationshipOptionsForTarget(fromType: string, targetType: string): RelOption[] {
  const byType = new Map<string, RelOption>();
  for (const link of linksForTarget(fromType, targetType)) {
    const outbound = link.direction !== "inverse" && allowedTriple(link.type, fromType, targetType);
    const inverse = link.direction !== "outbound" && allowedTriple(link.type, targetType, fromType);
    if (!outbound && !inverse) continue;
    const words = RELATIONSHIP_LABELS[link.type as RelationshipType];
    if (!words) continue;
    byType.set(link.type, {
      key: link.type,
      type: link.type as RelationshipType,
      label: inverse && !outbound ? words.reverse : words.forward,
      outbound,
      inverse,
    });
  }
  return [...byType.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function RelationshipForm({ fromObject, onClose, onSuccess, initialTargetType }: Props) {
  const { getToken } = useAuth();
  const { canEdit } = usePermissions();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const [targetSearch, setTargetSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(() =>
    initialTargetType &&
    (connectableTargetTypes(fromObject.type).includes(initialTargetType) || initialTargetType === "component")
      ? initialTargetType
      : ""
  );
  const [selectedTarget, setSelectedTarget] = useState<MinEAObject | null>(null);
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [direction, setDirection] = useState<RelDirection>("outbound");
  const [flowHow, setFlowHow] = useState("");
  const [flowFrequency, setFlowFrequency] = useState("");
  const [createError, setCreateError] = useState("");
  const [creatingComponent, setCreatingComponent] = useState(false);

  useEffect(() => {
    if (!canEdit) onClose();
    // Close once for a viewer. onClose changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const linkGroups = useMemo(
    () => linkGroupsFor(fromObject.type, initialTargetType === "component" ? ["component"] : []),
    [fromObject.type, initialTargetType]
  );
  const connectableTypes = useMemo(
    () => linkGroups.flatMap((group) => group.options.map((option) => option.type)),
    [linkGroups]
  );

  const typeCounts = useMemo(() => {
    if (!catalog.data) return null;
    const counts = new Map<string, number>();
    for (const object of catalog.data.objects) {
      counts.set(object.type, (counts.get(object.type) ?? 0) + 1);
    }
    return counts;
  }, [catalog.data]);
  const vendorCount = catalog.data ? catalogStats(catalog.data.rows).vendorCount : undefined;

  const searchableTypes = typeFilter ? [typeFilter] : [];

  const { data: candidates, isError, isPending, refetch } = useQuery({
    queryKey: ["objects-candidates", orgSlug, workspaceSlug, fromObject.type, typeFilter, targetSearch],
    enabled: connectableTypes.length > 0 && typeFilter.length > 0,
    queryFn: async () => {
      const token = await getToken();
      const results = await Promise.all(
        searchableTypes.map((type) =>
          objectsApi.list(orgSlug, workspaceSlug, { type, search: targetSearch || undefined }, token!)
        )
      );
      return results
        .flatMap((r: ObjectListResponse) => r.items)
        .filter((obj) => obj.id !== fromObject.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const relationshipOptions = useMemo(() => {
    if (!selectedTarget) return [];
    return buildRelationshipOptionsForTarget(fromObject.type, selectedTarget.type);
  }, [fromObject.type, selectedTarget]);

  const selectedOption = relationshipOptions.find((option) => option.key === selectedOptionKey);
  const canSwap = Boolean(
    selectedOption && (direction === "outbound" ? selectedOption.inverse : selectedOption.outbound)
  );

  const resolvedTriple = useMemo(() => {
    if (!selectedOption || !selectedTarget) return null;
    if (direction === "outbound") {
      return {
        type: selectedOption.type,
        fromType: fromObject.type,
        toType: selectedTarget.type,
        fromId: fromObject.id,
        toId: selectedTarget.id,
      };
    }
    return {
      type: selectedOption.type,
      fromType: selectedTarget.type,
      toType: fromObject.type,
      fromId: selectedTarget.id,
      toId: fromObject.id,
    };
  }, [direction, fromObject, selectedOption, selectedTarget]);

  const detailsHint = resolvedTriple ? detailsAlsoSetsHint(resolvedTriple.type, resolvedTriple.fromType) : null;
  const sentence = resolvedTriple && selectedTarget
    ? direction === "inverse" && resolvedTriple.type === "supplied_by"
      ? `${fromObject.name} supplies ${selectedTarget.name}`
      : RELATIONSHIP_LABELS[resolvedTriple.type].sentence(
          resolvedTriple.fromId === fromObject.id ? fromObject.name : selectedTarget.name,
          resolvedTriple.toId === selectedTarget.id ? selectedTarget.name : fromObject.name
        )
    : "";
  const sentenceSource = direction === "inverse" && selectedTarget ? selectedTarget : fromObject;
  const linkToRecord = direction === "inverse" && selectedTarget ? fromObject : selectedTarget;

  const isValidTriple = resolvedTriple
    ? allowedTriple(resolvedTriple.type, resolvedTriple.fromType, resolvedTriple.toType)
    : false;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!resolvedTriple || !isValidTriple || !selectedOption || !selectedTarget) return;
      setCreateError("");
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const record: FieldRecord = {
        id: fromObject.id,
        type: fromObject.type,
        name: fromObject.name,
        description: fromObject.description,
        status: fromObject.status,
        tags: fromObject.tags,
        owner: fromObject.owner,
        owner_team_id: fromObject.owner_team_id,
        owner_team_name: fromObject.owner_team_name,
        point_of_contact_id: fromObject.point_of_contact_id,
        point_of_contact_name: fromObject.point_of_contact_name,
        properties: { ...(fromObject.properties ?? {}) },
      };
      const edges: FieldEdge[] = (catalog.data?.relationships ?? [])
        .filter((rel) => rel.from_object_id === fromObject.id || rel.to_object_id === fromObject.id)
        .map((rel) => ({
          id: rel.id,
          type: rel.type,
          from_object_id: rel.from_object_id,
          from_type: rel.from_type,
          to_object_id: rel.to_object_id,
          to_type: rel.to_type,
        }));
      const patch = patchForPickedLink(
        fromObject.type,
        { type: selectedOption.type, target: selectedTarget.type, direction },
        selectedTarget.id,
        record,
        edges,
        selectedTarget.name
      );
      if (patch && orgSlug && workspaceSlug) {
        const applied = applyPatch(record, patch, edges);
        const pending = (patch.addRel ?? []).map((rel, index) => ({
          id: `optimistic-${index}-${rel.from_object_id}-${rel.to_object_id}`,
          workspace_id: fromObject.workspace_id,
          org_id: fromObject.org_id,
          type: rel.type,
          from_object_id: rel.from_object_id,
          from_type: rel.from_type,
          to_object_id: rel.to_object_id,
          to_type: rel.to_type,
          attributes: rel.attributes ?? {},
          created_at: new Date().toISOString(),
        })) satisfies Relationship[];
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, {
          object: { ...fromObject, properties: applied.properties, status: (applied.status ?? fromObject.status) as MinEAObject["status"] },
        });
        for (const id of patch.removeRelIds ?? []) {
          applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
        }
        for (const rel of pending) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
        try {
          const created: Relationship[] = [];
          const results: { status: number; body: Relationship }[] = [];
          for (const rel of patch.addRel ?? []) {
            const result = await relationshipsApi.createWithStatus(orgSlug, workspaceSlug, rel, token);
            results.push(result);
            created.push(result.body);
          }
          const existed = pickedLinkExisted(results, selectedTarget.id);
          for (const rel of pending) {
            applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: rel.id });
          }
          for (const rel of created) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: rel });
          const kept = new Set(created.map((rel) => rel.id));
          for (const id of patch.removeRelIds ?? []) {
            if (kept.has(id)) continue;
            await relationshipsApi.delete(orgSlug, workspaceSlug, id, token);
          }
          if (patch.object) {
            const saved = await objectsApi.update(orgSlug, workspaceSlug, fromObject.id, patch.object, token);
            applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
          }
          const relationship =
            created.find((rel) => rel.to_object_id === selectedTarget.id || rel.from_object_id === selectedTarget.id) ??
            created[created.length - 1];
          if (!relationship) return;
          return { relationship, existed };
        } catch (err) {
          queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
          throw err;
        }
      }

      const created = await relationshipsApi.createWithStatus(
        orgSlug,
        workspaceSlug,
        {
          type: resolvedTriple.type as never,
          from_object_id: resolvedTriple.fromId,
          from_type: resolvedTriple.fromType,
          to_object_id: resolvedTriple.toId,
          to_type: resolvedTriple.toType,
          ...(resolvedTriple.type === "sends_data_to"
            ? {
                attributes: {
                  ...(flowHow ? { how: flowHow } : {}),
                  ...(flowFrequency ? { frequency: flowFrequency } : {}),
                },
              }
            : {}),
        },
        token
      );

      if (
        direction === "inverse" &&
        resolvedTriple.type === "part_of" &&
        selectedTarget?.type === "component" &&
        fromObject.type === "application"
      ) {
        await appendComponentSystemRef(orgSlug, workspaceSlug, selectedTarget, fromObject, token);
      }

      return { relationship: created.body, existed: created.status === 200 };
    },
    onSuccess: (result) => {
      if (!result) return;
      if (orgSlug && workspaceSlug) {
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: result.relationship });
        queryClient.invalidateQueries({ queryKey: ["relationships"] });
      }
      if (result.existed) {
        setCreateError("That relationship already exists");
        return;
      }
      onSuccess(result.relationship);
    },
  });

  const createTarget = useMutation({
    mutationFn: async (explicitName: string | undefined) => {
      const name = (explicitName ?? targetSearch).trim();
      const type = explicitName ? "external_party" : typeFilter;
      if (!canEdit || !name || !NAME_ONLY_LINK_TYPES.has(type)) return;
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        { type: type as ObjectType, name },
        token
      );
    },
    onSuccess: (created) => {
      if (!created || !orgSlug || !workspaceSlug) return;
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
      setCreateError("");
      selectTarget(created);
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Could not create");
    },
  });

  function chooseType(key: string, options = relationshipOptions) {
    setSelectedOptionKey(key);
    setFlowHow("");
    setFlowFrequency("");
    const option = options.find((item) => item.key === key);
    setDirection(option ? defaultDirection(option) : "outbound");
  }

  function selectTarget(obj: MinEAObject) {
    setSelectedTarget(obj);
    const options = buildRelationshipOptionsForTarget(fromObject.type, obj.type);
    if (options.length === 1) chooseType(options[0].key, options);
    else chooseType("");
  }

  function clearTarget() {
    setSelectedTarget(null);
    chooseType("");
  }

  if (!canEdit) return null;

  if (creatingComponent) {
    const preset =
      fromObject.type === "application" ||
      fromObject.type === "solution" ||
      fromObject.type === "technical_capability"
        ? [{ system_id: fromObject.id, system_name: fromObject.name, system_type: fromObject.type }]
        : [];
    return (
      <CreateComponentPanel
        presetSystems={preset}
        onClose={() => setCreatingComponent(false)}
        onSuccess={() => {
          setCreatingComponent(false);
          onClose();
        }}
      />
    );
  }

  const trimmedSearch = targetSearch.trim();
  const objectItems: PickerChoice[] = (candidates ?? []).map((obj) => ({
    id: obj.id,
    name: obj.name,
    type: obj.type,
    object: obj,
  }));
  const partyItems: PickerChoice[] =
    typeFilter === "external_party"
      ? (catalog.data?.parties ?? [])
          .filter((item) => item.id !== fromObject.id)
          .filter((item) => !objectItems.some((listed) => listed.id === item.id))
          .filter((item) => !trimmedSearch || item.name.toLowerCase().includes(trimmedSearch.toLowerCase()))
          .map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            object: item,
          }))
      : [];
  const listedNames = new Set(
    [...objectItems, ...partyItems].map((item) => item.name.trim().toLowerCase())
  );
  const vendorItems: PickerChoice[] =
    typeFilter === "external_party" && catalog.data
      ? catalogVendorNames(catalog.data.rows)
          .filter((name) => !trimmedSearch || name.toLowerCase().includes(trimmedSearch.toLowerCase()))
          .filter((name) => !listedNames.has(name.trim().toLowerCase()))
          .map((name) => ({
            id: `vendor:${name}`,
            name,
            type: "external_party",
            createName: name,
          }))
      : [];
  const pickerItems: PickerChoice[] = [...objectItems, ...partyItems, ...vendorItems];
  const listError = isError;
  const listPending = isPending;
  const offerCreate =
    canEdit &&
    NAME_ONLY_LINK_TYPES.has(typeFilter) &&
    trimmedSearch.length > 0 &&
    !listError &&
    !listPending &&
    pickerItems.length === 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[100]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] bg-white rounded-xl shadow-2xl z-[110]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Add Relationship</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <div className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-md text-sm text-gray-700">
              <span className="font-medium">{sentenceSource.name}</span>
              <span className="text-gray-400">({uiTypeLabel(sentenceSource.type, true)})</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link to *</label>
            {connectableTypes.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No relationships allowed from this object type.</p>
            ) : selectedTarget ? (
              <div className="flex items-center gap-2 py-2 px-3 bg-indigo-50 border border-indigo-100 rounded-md text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-indigo-900">{linkToRecord?.name}</span>
                  <span className="text-indigo-600/70 ml-2">
                    ({uiTypeLabel(linkToRecord?.type ?? "", true)})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearTarget}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setTargetSearch("");
                    setCreateError("");
                  }}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select object type...</option>
                  {linkGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => {
                        const count = option.type === "external_party" ? vendorCount : typeCounts?.get(option.type);
                        const known = option.type === "external_party" ? catalog.data != null : typeCounts != null;
                        const empty = known && (count ?? 0) === 0 && option.type !== "component";
                        const name = option.label;
                        return (
                          <option key={option.type} value={option.type} disabled={empty}>
                            {empty ? `${name} — ${emptyTypeHint(option.type)}` : known ? `${name} (${count ?? 0})` : name}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
                {!typeFilter ? (
                  <p className="text-xs text-gray-400 mt-2">
                    Choose an object type to search and select a target.
                  </p>
                ) : (
                  <>
                    <div className="relative mb-2 mt-2">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={targetSearch}
                        onChange={(e) => {
                          setTargetSearch(e.target.value);
                          setCreateError("");
                        }}
                        placeholder="Search by name..."
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-md divide-y divide-gray-50">
                      {pickerItems.map((obj) => (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() => {
                            if (obj.object) {
                              selectTarget(obj.object);
                              return;
                            }
                            if (obj.createName) {
                              createTarget.mutate(obj.createName);
                              return;
                            }
                            selectTarget(obj as unknown as MinEAObject);
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors text-gray-700"
                        >
                          <span className="font-medium">{obj.name}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({uiTypeLabel(obj.type, true)})
                          </span>
                        </button>
                      ))}
                      {listError ? (
                        <p className="text-xs text-gray-400 px-3 py-2">
                          Couldn't load objects
                          {" · "}
                          <button
                            type="button"
                            onClick={() => void refetch()}
                            className="font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            Retry
                          </button>
                        </p>
                      ) : listPending ? null : offerCreate ? (
                        <div className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => createTarget.mutate(undefined)}
                            disabled={createTarget.isPending}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                          >
                            {createTarget.isPending ? "Creating..." : `+ Create '${trimmedSearch}'`}
                          </button>
                          {createError && <p className="mt-1 text-xs text-red-600">{createError}</p>}
                        </div>
                      ) : pickerItems.length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-2">No matching objects found.</p>
                      ) : null}
                      {typeFilter === "component" && canEdit && (
                        <div className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setCreatingComponent(true)}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            + Create a component
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {selectedTarget && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Relationship type *</label>
              {relationshipOptions.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">
                  No relationship types are allowed between these object types.
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedOptionKey}
                    onChange={(e) => chooseType(e.target.value)}
                    className="min-w-0 flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select relationship type...</option>
                    {relationshipOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span title={canSwap ? "Swap direction" : "That direction isn't allowed"}>
                    <button
                      type="button"
                      disabled={!canSwap}
                      onClick={() => setDirection((current) => (current === "outbound" ? "inverse" : "outbound"))}
                      className="h-full rounded-md border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ⇄
                    </button>
                  </span>
                </div>
              )}
              {detailsHint && <p className="mt-2 text-xs text-gray-500">{detailsHint}</p>}
              {selectedOption?.type === "sends_data_to" && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium text-gray-700">
                    How
                    <select
                      value={flowHow}
                      onChange={(e) => setFlowHow(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Optional</option>
                      <option value="api">API</option>
                      <option value="file">File</option>
                      <option value="manual">Manual</option>
                      <option value="integration_tool">Integration tool</option>
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-gray-700">
                    Frequency
                    <select
                      value={flowFrequency}
                      onChange={(e) => setFlowFrequency(e.target.value)}
                      className="mt-1 w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">Optional</option>
                      <option value="realtime">Realtime</option>
                      <option value="daily">Daily</option>
                      <option value="ad_hoc">Ad hoc</option>
                    </select>
                  </label>
                </div>
              )}
              {sentence && <p className="mt-3 text-sm text-gray-800">{sentence}</p>}
            </div>
          )}
        </div>

        {createError && <p className="px-5 pt-3 text-xs text-red-600">{createError}</p>}
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!selectedTarget || !selectedOption || !isValidTriple || mutation.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            {mutation.isPending ? "Adding..." : "Add relationship"}
          </button>
        </div>
      </div>
    </>
  );
}
