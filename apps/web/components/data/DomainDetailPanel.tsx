"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { dataApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  DataDetailShell,
  DataFieldLabel,
  DataFormFooter,
  DataSelect,
} from "@/components/data/DataDetailShell";
import { DataDetailRightPanel } from "@/components/data/DataDetailRightPanel";
import { DomainRollupPanel } from "@/components/data/DomainRollupPanel";

interface Props {
  domainId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function DomainDetailPanel({ domainId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(domainId);

  const [owningTeam, setOwningTeam] = useState("");
  const [stewardName, setStewardName] = useState("");
  const [stewardEmail, setStewardEmail] = useState("");
  const [classification, setClassification] = useState("");
  const [description, setDescription] = useState("");

  const { data: domain, isLoading } = useQuery({
    queryKey: ["data-domain", orgSlug, workspaceSlug, domainId],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getDomain(orgSlug, workspaceSlug, domainId, token!);
    },
    enabled,
  });

  useEffect(() => {
    if (!domain) return;
    setOwningTeam(domain.owning_team ?? "");
    setStewardName(domain.steward_name ?? "");
    setStewardEmail(domain.steward_email ?? "");
    setClassification(domain.classification ?? "");
    setDescription(domain.description ?? "");
  }, [domain]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return dataApi.updateDomain(orgSlug, workspaceSlug, domainId, {
        owning_team: owningTeam || null,
        steward_name: stewardName || null,
        steward_email: stewardEmail || null,
        classification: classification || null,
        description: description || null,
      }, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-domain", orgSlug, workspaceSlug, domainId] });
      onUpdate();
      onClose();
    },
  });

  if (isLoading || !domain) {
    return (
      <DataDetailShell
        breadcrumb="Data · Domain"
        title="Loading…"
        onClose={onClose}
        left={<p className="p-6 text-sm text-gray-400">Loading…</p>}
        right={<div />}
      />
    );
  }

  const rollup = domain.domain_rollup ?? { entities: [], stores: [], systems: [] };

  return (
    <DataDetailShell
      breadcrumb="Data · Domain"
      title={domain.name}
      onClose={onClose}
      left={
        <>
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white bg-violet-600">
                <Flag size={18} />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{domain.name}</p>
                <p className="text-xs text-gray-400">
                  Owner: {owningTeam || "Unassigned"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
            <div>
              <DataFieldLabel>Owning Team</DataFieldLabel>
              <input
                value={owningTeam}
                onChange={(e) => setOwningTeam(e.target.value)}
                placeholder="Payments team"
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            <div>
              <DataFieldLabel>Data Steward</DataFieldLabel>
              <div className="rounded-md border border-gray-200 overflow-hidden">
                <input
                  value={stewardName}
                  onChange={(e) => setStewardName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-3 py-2.5 text-sm border-b border-gray-100 focus:outline-none focus:bg-gray-50"
                />
                <input
                  value={stewardEmail}
                  onChange={(e) => setStewardEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full px-3 py-2.5 text-sm text-gray-500 focus:outline-none focus:bg-gray-50"
                />
              </div>
            </div>

            <div>
              <DataFieldLabel>Classification</DataFieldLabel>
              <DataSelect
                value={classification || "financial"}
                onChange={setClassification}
                options={[
                  { value: "financial", label: "Financial" },
                  { value: "customer", label: "Customer" },
                  { value: "operational", label: "Operational" },
                  { value: "reference", label: "Reference" },
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

            {domain.capability_domain_name && (
              <div>
                <DataFieldLabel>Aligns to Capability Domain</DataFieldLabel>
                <div className="rounded-lg border border-gray-200 px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {domain.capability_domain_name}
                    </p>
                    <p className="text-xs text-gray-400 italic">
                      Soft alignment — informational only
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DataFormFooter onSave={() => saveMutation.mutate()} saving={saveMutation.isPending} />
        </>
      }
      right={
        <DataDetailRightPanel
          objectId={domainId}
          objectName={domain.name}
          objectKind="data_domain"
          onRefresh={() => {
            queryClient.invalidateQueries({
              queryKey: ["data-domain", orgSlug, workspaceSlug, domainId],
            });
            onUpdate();
          }}
          links={
            <div className="px-1">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Domain membership
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                Assign entities and stores from their own records. This view is read-only.
              </p>
              <DomainRollupPanel rollup={rollup} />
            </div>
          }
        />
      }
    />
  );
}
