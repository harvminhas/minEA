"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { dataApi } from "@/lib/api-client";
import { DataDetailShell, DataFieldLabel, DataFormFooter, DataSelect } from "@/components/data/DataDetailShell";
import { DATA_LAYER_COLOR } from "@/lib/data-utils";
import { DEFAULT_DATA_DOMAIN_NAME, useDataDomainOptions } from "@/lib/use-data-domains";

type CreateKind = "entity" | "store" | "domain";

interface Props {
  kind: CreateKind;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

export function CreateDataPanel({ kind, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState("core");
  const [sensitivity, setSensitivity] = useState("");
  const [storeType, setStoreType] = useState("relational_db");
  const [owningTeam, setOwningTeam] = useState("");
  const [domainId, setDomainId] = useState("");
  const { options: domainOptions, defaultDomainId, isLoading: domainsLoading } = useDataDomainOptions();

  useEffect(() => {
    if (kind !== "entity" || domainId) return;
    if (defaultDomainId) setDomainId(defaultDomainId);
  }, [kind, defaultDomainId, domainId]);

  const labels = {
    entity: { breadcrumb: "Data · Entity", title: "New entity", button: "Create entity" },
    store: { breadcrumb: "Data · Store", title: "New store", button: "Create store" },
    domain: { breadcrumb: "Data · Domain", title: "New domain", button: "Create domain" },
  }[kind];

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (kind === "entity") {
        return dataApi.createEntity(orgSlug, workspaceSlug, {
          name,
          description,
          classification,
          sensitivity: sensitivity || undefined,
          data_domain_id: domainId || undefined,
        }, token!);
      }
      if (kind === "store") {
        return dataApi.createStore(orgSlug, workspaceSlug, {
          name,
          description,
          store_type: storeType,
        }, token!);
      }
      return dataApi.createDomain(orgSlug, workspaceSlug, {
        name,
        description,
        owning_team: owningTeam || undefined,
      }, token!);
    },
    onSuccess: (result) => onSuccess(result.id),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <DataDetailShell
        breadcrumb={labels.breadcrumb}
        title={labels.title}
        onClose={onClose}
        left={
          <>
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <div>
                <DataFieldLabel>Name</DataFieldLabel>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              {kind === "entity" && (
                <>
                  <div>
                    <DataFieldLabel>Data Domain</DataFieldLabel>
                    {domainsLoading ? (
                      <p className="text-sm text-gray-400">Loading domains…</p>
                    ) : (
                      <DataSelect
                        value={domainId || defaultDomainId}
                        onChange={setDomainId}
                        options={
                          domainOptions.length > 0
                            ? domainOptions
                            : [{ value: "", label: DEFAULT_DATA_DOMAIN_NAME }]
                        }
                      />
                    )}
                    {domainOptions.length === 0 && !domainsLoading && (
                      <p className="mt-1.5 text-[11px] text-gray-400">
                        No domains yet — {DEFAULT_DATA_DOMAIN_NAME} will be created automatically.
                      </p>
                    )}
                  </div>
                  <div>
                    <DataFieldLabel>Classification</DataFieldLabel>
                    <DataSelect
                      value={classification}
                      onChange={setClassification}
                      options={[
                        { value: "core", label: "Core" },
                        { value: "reference", label: "Reference" },
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
                      ]}
                    />
                  </div>
                </>
              )}

              {kind === "store" && (
                <div>
                  <DataFieldLabel>Store Type</DataFieldLabel>
                  <DataSelect
                    value={storeType}
                    onChange={setStoreType}
                    options={[{ value: "relational_db", label: "Relational DB" }]}
                  />
                </div>
              )}

              {kind === "domain" && (
                <div>
                  <DataFieldLabel>Owning Team</DataFieldLabel>
                  <input
                    value={owningTeam}
                    onChange={(e) => setOwningTeam(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm"
                  />
                </div>
              )}

              <div>
                <DataFieldLabel>Description</DataFieldLabel>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>
            <DataFormFooter
              onSave={() => createMutation.mutate()}
              saving={createMutation.isPending}
              disabled={!name.trim()}
              label={labels.button}
            />
          </>
        }
        right={
          <div className="flex flex-col items-center justify-center h-full text-center px-12">
            <div
              className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-lg mb-4"
              style={{ backgroundColor: DATA_LAYER_COLOR }}
            >
              {name ? name.charAt(0).toUpperCase() : "D"}
            </div>
            <p className="text-sm text-gray-500 max-w-xs">
              {kind === "entity"
                ? "Every entity belongs to a data domain. Other links can be added after creating."
                : `After creating, link this ${kind} to domains, stores, systems, and integrations.`}
            </p>
          </div>
        }
      />
    </>
  );
}
