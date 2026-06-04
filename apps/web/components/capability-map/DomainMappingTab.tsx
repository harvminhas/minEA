"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import type {
  CapabilityMapCapability,
  CapabilityMapDomain,
  DomainDetail,
  DomainMappingSystem,
  MappingFitness,
} from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { objectsApi } from "@/lib/api-client";
import {
  addDomainMappingSystem,
  createDomainMappingSystem,
  upsertDomainMapping,
} from "@/lib/domain-detail";
import { AddCapabilityPickerDialog } from "@/components/capability-map/AddCapabilityPickerDialog";
import { EditCapabilityDialog } from "@/components/capability-map/EditCapabilityDialog";
import { AddMappingSystemDialog } from "@/components/capability-map/AddMappingSystemDialog";
import { MapCapabilitySystemDialog } from "@/components/capability-map/MapCapabilitySystemDialog";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { HoverActionMenu } from "@/components/ui/HoverActionMenu";
import { capabilityDeleteMessage } from "@/lib/capability-delete-messages";

// Solid saturated colours matching the wireframe
const FITNESS_CELL: Record<MappingFitness, { cell: string; hover: string; text: string }> = {
  none:     { cell: "bg-white",         hover: "hover:bg-gray-50",     text: "text-transparent" },
  weak:     { cell: "bg-red-500",       hover: "hover:bg-red-600",     text: "text-white" },
  adequate: { cell: "bg-amber-400",     hover: "hover:bg-amber-500",   text: "text-white" },
  strong:   { cell: "bg-emerald-500",   hover: "hover:bg-emerald-600", text: "text-white" },
};

const FITNESS_LABEL: Record<MappingFitness, string> = {
  none:     "",
  weak:     "Weak",
  adequate: "Adequate",
  strong:   "Strong",
};

interface Props {
  domain: DomainDetail;
  pickerDomain: CapabilityMapDomain;
  onRefresh: () => void;
}

interface CellSelection {
  capability: CapabilityMapCapability;
  system?: DomainMappingSystem | null;
  fitness?: MappingFitness | null;
}

function systemSubtitle(system: DomainMappingSystem) {
  const parts = [
    system.category,
    system.hosting_model?.replace(/_/g, " "),
  ].filter(Boolean);
  return parts.join(" · ") || "System";
}

function capabilityRowMeta(
  capabilityId: string,
  mappings: DomainDetail["mappings"]
) {
  const count = mappings.filter((mapping) => mapping.capability_id === capabilityId).length;
  if (count === 0) return { label: "No systems · gap", isGap: true, count: 0 };
  return {
    label: `${count} system${count === 1 ? "" : "s"}`,
    isGap: false,
    count,
  };
}

