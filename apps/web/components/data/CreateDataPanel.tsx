"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { dataApi } from "@/lib/api-client";
import { DataDomainSelect } from "@/components/data/DataDomainSelect";
import { FormDrawer, FormField, FormSection, formFieldClass } from "@/components/ui/FormDrawer";
import { useDataDomainOptions } from "@/lib/use-data-domains";

type CreateKind = "entity" | "store" | "domain";

interface Props {
  kind: CreateKind;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

const LABELS: Record<
  CreateKind,
  { title: string; submit: string; section: string }
> = {
  entity: {
    title: "New data entity",
    submit: "Create entity",
    section: "Entity details",
  },
  store: {
    title: "New data store",
    submit: "Create store",
    section: "Store details",
  },
  domain: {
    title: "New data domain",
    submit: "Create domain",
    section: "Domain details",
  },
};

export function CreateDataPanel({ kind, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState("core");
  const [sensitivity, setSensitivity] = useState("");
  const [storeType, setStoreType] = useState("relational_db");
  const [owningTeam, setOwningTeam] = useState("");
  const [domainClassification, setDomainClassification] = useState("financial");
  const [domainId, setDomainId] = useState("");
  const { options: domainOptions, isLoading: domainsLoading } = useDataDomainOptions();

  const labels = LABELS[kind];

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const assignedDomainId = domainId || null;
      if (kind === "entity") {
        return dataApi.createEntity(orgSlug, workspaceSlug, {
          name,
          description: description || undefined,
          classification,
          sensitivity: sensitivity || undefined,
          data_domain_id: assignedDomainId,
        }, token!);
      }
      if (kind === "store") {
        return dataApi.createStore(orgSlug, workspaceSlug, {
          name,
          description: description || undefined,
          store_type: storeType,
          data_domain_id: assignedDomainId,
        }, token!);
      }
      return dataApi.createDomain(orgSlug, workspaceSlug, {
        name,
        description: description || undefined,
        classification: domainClassification || undefined,
        owning_team: owningTeam || undefined,
      }, token!);
    },
    onSuccess: (result) => onSuccess(result.id),
  });

  const errorMessage =
    createMutation.error instanceof Error
      ? createMutation.error.message
      : createMutation.error
        ? "Could not create record."
        : null;

  return (
    <FormDrawer
      title={labels.title}
      onClose={onClose}
      onSubmit={() => createMutation.mutate()}
      submitLabel={labels.submit}
      isSubmitting={createMutation.isPending}
      submitDisabled={!name.trim()}
      error={errorMessage}
    >
      <FormField label="Name" required>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={formFieldClass}
          placeholder={kind === "entity" ? "Customer profile" : kind === "store" ? "Customer DB" : "Customer data"}
        />
      </FormField>

      <FormSection title={labels.section}>
        {(kind === "entity" || kind === "store") && (
          <FormField label="Data domain">
            <DataDomainSelect
              value={domainId}
              onChange={setDomainId}
              options={domainOptions}
              loading={domainsLoading}
              variant="form"
            />
          </FormField>
        )}

        {kind === "entity" && (
          <>
            <FormField label="Classification">
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                className={`${formFieldClass} mb-3`}
              >
                <option value="core">Core</option>
                <option value="reference">Reference</option>
                <option value="master">Master</option>
              </select>
            </FormField>

            <FormField label="Sensitivity">
              <select
                value={sensitivity || "none"}
                onChange={(e) => setSensitivity(e.target.value === "none" ? "" : e.target.value)}
                className={`${formFieldClass} mb-3`}
              >
                <option value="none">None</option>
                <option value="pii">PII</option>
                <option value="confidential">Confidential</option>
                <option value="restricted">Restricted</option>
              </select>
            </FormField>
          </>
        )}

        {kind === "store" && (
          <FormField label="Store type">
            <select
              value={storeType}
              onChange={(e) => setStoreType(e.target.value)}
              className={`${formFieldClass} mb-3`}
            >
              <option value="relational_db">Relational DB</option>
              <option value="document_db">Document DB</option>
              <option value="data_warehouse">Data Warehouse</option>
              <option value="data_lake">Data Lake</option>
              <option value="file_store">File Store</option>
              <option value="cache">Cache</option>
            </select>
          </FormField>
        )}

        {kind === "domain" && (
          <>
            <FormField label="Owning team">
              <input
                value={owningTeam}
                onChange={(e) => setOwningTeam(e.target.value)}
                placeholder="Payments team"
                className={`${formFieldClass} mb-3`}
              />
            </FormField>

            <FormField label="Classification">
              <select
                value={domainClassification}
                onChange={(e) => setDomainClassification(e.target.value)}
                className={`${formFieldClass} mb-3`}
              >
                <option value="financial">Financial</option>
                <option value="customer">Customer</option>
                <option value="operational">Operational</option>
                <option value="reference">Reference</option>
              </select>
            </FormField>
          </>
        )}

        <FormField label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`${formFieldClass} resize-none`}
          />
        </FormField>
      </FormSection>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        {kind === "entity"
          ? "Domain assignment is optional — capture the entity now and govern it later."
          : kind === "store"
            ? "Domain, entities, hosting system, and integrations can be linked after creating."
            : "Entities and stores are assigned to this domain from their own records."}
      </p>
    </FormDrawer>
  );
}
