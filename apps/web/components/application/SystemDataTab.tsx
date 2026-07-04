"use client";

import type { MinEAObject, Relationship } from "@minea/types";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { SystemEntitySearch } from "@/components/application/SystemEntitySearch";
import { SystemLinkedObjectList } from "@/components/application/SystemLinkedObjectList";
import {
  systemDataDomainLinks,
  systemDataEntityLinks,
  systemDataStoreLinks,
} from "@/lib/system-drawer-utils";

interface Props {
  system: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  namesLoading?: boolean;
  canEdit?: boolean;
  onAddStore?: () => void;
  onAddDomain?: () => void;
  onRemove?: (relationshipId: string) => void;
  isRemoving?: boolean;
  onRefresh: () => void;
}

export function SystemDataTab({
  system,
  relationships,
  nameById,
  namesLoading,
  canEdit,
  onAddStore,
  onAddDomain,
  onRemove,
  isRemoving,
  onRefresh,
}: Props) {
  const entityLinks = systemDataEntityLinks(system.id, relationships);
  const storeLinks = systemDataStoreLinks(system.id, relationships);
  const domainLinks = systemDataDomainLinks(system.id, relationships);

  return (
    <div className="space-y-8">
      <SystemDrawerSection title="Data entities" count={entityLinks.length}>
        {canEdit && (
          <div className="mb-3">
            <SystemEntitySearch
              system={system}
              linkedEntityIds={entityLinks.map((link) => link.objectId)}
              onLinked={onRefresh}
            />
          </div>
        )}
        <SystemLinkedObjectList
          links={entityLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No data entities linked."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Data stores"
        count={storeLinks.length}
        onAdd={canEdit ? onAddStore : undefined}
      >
        <SystemLinkedObjectList
          links={storeLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No data stores linked."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Data domains"
        count={domainLinks.length}
        onAdd={canEdit ? onAddDomain : undefined}
      >
        <SystemLinkedObjectList
          links={domainLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No data domains linked."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>
    </div>
  );
}
