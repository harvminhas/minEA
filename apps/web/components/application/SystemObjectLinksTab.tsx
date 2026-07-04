"use client";

import type { MinEAObject, Relationship } from "@minea/types";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { SystemLinkedObjectList } from "@/components/application/SystemLinkedObjectList";
import {
  systemObjectCapabilityLinks,
  systemObjectComponentLinks,
  systemObjectPlatformLinks,
  systemObjectSystemLinks,
} from "@/lib/system-drawer-utils";

interface Props {
  system: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  namesLoading?: boolean;
  canEdit?: boolean;
  onAddSystem?: () => void;
  onAddComponent?: () => void;
  onAddPlatform?: () => void;
  onAddCapability?: () => void;
  onRemove?: (relationshipId: string) => void;
  isRemoving?: boolean;
}

export function SystemObjectLinksTab({
  system,
  relationships,
  nameById,
  namesLoading,
  canEdit,
  onAddSystem,
  onAddComponent,
  onAddPlatform,
  onAddCapability,
  onRemove,
  isRemoving,
}: Props) {
  const systemLinks = systemObjectSystemLinks(system.id, relationships);
  const componentLinks = systemObjectComponentLinks(system.id, relationships);
  const platformLinks = systemObjectPlatformLinks(system.id, relationships);
  const capabilityLinks = systemObjectCapabilityLinks(system.id, relationships);

  return (
    <div className="space-y-8">
      <SystemDrawerSection
        title="Systems"
        count={systemLinks.length}
        onAdd={canEdit ? onAddSystem : undefined}
      >
        <SystemLinkedObjectList
          links={systemLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No linked systems."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Components"
        count={componentLinks.length}
        onAdd={canEdit ? onAddComponent : undefined}
      >
        <SystemLinkedObjectList
          links={componentLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No linked components."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Platforms"
        count={platformLinks.length}
        onAdd={canEdit ? onAddPlatform : undefined}
      >
        <SystemLinkedObjectList
          links={platformLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No linked platforms."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Capabilities"
        count={capabilityLinks.length}
        onAdd={canEdit ? onAddCapability : undefined}
      >
        <SystemLinkedObjectList
          links={capabilityLinks}
          nameById={nameById}
          namesLoading={namesLoading}
          emptyLabel="No linked capabilities."
          onRemove={canEdit ? onRemove : undefined}
          isRemoving={isRemoving}
        />
      </SystemDrawerSection>
    </div>
  );
}
