"use client";

import { useState } from "react";
import { ArrowLeftRight, X } from "lucide-react";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { SystemFlowSearch } from "@/components/application/SystemFlowSearch";
import { flowCanUnlinkFromSystem, summarizeFlowEndpoints } from "@/lib/flow-system-utils";
import { flowMechanismLabel, FLOW_MECHANISM_LABEL } from "@/lib/flow-utils";
import { flowProps } from "@/lib/flow-list-utils";
import { cn } from "@/lib/utils";

interface Props {
  title?: string;
  flows: MinEAObject[];
  allFlows: MinEAObject[];
  linkedFlowIds: string[];
  emptyLabel: string;
  canEdit?: boolean;
  system?: MinEAObject;
  onFlowLinked?: () => void;
  onCreateFlow?: (name: string) => void;
  onUnlinkFlow?: (flowId: string) => void;
  isUnlinking?: boolean;
  onOpenFlow?: (flowId: string) => void;
}

export function SystemFlowsSection({
  title = "Flows",
  flows,
  allFlows,
  linkedFlowIds,
  emptyLabel,
  canEdit,
  system,
  onFlowLinked,
  onCreateFlow,
  onUnlinkFlow,
  isUnlinking,
  onOpenFlow,
}: Props) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchSession, setSearchSession] = useState(0);
  const canAdd = canEdit && !!system && !!onFlowLinked && !!onCreateFlow;

  const openSearch = () => {
    setShowSearch(true);
    setSearchSession((n) => n + 1);
  };

  return (
    <SystemDrawerSection
      title={title}
      count={flows.length}
      onAdd={canAdd ? openSearch : undefined}
    >
      {showSearch && canAdd && (
        <div className="mb-3">
          <SystemFlowSearch
            key={searchSession}
            system={system}
            allFlows={allFlows}
            linkedFlowIds={linkedFlowIds}
            onLinked={onFlowLinked}
            onCreateNew={onCreateFlow}
            onClose={() => setShowSearch(false)}
            autoFocus
          />
        </div>
      )}

      {flows.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {flows.map((flow) => {
            const props = flowProps(flow) as IntegrationFlowProperties;
            const mechanism = flowMechanismLabel(props);
            const canUnlink =
              canEdit && !!system && !!onUnlinkFlow && flowCanUnlinkFromSystem(flow, system.id);

            return (
              <li
                key={flow.id}
                className="flex items-center justify-between gap-3 py-2.5 px-3 bg-stone-50 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => onOpenFlow?.(flow.id)}
                  className="flex items-start gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                >
                  <ArrowLeftRight size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{flow.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {summarizeFlowEndpoints(props)}
                    </p>
                    {props.mechanism && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {FLOW_MECHANISM_LABEL[props.mechanism] ?? mechanism}
                      </p>
                    )}
                  </div>
                </button>
                {canUnlink && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlinkFlow(flow.id);
                    }}
                    disabled={isUnlinking}
                    className={cn(
                      "text-gray-300 hover:text-red-400 transition-colors flex-shrink-0",
                      isUnlinking && "opacity-50 cursor-not-allowed"
                    )}
                    aria-label={`Unlink flow ${flow.name}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SystemDrawerSection>
  );
}
