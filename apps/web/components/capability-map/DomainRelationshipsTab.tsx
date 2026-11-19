"use client";

import { useMemo, useState } from "react";
import type { DomainDetail, MinEAObject } from "@minea/types";
import { usePermissions } from "@/lib/use-permissions";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { isActivity } from "@/lib/capability-tree";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import { CapabilityRelationshipsSection } from "@/components/capability-map/CapabilityRelationshipsSection";
import { useCapabilityMappedLinks } from "@/lib/use-capability-mapped-links";
import type { MappedScope } from "@/lib/capability-mapping";

function scopesAndRecords(
  domain: DomainDetail,
  objects: MinEAObject[]
): { scopes: MappedScope[]; records: MinEAObject[] } {
  const inDomain = objects.filter(
    (object) =>
      object.type === "capability" &&
      (String(object.properties?.domain_id ?? "") === domain.id ||
        domain.capabilities.some((cap) => cap.id === object.id))
  );
  const capabilities = inDomain.filter((object) => !isActivity(object.properties));
  const scopes: MappedScope[] = [];
  const records: MinEAObject[] = [];
  for (const cap of capabilities) {
    scopes.push({ id: cap.id, name: cap.name, level: "capability" });
    records.push(cap);
    const activities = inDomain.filter(
      (object) => isActivity(object.properties) && String(object.properties?.parent_id ?? "") === cap.id
    );
    for (const child of activities) {
      scopes.push({ id: child.id, name: child.name, level: "activity" });
      records.push(child);
    }
  }
  return { scopes, records };
}

export function DomainRelationshipsTab({
  domain,
  adding = false,
  onAddingChange,
}: {
  domain: DomainDetail;
  adding?: boolean;
  onAddingChange?: (open: boolean) => void;
}) {
  const { canEdit } = usePermissions();
  const catalog = useModelCatalog();
  const { scopes, records } = useMemo(
    () => scopesAndRecords(domain, (catalog.data?.objects ?? []) as MinEAObject[]),
    [domain, catalog.data?.objects]
  );
  const mapped = useCapabilityMappedLinks(scopes);
  const [localAdding, setLocalAdding] = useState(false);
  const open = adding || localAdding;
  const setOpen = (next: boolean) => {
    setLocalAdding(next);
    onAddingChange?.(next);
  };

  return (
    <div className="p-8 max-w-4xl" data-testid="domain-relationships">
      <CapabilityRelationshipsSection
        groups={mapped.groups}
        showAdd={canEdit && records.length > 0}
        onAdd={() => setOpen(true)}
        addStyle="button"
        addTestId="domain-add-relationship"
      />
      {open && records.length > 0 ? (
        <RelationshipForm
          fromObject={records[0]}
          fromRecords={records}
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      ) : null}
      {records.length === 0 ? (
        <p className="text-sm text-gray-500">Add a capability to this domain before linking records.</p>
      ) : null}
    </div>
  );
}
