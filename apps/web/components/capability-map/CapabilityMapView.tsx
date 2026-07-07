"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { CapabilityMap, CapabilityMapCapability, CapabilityMapDomain } from "@minea/types";
import { FitnessHealthBar, FitnessLegend } from "@/components/capability-map/DomainFitnessBar";
import {
  capabilityCoverageDisplay,
  capabilityMapStats,
  domainCardCoverageCounts,
  domainHasGap,
  filterCapabilityMapDomains,
  type CapabilityMapFilter,
} from "@/lib/capability-map-card-utils";
import { useAuth } from "@/lib/auth-context";
import { objectsApi } from "@/lib/api-client";
import { AddCapabilityPickerDialog } from "@/components/capability-map/AddCapabilityPickerDialog";
import {
  AddCapabilityWizardDialog,
  type AddCapabilityWizardResult,
} from "@/components/capability-map/AddCapabilityWizardDialog";
import { EditCapabilityDialog } from "@/components/capability-map/EditCapabilityDialog";
import { AddDomainPickerDialog } from "@/components/capability-map/AddDomainPickerDialog";
import { domainIcon, domainIconStyle } from "@/lib/capability-map-icons";
import { objectListPath } from "@/lib/tenancy";
import { useTenancy } from "@/lib/tenancy";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { HoverActionMenu } from "@/components/ui/HoverActionMenu";
import {
  capabilityDeleteMessage,
  domainDeleteMessage,
} from "@/lib/capability-delete-messages";
import { usePermissions } from "@/lib/use-permissions";

interface Props {
  map: CapabilityMap;
  onRefresh: () => void;
}

const FILTER_OPTIONS: { id: CapabilityMapFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "has_gaps", label: "Has gaps" },
  { id: "unassigned", label: "Unassigned" },
  { id: "no_capabilities", label: "No capabilities" },
];

function formatStatsLine(stats: ReturnType<typeof capabilityMapStats>): string {
  const parts = [
    `${stats.domains} domain${stats.domains === 1 ? "" : "s"}`,
    `${stats.capabilities} capabilit${stats.capabilities === 1 ? "y" : "ies"}`,
  ];
  if (stats.gaps > 0) {
    parts.push(`${stats.gaps} gap${stats.gaps === 1 ? "" : "s"}`);
  }
  if (stats.unassigned > 0) {
    parts.push(`${stats.unassigned} unassigned`);
  }
  return parts.join(" · ");
}

