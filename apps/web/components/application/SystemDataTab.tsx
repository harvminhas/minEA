"use client";

import type { MinEAObject, Relationship } from "@minea/types";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { SystemEntitySearch } from "@/components/application/SystemEntitySearch";
import { SystemFlowsSection } from "@/components/application/SystemFlowsSection";
import { SystemLinkedObjectList } from "@/components/application/SystemLinkedObjectList";
import {
  systemDataDomainLinks,
  systemDataEntityLinks,
  systemDataStoreLinks,
} from "@/lib/system-drawer-utils";
import { flowsForSystemDataTab } from "@/lib/flow-system-utils";

interface Props {
  system: MinEAObject;
  relationships: Relationship[];
  allFlows: MinEAObject[];
  nameById: Record<string, string>;
  namesLoading?: boolean;
  canEdit?: boolean;
  onAddStore?: () => void;
  onAddDomain?: () => void;
  onCreateFlow?: (name: string) => void;
  onFlowLinked?: () => void;
  onUnlinkFlow?: (flowId: string) => void;
  isUnlinkingFlow?: boolean;
  onOpenFlow?: (flowId: string) => void;
  onRemove?: (relationshipId: string) => void;
  isRemoving?: boolean;
  onRefresh: () => void;
}

export function SystemDataTab({
  system,
  relationships,
  allFlows,
  nameById,
  namesLoading,
  canEdit,
  onAddStore,
  onAddDomain,
  onCreateFlow,
  onFlowLinked,
  onUnlinkFlow,
  isUnlinkingFlow,
  onOpenFlow,
  onRemove,
  isRemoving,
  onRefresh,
}: Props) {
  const entityLinks = systemDataEntityLinks(system.id, relationships);
  const storeLinks = systemDataStoreLinks(system.id, relationships);
  const domainLinks = systemDataDomainLinks(system.id, relationships);
  const linkedEntityIds = entityLinks.map((link) => link.objectId);
  const relatedFlows = flowsForSystemDataTab(system.id, linkedEntityIds, allFlows);

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

      <SystemFlowsSection
        flows={relatedFlows}
        allFlows={allFlows}
        linkedFlowIds={relatedFlows.map((flow) => flow.id)}
        emptyLabel="No flows involving data entities for this system."
        canEdit={canEdit}
        system={system}
        onFlowLinked={onFlowLinked}
        onCreateFlow={onCreateFlow}
        onUnlinkFlow={onUnlinkFlow}
        isUnlinking={isUnlinkingFlow}
        onOpenFlow={onOpenFlow}
      />
    </div>
  );
}