export function DomainMappingTab({ domain, pickerDomain, onRefresh }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [filter, setFilter] = useState("");
  const [showAddSystem, setShowAddSystem] = useState(false);
  const [showAddCapability, setShowAddCapability] = useState(false);
  const [editCapability, setEditCapability] = useState<CapabilityMapCapability | null>(null);
  const [deleteCapability, setDeleteCapability] = useState<CapabilityMapCapability | null>(null);
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);

  const mappingLookup = useMemo(() => {
    const map = new Map<string, { fitness: MappingFitness; relationshipId: string }>();
    for (const mapping of domain.mappings) {
      map.set(`${mapping.capability_id}:${mapping.system_id}`, {
        fitness: mapping.fitness,
        relationshipId: mapping.relationship_id,
      });
    }
    return map;
  }, [domain.mappings]);

  const filteredSystems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return domain.systems;
    return domain.systems.filter((system) => system.name.toLowerCase().includes(query));
  }, [domain.systems, filter]);

  const upsertMutation = useMutation({
    mutationFn: async ({
      capabilityId,
      systemId,
      fitness,
      createName,
    }: {
      capabilityId: string;
      systemId: string;
      fitness: MappingFitness;
      createName?: string;
    }) => {
      const token = await getToken();
      let resolvedSystemId = systemId;

      if (!resolvedSystemId && createName) {
        const created = await createDomainMappingSystem(
          orgSlug,
          workspaceSlug,
          domain.id,
          createName,
          token!
        );
        resolvedSystemId =
          created.systems.find((system) => system.name.toLowerCase() === createName.toLowerCase())?.id ??
          created.systems[created.systems.length - 1]?.id ??
          "";
      }

      if (!resolvedSystemId) return;

      await upsertDomainMapping(
        orgSlug,
        workspaceSlug,
        domain.id,
        capabilityId,
        resolvedSystemId,
        fitness,
        token!
      );
    },
    onSuccess: () => {
      setCellSelection(null);
      onRefresh();
    },
  });

  const addSystemMutation = useMutation({
    mutationFn: async ({ systemId, createName }: { systemId?: string; createName?: string }) => {
      const token = await getToken();
      if (createName) {
        await createDomainMappingSystem(orgSlug, workspaceSlug, domain.id, createName, token!);
        return;
      }
      if (systemId) {
        await addDomainMappingSystem(orgSlug, workspaceSlug, domain.id, systemId, token!);
      }
    },
    onSuccess: () => {
      setShowAddSystem(false);
      onRefresh();
    },
  });

  const createCapabilityMutation = useMutation({
    mutationFn: async ({ name, owner }: { name: string; owner?: string }) => {
      const token = await getToken();
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "capability",
          name,
          owner,
          status: "active",
          properties: {
            domain_id: domain.id,
            order_index: domain.capabilities.length,
          },
        },
        token!
      );
    },
    onSuccess: () => {
      setShowAddCapability(false);
      onRefresh();
    },
  });

  const deleteCapabilityMutation = useMutation({
    mutationFn: async (capabilityId: string) => {
      const token = await getToken();
      await objectsApi.delete(orgSlug, workspaceSlug, capabilityId, token!);
    },
    onSuccess: () => {
      setDeleteCapability(null);
      onRefresh();
    },
  });

  const isBusy =
    upsertMutation.isPending ||
    addSystemMutation.isPending ||
    createCapabilityMutation.isPending ||
    deleteCapabilityMutation.isPending;

  return (
    <>
      <div className="flex flex-col h-full min-h-0 bg-white">
        {/* Toolbar */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-100 bg-white">
          <div className="relative w-52 flex-shrink-0">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter systems..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
            />
          </div>

          <p className="text-sm text-gray-400 flex-1 text-center hidden md:block">
            Click cells to set fitness
          </p>

          <div className="flex items-center gap-4 text-xs font-medium flex-shrink-0">
            <LegendSwatch color="bg-emerald-500" label="Strong" />
            <LegendSwatch color="bg-amber-400" label="Adequate" />
            <LegendSwatch color="bg-red-500" label="Weak" />
            <LegendSwatch color="bg-gray-200" label="None" />
          </div>
        </div>

        {/* Grid — content-sized, centered; scrolls horizontally when many systems */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="mx-auto w-max">
            <table className="border-collapse w-max table-fixed">
            <colgroup>
              <col className="w-[220px]" />
              {filteredSystems.map((system) => (
                <col key={system.id} className="w-[128px]" />
              ))}
              <col className="w-[72px]" />
            </colgroup>
            <thead>
              <tr>
                {/* Corner cell */}
                <th className="sticky left-0 z-20 bg-gray-50 border-b border-r border-gray-200 px-5 py-3 text-left">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">
                    <span className="block">Capability</span>
                    <span className="block">↓ / System →</span>
                  </div>
                </th>

                {filteredSystems.map((system) => {
                  const subtitle = systemSubtitle(system);
                  const isRetiring = system.status === "retiring" || system.status === "retired";
                  return (
                    <th
                      key={system.id}
                      className="border-b border-r border-gray-200 bg-gray-50 px-4 py-3 text-left align-top"
                    >
                      <p className={cn("text-sm font-semibold leading-snug", isRetiring ? "text-red-700" : "text-gray-900")}>
                        {system.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
                      {isRetiring && (
                        <span className="inline-block mt-1 text-[10px] font-bold text-red-600 tracking-wide">
                          EOL 2026
                        </span>
                      )}
                    </th>
                  );
                })}

                {/* + Add column header */}
                <th className="border-b border-gray-200 bg-gray-50 px-3 py-3">
                  <button
                    type="button"
                    onClick={() => setShowAddSystem(true)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {domain.capabilities.map((capability) => {
                const rowMeta = capabilityRowMeta(capability.id, domain.mappings);
                return (
                  <tr key={capability.id} className="group">
                    {/* Row label */}
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-b border-r border-gray-200 px-5 py-4 align-top transition-colors",
                        rowMeta.isGap ? "bg-red-50 group-hover:bg-red-100/60" : "bg-white group-hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{capability.name}</p>
                          {capability.owner?.trim() && (
                            <p className="text-xs text-gray-500 mt-0.5">{capability.owner}</p>
                          )}
                          <p className={cn("text-xs mt-1", rowMeta.isGap ? "text-red-500 font-medium" : "text-gray-400")}>
                            {rowMeta.label}
                          </p>
                        </div>
                        <HoverActionMenu
                          buttonClassName="opacity-0 group-hover:opacity-100"
                          ariaLabel={`Actions for ${capability.name}`}
                          items={[
                            {
                              label: "Edit capability",
                              icon: <Pencil size={14} />,
                              onClick: () => setEditCapability(capability),
                            },
                            {
                              label: "Delete capability",
                              icon: <Trash2 size={14} />,
                              variant: "danger",
                              onClick: () => setDeleteCapability(capability),
                            },
                          ]}
                        />
                      </div>
                    </td>

                    {/* Fitness cells */}
                    {filteredSystems.map((system) => {
                      const key = `${capability.id}:${system.id}`;
                      const mapping = mappingLookup.get(key);
                      const fitness = mapping?.fitness ?? "none";
                      const { cell, hover, text } = FITNESS_CELL[fitness];
                      return (
                        <td key={system.id} className="border-b border-r border-gray-200 p-0">
                          <button
                            type="button"
                            onClick={() => setCellSelection({ capability, system, fitness: fitness === "none" ? null : fitness })}
                            className={cn(
                              "w-full min-h-[72px] h-full flex items-center justify-center text-xs font-semibold tracking-wide transition-colors",
                              cell, hover, text
                            )}
                          >
                            {FITNESS_LABEL[fitness]}
                          </button>
                        </td>
                      );
                    })}

                    {/* Empty trailing cell */}
                    <td className="border-b border-gray-200 bg-white group-hover:bg-gray-50 transition-colors" />
                  </tr>
                );
              })}

              {/* Add capability row */}
              <tr>
                <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-5 py-3">
                  <button
                    type="button"
                    onClick={() => setShowAddCapability(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                    <Plus size={13} />
                    Add capability to this domain
                  </button>
                </td>
                {filteredSystems.map((system) => (
                  <td key={system.id} className="border-b border-r border-gray-200 bg-white" />
                ))}
                <td className="border-b border-gray-200 bg-white" />
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* Footer stats */}
        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 text-xs font-medium">
            <StatChip count={domain.stats.strong_count} label="strong mapping" labelPlural="strong mappings" color="text-emerald-700" />
            <StatChip count={domain.stats.adequate_count} label="adequate" color="text-amber-700" />
            <StatChip count={domain.stats.weak_count} label="weak" color="text-red-600" />
            <StatChip count={domain.stats.gap_count} label="gap" color="text-gray-500" />
          </div>
          <p className="text-xs text-gray-400">Hover a row to see capability detail · Click a cell to edit fitness</p>
        </div>
      </div>

      {showAddSystem && (
        <AddMappingSystemDialog
          existingSystemIds={domain.systems.map((system) => system.id)}
          isSubmitting={addSystemMutation.isPending}
          onClose={() => setShowAddSystem(false)}
          onSelectExisting={(systemId) => addSystemMutation.mutate({ systemId })}
          onCreateNew={(name) => addSystemMutation.mutate({ createName: name })}
        />
      )}

      {showAddCapability && (
        <AddCapabilityPickerDialog
          domain={pickerDomain}
          isSubmitting={createCapabilityMutation.isPending}
          onClose={() => setShowAddCapability(false)}
          onAdd={({ name, owner }) => createCapabilityMutation.mutate({ name, owner })}
        />
      )}

      {editCapability && (
        <EditCapabilityDialog
          capability={editCapability}
          domainName={domain.name}
          onClose={() => setEditCapability(null)}
          onSuccess={onRefresh}
        />
      )}

      {deleteCapability && (
        <ConfirmDeleteDialog
          title={`Delete ${deleteCapability.name}?`}
          message={capabilityDeleteMessage(deleteCapability)}
          confirmLabel="Delete capability"
          size="md"
          isPending={deleteCapabilityMutation.isPending}
          onCancel={() => setDeleteCapability(null)}
          onConfirm={() => deleteCapabilityMutation.mutate(deleteCapability.id)}
        />
      )}

      {cellSelection && (
        <MapCapabilitySystemDialog
          capability={cellSelection.capability}
          system={cellSelection.system}
          currentFitness={cellSelection.fitness}
          existingSystemIds={domain.systems.map((system) => system.id)}
          isSubmitting={upsertMutation.isPending}
          onClose={() => setCellSelection(null)}
          onMap={(systemId, fitness, createName) =>
            upsertMutation.mutate({
              capabilityId: cellSelection.capability.id,
              systemId,
              fitness,
              createName,
            })
          }
        />
      )}

      {(upsertMutation.isError ||
        addSystemMutation.isError ||
        createCapabilityMutation.isError ||
        deleteCapabilityMutation.isError) && (
        <p className="fixed bottom-4 right-4 z-[100] text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 shadow-sm">
          {(
            upsertMutation.error ??
            addSystemMutation.error ??
            createCapabilityMutation.error ??
            deleteCapabilityMutation.error
          )?.message}
        </p>
      )}
    </>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span className={cn("h-3.5 w-3.5 rounded-sm flex-shrink-0", color)} />
      {label}
    </span>
  );
}

function StatChip({
  count,
  label,
  labelPlural,
  color,
}: {
  count: number;
  label: string;
  labelPlural?: string;
  color: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", color)}>
      <span className="font-bold">{count}</span>
      <span className="text-gray-500 font-normal">{count === 1 ? label : (labelPlural ?? label)}</span>
    </span>
  );
}