export function CapabilityMapView({ map, onRefresh }: Props) {
  const { getToken } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<CapabilityMapFilter>("all");
  const [emptySectionHidden, setEmptySectionHidden] = useState(false);
  const [showDomainPicker, setShowDomainPicker] = useState(false);
  const [showCapabilityWizard, setShowCapabilityWizard] = useState(false);
  const [capPickerDomain, setCapPickerDomain] = useState<CapabilityMapDomain | null>(null);
  const [editCapability, setEditCapability] = useState<{
    capability: CapabilityMapCapability;
    domainId: string;
    domainName: string;
  } | null>(null);
  const [deleteDomain, setDeleteDomain] = useState<CapabilityMapDomain | null>(null);
  const [deleteCapability, setDeleteCapability] = useState<{
    capability: CapabilityMapCapability;
    domainId: string;
    domainName: string;
  } | null>(null);

  const stats = useMemo(() => capabilityMapStats(map.domains), [map.domains]);
  const { populated, empty } = useMemo(
    () => filterCapabilityMapDomains(map.domains, filter),
    [map.domains, filter]
  );
  const showEmptySection = filter === "all" && empty.length > 0 && !emptySectionHidden;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["capability-library-domains", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["capability-heatmap", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["metric-drawer"] });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
    if (capPickerDomain) {
      queryClient.invalidateQueries({
        queryKey: ["capability-library-caps", orgSlug, workspaceSlug, capPickerDomain.id],
      });
    }
  };

  const invalidateDomainHistory = (domainId: string) => {
    queryClient.invalidateQueries({
      queryKey: ["domain-history", orgSlug, workspaceSlug, domainId],
    });
  };

  const createDomainMutation = useMutation({
    mutationFn: async ({
      name,
      icon,
      sourceTemplateId,
    }: {
      name: string;
      icon?: string;
      sourceTemplateId?: string;
    }) => {
      const token = await getToken();
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "business_domain",
          name,
          status: "active",
          properties: {
            order_index: map.domains.length,
            ...(icon ? { icon } : {}),
            ...(sourceTemplateId ? { source_template_id: sourceTemplateId } : {}),
          },
        },
        token!
      );
    },
    onSuccess: () => {
      setShowDomainPicker(false);
      invalidate();
      onRefresh();
    },
  });

  const createCapabilityMutation = useMutation({
    mutationFn: async ({
      domainId,
      name,
      owner,
    }: {
      domainId: string;
      name: string;
      owner?: string;
    }) => {
      const token = await getToken();
      const domain = map.domains.find((d) => d.id === domainId);
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "capability",
          name,
          owner,
          status: "active",
          properties: {
            domain_id: domainId,
            order_index: domain?.capabilities.length ?? 0,
          },
        },
        token!
      );
    },
    onSuccess: (_data, variables) => {
      const domainId = capPickerDomain?.id ?? variables.domainId;
      setCapPickerDomain(null);
      invalidate();
      if (domainId) invalidateDomainHistory(domainId);
      onRefresh();
    },
  });

  const capabilityWizardMutation = useMutation({
    mutationFn: async (result: AddCapabilityWizardResult) => {
      const token = await getToken();
      let domainId: string;
      let capabilityOrder = 0;

      if ("domainId" in result) {
        domainId = result.domainId;
        const domain = map.domains.find((d) => d.id === domainId);
        capabilityOrder = domain?.capabilities.length ?? 0;
      } else {
        const domain = await objectsApi.create(
          orgSlug,
          workspaceSlug,
          {
            type: "business_domain",
            name: result.newDomain.name,
            status: "active",
            properties: {
              order_index: map.domains.length,
              ...(result.newDomain.icon ? { icon: result.newDomain.icon } : {}),
              ...(result.newDomain.sourceTemplateId
                ? { source_template_id: result.newDomain.sourceTemplateId }
                : {}),
            },
          },
          token!
        );
        domainId = domain.id;
        capabilityOrder = 0;
      }

      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "capability",
          name: result.capabilityName,
          status: "active",
          properties: {
            domain_id: domainId,
            order_index: capabilityOrder,
          },
        },
        token!
      );
    },
    onSuccess: (_data, variables) => {
      setShowCapabilityWizard(false);
      invalidate();
      const domainId = "domainId" in variables ? variables.domainId : undefined;
      if (domainId) invalidateDomainHistory(domainId);
      onRefresh();
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (domainId: string) => {
      const token = await getToken();
      await objectsApi.delete(orgSlug, workspaceSlug, domainId, token!);
    },
    onSuccess: () => {
      setDeleteDomain(null);
      invalidate();
      onRefresh();
    },
  });

  const deleteCapabilityMutation = useMutation({
    mutationFn: async (capabilityId: string) => {
      const token = await getToken();
      await objectsApi.delete(orgSlug, workspaceSlug, capabilityId, token!);
    },
    onSuccess: () => {
      const domainId = deleteCapability?.domainId;
      setDeleteCapability(null);
      invalidate();
      if (domainId) invalidateDomainHistory(domainId);
      onRefresh();
    },
  });

  const existingDomainNames = map.domains.map((d) => d.name);

  const domainCardProps = (domain: CapabilityMapDomain) => ({
    domain,
    readOnly: !canEdit,
    onAddCapability: canEdit ? () => setCapPickerDomain(domain) : undefined,
    onEditCapability: canEdit
      ? (capability: CapabilityMapCapability) =>
          setEditCapability({
            capability,
            domainId: domain.id,
            domainName: domain.name,
          })
      : undefined,
    onDeleteDomain: canDelete ? () => setDeleteDomain(domain) : undefined,
    onDeleteCapability: canDelete
      ? (capability: CapabilityMapCapability) =>
          setDeleteCapability({
            capability,
            domainId: domain.id,
            domainName: domain.name,
          })
      : undefined,
  });

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="px-8 py-5 border-b border-gray-100 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Capability map</h1>
              <p className="text-sm text-gray-500 mt-1">
                Level 1 domains and level 2 capabilities. Duplicate names across domains when needed.
              </p>
              {map.domains.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">{formatStatsLine(stats)}</p>
              )}
            </div>
            {canCreate && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCapabilityWizard(true)}
                  className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-md px-3 py-1.5 text-sm font-medium"
                >
                  <Plus size={14} />
                  Add capability
                </button>
                <button
                  type="button"
                  onClick={() => setShowDomainPicker(true)}
                  className="inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus size={14} />
                  Add domain
                </button>
              </div>
            )}
          </div>

          {map.domains.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    filter === option.id
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {map.domains.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <p className="text-gray-500 text-sm mb-4">
                Start building your map by adding a level-1 domain — pick from industry suggestions or create your own.
              </p>
              {canCreate && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCapabilityWizard(true)}
                    className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-md px-4 py-2 text-sm font-medium"
                  >
                    <Plus size={14} />
                    Add capability
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDomainPicker(true)}
                    className="inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus size={14} />
                    Add domain
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {populated.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {populated.map((domain) => (
                    <DomainCard key={domain.id} {...domainCardProps(domain)} />
                  ))}
                </div>
              ) : filter !== "all" ? (
                <p className="text-sm text-gray-500 py-8 text-center">
                  No domains match this filter.
                </p>
              ) : null}

              {showEmptySection && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Domains with no capabilities ({empty.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEmptySectionHidden(true)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      Hide
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {empty.map((domain) => (
                      <EmptyDomainCard key={domain.id} {...domainCardProps(domain)} />
                    ))}
                  </div>
                </section>
              )}

              {filter === "no_capabilities" && empty.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {empty.map((domain) => (
                    <EmptyDomainCard key={domain.id} {...domainCardProps(domain)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {canCreate && showCapabilityWizard && (
        <AddCapabilityWizardDialog
          domains={map.domains}
          existingDomainNames={existingDomainNames}
          isSubmitting={capabilityWizardMutation.isPending}
          onClose={() => setShowCapabilityWizard(false)}
          onSubmit={(result) => capabilityWizardMutation.mutate(result)}
        />
      )}

      {canCreate && showDomainPicker && (
        <AddDomainPickerDialog
          existingDomainNames={existingDomainNames}
          isSubmitting={createDomainMutation.isPending}
          onClose={() => setShowDomainPicker(false)}
          onSelectLibrary={(name, icon, templateId) =>
            createDomainMutation.mutate({ name, icon, sourceTemplateId: templateId })
          }
          onCreateNew={(name) => createDomainMutation.mutate({ name })}
        />
      )}

      {canEdit && capPickerDomain && (
        <AddCapabilityPickerDialog
          domain={capPickerDomain}
          isSubmitting={createCapabilityMutation.isPending}
          onClose={() => setCapPickerDomain(null)}
          onAdd={({ name, owner }) =>
            createCapabilityMutation.mutate({ domainId: capPickerDomain.id, name, owner })
          }
        />
      )}

      {canEdit && editCapability && (
        <EditCapabilityDialog
          capability={editCapability.capability}
          domainName={editCapability.domainName}
          onClose={() => setEditCapability(null)}
          onSuccess={() => {
            invalidate();
            invalidateDomainHistory(editCapability.domainId);
            onRefresh();
          }}
        />
      )}

      {deleteDomain && (
        <ConfirmDeleteDialog
          title={`Delete ${deleteDomain.name}?`}
          message={domainDeleteMessage(deleteDomain.capabilities.length)}
          confirmLabel="Delete domain"
          size="md"
          isPending={deleteDomainMutation.isPending}
          onCancel={() => setDeleteDomain(null)}
          onConfirm={() => deleteDomainMutation.mutate(deleteDomain.id)}
        />
      )}

      {canDelete && deleteCapability && (
        <ConfirmDeleteDialog
          title={`Delete ${deleteCapability.capability.name}?`}
          message={capabilityDeleteMessage(deleteCapability.capability)}
          confirmLabel="Delete capability"
          size="md"
          isPending={deleteCapabilityMutation.isPending}
          onCancel={() => setDeleteCapability(null)}
          onConfirm={() => deleteCapabilityMutation.mutate(deleteCapability.capability.id)}
        />
      )}

      {(createDomainMutation.isError ||
        createCapabilityMutation.isError ||
        capabilityWizardMutation.isError ||
        deleteDomainMutation.isError ||
        deleteCapabilityMutation.isError) && (
        <p className="fixed bottom-4 right-4 z-[100] text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 shadow-sm">
          {(
            createDomainMutation.error ??
            createCapabilityMutation.error ??
            capabilityWizardMutation.error ??
            deleteDomainMutation.error ??
            deleteCapabilityMutation.error
          )?.message}
        </p>
      )}
    </>
  );
}

function DomainCard({
  domain,
  readOnly = false,
  onAddCapability,
  onEditCapability,
  onDeleteDomain,
  onDeleteCapability,
}: {
  domain: CapabilityMapDomain;
  readOnly?: boolean;
  onAddCapability?: () => void;
  onEditCapability?: (capability: CapabilityMapCapability) => void;
  onDeleteDomain?: () => void;
  onDeleteCapability?: (capability: CapabilityMapCapability) => void;
}) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const Icon = domainIcon(domain.icon);
  const iconStyle = domainIconStyle(domain.id);
  const detailPath = `${objectListPath(orgSlug, workspaceSlug, "business", "capabilities")}/domains/${domain.id}`;
  const coverageCounts = useMemo(
    () => domainCardCoverageCounts(domain.capabilities),
    [domain.capabilities]
  );
  const capTotal = domain.capabilities.length;
  const hasGap = domainHasGap(domain);

  return (
    <div
      className={cn(
        "group/card rounded-xl border bg-white p-4 transition-colors flex flex-col",
        hasGap ? "border-amber-400 shadow-sm shadow-amber-100/50" : "border-gray-200 hover:border-indigo-200"
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <Link href={detailPath} className="flex items-start gap-3 min-w-0 flex-1 group">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
              iconStyle.bg,
              iconStyle.text
            )}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 text-base group-hover:text-indigo-700">
              {domain.name}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Domain · Level 1</p>
          </div>
        </Link>
        {!readOnly && onAddCapability && onDeleteDomain && (
          <HoverActionMenu
            className="group-hover:opacity-100"
            buttonClassName="opacity-0 group-hover/card:opacity-100"
            ariaLabel={`Actions for ${domain.name}`}
            items={[
              {
                label: "Add capability",
                icon: <Plus size={14} />,
                onClick: onAddCapability,
              },
              {
                label: "Delete domain",
                icon: <Trash2 size={14} />,
                variant: "danger",
                onClick: onDeleteDomain,
              },
            ]}
          />
        )}
      </div>

      <div className="mb-3">
        <FitnessHealthBar counts={coverageCounts} total={capTotal} />
        <FitnessLegend counts={coverageCounts} hideZero className="mt-2" />
      </div>

      <ul className="divide-y divide-gray-100 mb-2">
        {domain.capabilities.map((cap) => (
          <CapabilityL2Row
            key={cap.id}
            capability={cap}
            readOnly={readOnly}
            onEdit={onEditCapability ? () => onEditCapability(cap) : undefined}
            onDelete={onDeleteCapability ? () => onDeleteCapability(cap) : undefined}
          />
        ))}
      </ul>

      {!readOnly && onAddCapability && (
        <button
          type="button"
          onClick={onAddCapability}
          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-indigo-600"
        >
          <Plus size={12} />
          Add capability
        </button>
      )}
    </div>
  );
}

function EmptyDomainCard({
  domain,
  readOnly = false,
  onAddCapability,
  onDeleteDomain,
}: {
  domain: CapabilityMapDomain;
  readOnly?: boolean;
  onAddCapability?: () => void;
  onDeleteDomain?: () => void;
}) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const Icon = domainIcon(domain.icon);
  const iconStyle = domainIconStyle(domain.id);
  const detailPath = `${objectListPath(orgSlug, workspaceSlug, "business", "capabilities")}/domains/${domain.id}`;

  return (
    <div className="group/card rounded-xl border border-gray-200 bg-white p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <Link href={detailPath} className="flex items-start gap-3 min-w-0 flex-1 group">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
              iconStyle.bg,
              iconStyle.text
            )}
          >
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 text-base group-hover:text-indigo-700">
              {domain.name}
            </h3>
          </div>
        </Link>
        {!readOnly && onDeleteDomain && (
          <HoverActionMenu
            buttonClassName="opacity-0 group-hover/card:opacity-100"
            ariaLabel={`Actions for ${domain.name}`}
            items={[
              {
                label: "Delete domain",
                icon: <Trash2 size={14} />,
                variant: "danger",
                onClick: onDeleteDomain,
              },
            ]}
          />
        )}
      </div>

      <p className="text-sm text-gray-400 italic mt-4 mb-3">No capabilities yet</p>

      {!readOnly && onAddCapability && (
        <button
          type="button"
          onClick={onAddCapability}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Plus size={12} />
          Add capability
        </button>
      )}
    </div>
  );
}

