"use client";

import { useState } from "react";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import {
  SystemIntegrationLinkSearch,
  type IntegrationLinkKind,
} from "@/components/application/SystemIntegrationLinkSearch";
import { SystemLinkedObjectList } from "@/components/application/SystemLinkedObjectList";
import type { SystemDrawerLink } from "@/lib/system-drawer-utils";
import type { MinEAObject } from "@minea/types";

interface Props {
  title: string;
  kind: IntegrationLinkKind;
  links: SystemDrawerLink[];
  linkedObjectIds: string[];
  nameById: Record<string, string>;
  namesLoading?: boolean;
  emptyLabel: string;
  canEdit?: boolean;
  system?: MinEAObject;
  onLinked?: () => void;
  onCreateNew?: (name: string) => void;
  onRemove?: (relationshipId: string) => void;
  isRemoving?: boolean;
}

export function SystemIntegrationLinkSection({
  title,
  kind,
  links,
  linkedObjectIds,
  nameById,
  namesLoading,
  emptyLabel,
  canEdit,
  system,
  onLinked,
  onCreateNew,
  onRemove,
  isRemoving,
}: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchSession, setSearchSession] = useState(0);
  const canAdd = canEdit && !!system && !!onLinked && !!onCreateNew;

  const openSearch = () => {
    setShowSearch(true);
    setSearchSession((n) => n + 1);
  };

  return (
    <SystemDrawerSection title={title} count={links.length} onAdd={canAdd ? openSearch : undefined}>
      {showSearch && canAdd && (
        <div className="mb-3">
          <SystemIntegrationLinkSearch
            key={searchSession}
            system={system}
            kind={kind}
            linkedObjectIds={linkedObjectIds}
            onLinked={onLinked}
            onCreateNew={onCreateNew}
            onClose={() => setShowSearch(false)}
            autoFocus
          />
        </div>
      )}

      <SystemLinkedObjectList
        links={links}
        nameById={nameById}
        namesLoading={namesLoading}
        emptyLabel={emptyLabel}
        onRemove={canEdit ? onRemove : undefined}
        isRemoving={isRemoving}
      />
    </SystemDrawerSection>
  );
}
