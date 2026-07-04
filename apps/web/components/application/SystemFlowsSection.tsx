"use client";

import { ArrowLeftRight } from "lucide-react";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { summarizeFlowEndpoints } from "@/lib/flow-system-utils";
import { flowMechanismLabel, FLOW_MECHANISM_LABEL } from "@/lib/flow-utils";
import { flowProps } from "@/lib/flow-list-utils";

interface Props {
  title?: string;
  flows: MinEAObject[];
  emptyLabel: string;
  canEdit?: boolean;
  onAdd?: () => void;
  onOpenFlow?: (flowId: string) => void;
}

export function SystemFlowsSection({
  title = "Flows",
  flows,
  emptyLabel,
  canEdit,
  onAdd,
  onOpenFlow,
}: Props) {
  return (
    <SystemDrawerSection title={title} count={flows.length} onAdd={canEdit ? onAdd : undefined}>
      {flows.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {flows.map((flow) => {
            const props = flowProps(flow) as IntegrationFlowProperties;
            const mechanism = flowMechanismLabel(props);
            return (
              <li key={flow.id}>
                <button
                  type="button"
                  onClick={() => onOpenFlow?.(flow.id)}
                  className="w-full text-left py-2.5 px-3 bg-stone-50 rounded-lg hover:bg-stone-100/80 transition-colors"
                >
                  <div className="flex items-start gap-2">
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
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SystemDrawerSection>
  );
}