function CapabilityL2Row({
  capability,
  readOnly = false,
  onEdit,
  onDelete,
}: {
  capability: CapabilityMapCapability;
  readOnly?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const coverage = capabilityCoverageDisplay(capability);
  const unowned = !capability.owner?.trim();

  return (
    <li className="group/row flex items-center justify-between gap-2 py-2.5 first:pt-0">
      <div className="min-w-0 flex flex-1 items-start gap-2.5">
        <span className={cn("mt-1.5 h-2 w-2 rounded-full flex-shrink-0", coverage.dot)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 leading-snug">{capability.name}</p>
          <p
            className={cn(
              "flex items-center gap-1 text-[11px] leading-tight mt-0.5",
              unowned ? "text-amber-700" : "text-gray-500"
            )}
          >
            {unowned ? (
              <AlertTriangle size={11} className="flex-shrink-0 text-amber-500" />
            ) : (
              <Users size={11} className="flex-shrink-0 text-gray-400" />
            )}
            <span className="truncate">{unowned ? "Unassigned" : capability.owner}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", coverage.badge)}>
          {coverage.label}
        </span>
        {!readOnly && onEdit && onDelete && (
          <HoverActionMenu
            buttonClassName="opacity-0 group-hover/row:opacity-100"
            ariaLabel={`Actions for ${capability.name}`}
            items={[
              {
                label: "Edit capability",
                icon: <Pencil size={14} />,
                onClick: onEdit,
              },
              {
                label: "Delete capability",
                icon: <Trash2 size={14} />,
                variant: "danger",
                onClick: onDelete,
              },
            ]}
          />
        )}
      </div>
    </li>
  );
}
