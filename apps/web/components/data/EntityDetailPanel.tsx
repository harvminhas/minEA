"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { dataApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AssignDataLinkDialog } from "@/components/data/AssignDataLinkDialog";
import {
  DataDetailShell,
  DataFieldLabel,
  DataFormFooter,
  DataSelect,
} from "@/components/data/DataDetailShell";
import { DataLinksPanel, type AssignTarget } from "@/components/data/DataLinksPanel";
import { DATA_LAYER_COLOR, entityLinkSections, initials } from "@/lib/data-utils";
import { cn } from "@/lib/utils";

interface Props {
  entityId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function EntityDetailPanel({ entityId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(entityId);

  const [classification, setClassification] = useState("core");
  const [sensitivity, setSensitivity] = useState("");
  const [description, setDescription] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [showAddRelated, setShowAddRelated] = useState(false);

  const { data: entity, isLoading } = useQuery({
    queryKey: ["data-entity", orgSlug, workspaceSlug, entityId],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getEntity(orgSlug, workspaceSlug, entityId, token!);
    },
    enabled,
  });

  useEffect(() => {
    if (!entity) return;
    setClassification(entity.classification ?? "core");
    setSensitivity(entity.sensitivity ?? "");
    setDescription(entity.description ?? "");
  }, [entity]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return dataApi.updateEntity(orgSlug, workspaceSlug, entityId, {
        classification,
        sensitivity: sensitivity || null,
        description: description || null,
      }, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-entity", orgSlug, workspaceSlug, entityId] });
      onUpdate();
      onClose();
    },
  });

  const addLink = async (target: AssignTarget, selectedId: string, roleTag?: string) => {
    const token = await getToken();
    if (target.linkKind === "governed_by" && target.entityKind === "data_domain") {
      await dataApi.updateEntity(orgSlug, workspaceSlug, entityId, {
        data_domain_id: selectedId,
      }, token!);
    } else {
      await dataApi.addEntityLink(orgSlug, workspaceSlug, entityId, {
        entity_kind: target.entityKind,
        entity_id: selectedId,
        link_kind: target.linkKind,
        role_tag: roleTag,
      }, token!);
    }
    queryClient.invalidateQueries({ queryKey: ["data-entity", orgSlug, workspaceSlug, entityId] });
  };

  if (isLoading || !entity) {
    return (
      <DataDetailShell
        breadcrumb="Data · Entity"
        title="Loading…"
        onClose={onClose}
        left={<p className="p-6 text-sm text-gray-400">Loading…</p>}
        right={<div />}
      />
    );
  }

  const sections = entityLinkSections(
    entity.links,
    entity.inferred_capabilities,
    entity.inferred_processes
  );

  return (
    <>
      <DataDetailShell
        breadcrumb="Data · Entity"
        title={entity.name}
        badge={
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-violet-100 text-violet-700 capitalize">
            {classification} entity
          </span>
        }
        onClose={onClose}
        left={
          <>
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: "#8b5cf6" }}
                >
                  {initials(entity.name)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{entity.name}</p>
                  <p className="text-xs text-gray-400">
                    {entity.data_domain_name ?? "No domain assigned"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
              <div>
                <DataFieldLabel>Classification</DataFieldLabel>
                <DataSelect
                  value={classification}
                  onChange={setClassification}
                  options={[
                    { value: "core", label: "Core" },
                    { value: "reference", label: "Reference" },
                    { value: "master", label: "Master" },
                  ]}
                />
              </div>

              <div>
                <DataFieldLabel>Sensitivity</DataFieldLabel>
                <DataSelect
                  value={sensitivity || "none"}
                  onChange={(v) => setSensitivity(v === "none" ? "" : v)}
                  options={[
                    { value: "none", label: "None" },
                    { value: "pii", label: "PII" },
                    { value: "confidential", label: "Confidential" },
                    { value: "restricted", label: "Restricted" },
                  ]}
                />
              </div>

              <div>
                <DataFieldLabel>Description</DataFieldLabel>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <DataFieldLabel>Related Entities</DataFieldLabel>
                  <button
                    type="button"
                    onClick={() => setShowAddRelated(true)}
                    className="rounded-md border border-gray-200 px-2.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    + Add
                  </button>
                </div>
                {entity.related_entities.length === 0 ? (
                  <p className="text-sm text-gray-400">No related entities</p>
                ) : (
                  <ul className="space-y-0">
                    {entity.related_entities.map((rel) => (
                      <li
                        key={rel.id}
                        className="flex items-center gap-2.5 py-2.5 border-b border-gray-100 last:border-b-0"
                      >
                        <span
                          className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-violet-700 bg-violet-50"
                        >
                          {initials(rel.entity_name)}
                        </span>
                        <span className="text-sm text-gray-800 flex-1">{rel.entity_name}</span>
                        {rel.role_tag && (
                          <span className="text-xs text-gray-400">{rel.role_tag}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <DataFormFooter
              onSave={() => saveMutation.mutate()}
              saving={saveMutation.isPending}
            />
          </>
        }
        right={
          <DataLinksPanel
            sections={sections}
            headerText="Where this entity lives and who uses it"
            onAssign={setAssignTarget}
          />
        }
      />

      {assignTarget && (
        <AssignDataLinkDialog
          section={assignTarget}
          existingEntityIds={
            assignTarget.linkKind === "related"
              ? entity.related_entities.map((l) => l.entity_id)
              : entity.links
                  .filter(
                    (l) =>
                      l.link_kind === assignTarget.linkKind &&
                      l.entity_kind === assignTarget.entityKind
                  )
                  .map((l) => l.entity_id)
          }
          onClose={() => {
            setAssignTarget(null);
            setShowAddRelated(false);
          }}
          onAssign={(id, roleTag) =>
            addLink(
              showAddRelated
                ? {
                    ...assignTarget,
                    entityKind: "data_object",
                    linkKind: "related",
                    roleTags: ["many:1", "1:many"],
                  }
                : assignTarget,
              id,
              roleTag
            )
          }
        />
      )}

      {showAddRelated && !assignTarget && (
        <AssignDataLinkDialog
          section={{
            key: "related",
            title: "Related Entity",
            subtitle: "",
            entityKind: "data_object",
            linkKind: "related",
            items: [],
            actionLabel: "+ Add",
            roleTags: ["many:1", "1:many"],
          }}
          existingEntityIds={entity.related_entities.map((l) => l.entity_id)}
          onClose={() => setShowAddRelated(false)}
          onAssign={(id, roleTag) => {
            void addLink(
              {
                key: "related",
                title: "Related Entity",
                subtitle: "",
                entityKind: "data_object",
                linkKind: "related",
                items: [],
              },
              id,
              roleTag
            );
            setShowAddRelated(false);
          }}
        />
      )}
    </>
  );
}
