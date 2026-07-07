"use client";

import { ArrowRight, ExternalLink } from "lucide-react";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import {
  INTEGRATION_TECH_PANEL_CAPTION,
  type ManualFlowEvidence,
  type SpofToolEvidence,
} from "@/lib/tech-stack-integration-utils";
import type { MinEAObject } from "@minea/types";

export type IntegrationTechEvidenceKind = "spof" | "manual";

interface IntegrationTechEvidencePanelProps {
  kind: IntegrationTechEvidenceKind;
  spofEvidence: SpofToolEvidence[];
  manualEvidence: ManualFlowEvidence[];
  onClose: () => void;
  onOpenFlow: (flow: MinEAObject) => void;
}

function OpenFlowLink({
  flow,
  onOpenFlow,
}: {
  flow: MinEAObject;
  onOpenFlow: (flow: MinEAObject) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenFlow(flow)}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
    >
      Open {flow.name}
      <ExternalLink size={14} />
    </button>
  );
}

function SpofEvidenceContent({
  evidence,
  onOpenFlow,
}: {
  evidence: SpofToolEvidence[];
  onOpenFlow: (flow: MinEAObject) => void;
}) {
  if (evidence.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No single-point-of-failure tools detected in the current flow set.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {evidence.map((tool) => (
        <div key={tool.toolKey} className="space-y-4">
          <h3 className="text-base font-semibold text-gray-900">{tool.toolName}</h3>
          <div className="space-y-5">
            {tool.pairs.map((pair) => (
              <div
                key={`${tool.toolKey}:${pair.pairKey}:${pair.flow.id}`}
                className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Affected connection
                  </p>
                  <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                    <span>{pair.fromLabel}</span>
                    <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
                    <span>{pair.toLabel}</span>
                  </p>
                </div>

                <p className="text-sm text-gray-700 leading-relaxed">{pair.explanation}</p>

                <div className="rounded-lg border border-white bg-white p-3 space-y-2">
                  <p className="text-sm font-medium text-gray-900">{pair.flow.name}</p>
                  <DetailRow label="Mechanism" value={pair.mechanismLabel} />
                  {pair.platformLabel && (
                    <DetailRow label="Platform" value={pair.platformLabel} />
                  )}
                  {pair.carrierLabel && (
                    <DetailRow label="Infrastructure" value={pair.carrierLabel} />
                  )}
                  {pair.flowNote && <DetailRow label="Note" value={pair.flowNote} />}
                  <OpenFlowLink flow={pair.flow} onOpenFlow={onOpenFlow} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ManualEvidenceContent({
  evidence,
  onOpenFlow,
}: {
  evidence: ManualFlowEvidence[];
  onOpenFlow: (flow: MinEAObject) => void;
}) {
  if (evidence.length === 0) {
    return (
      <p className="text-sm text-gray-500">No manual (ad hoc) flows in the repository.</p>
    );
  }

  return (
    <div className="space-y-4">
      {evidence.map((row) => (
        <div
          key={row.flow.id}
          className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900">{row.flow.name}</p>
            <p className="text-sm text-gray-600 mt-1">{row.connectionLabel}</p>
          </div>
          <DetailRow label="Owner" value={row.owner} />
          <DetailRow label="Trigger" value={row.trigger} />
          <OpenFlowLink flow={row.flow} onOpenFlow={onOpenFlow} />
        </div>
      ))}
    </div>
  );
}

export function IntegrationTechEvidencePanel({
  kind,
  spofEvidence,
  manualEvidence,
  onClose,
  onOpenFlow,
}: IntegrationTechEvidencePanelProps) {
  const title =
    kind === "spof" ? "Single point of failure tools" : "No tooling / ad hoc flows";
  const subtitle =
    kind === "spof"
      ? "Tools that are the only path for at least one system-to-system connection."
      : "Flows executed manually with no integration tooling.";

  return (
    <DetailPanel
      onClose={onClose}
      size="wide"
      header={
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <DetailPanelCloseButton onClose={onClose} />
        </div>
      }
    >
      {kind === "spof" ? (
        <SpofEvidenceContent evidence={spofEvidence} onOpenFlow={onOpenFlow} />
      ) : (
        <ManualEvidenceContent evidence={manualEvidence} onOpenFlow={onOpenFlow} />
      )}

      <DetailSection title="How to read this">
        <p className="text-sm text-gray-600 leading-relaxed">{INTEGRATION_TECH_PANEL_CAPTION}</p>
      </DetailSection>
    </DetailPanel>
  );
}
