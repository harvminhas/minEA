"use client";

import {
  FUNCTIONAL_DIMENSIONS,
  NONFUNCTIONAL_DIMENSIONS,
  computeAppProcessCoverage,
  displayFitness,
  functionalDescriptor,
  nonfunctionalDescriptor,
  parseFunctionalAssessment,
  parseNonfunctionalAssessment,
  weakestScore,
  type FunctionalDimension,
} from "@minea/types";
import { CapabilityAssessmentFields, type AssessmentPatch } from "@/components/capability-map/CapabilityAssessmentFields";
import { ScoreCell } from "@/components/assessment/ScorePips";
import type { AppLink } from "@/lib/capability-detail";
import type { TreeNode } from "@/lib/capability-tree";
import type { CapabilityAssessment, SuggestedPosture } from "@/lib/capability-assessment";
import type { CapObj, CapEdge } from "@/lib/capability-tree";
import type { ProcessLike } from "@/components/assessment/ActivityAssessmentTab";
import { scoreTone } from "@/components/assessment/ScorePips";
import { cn } from "@/lib/utils";

export function CapabilityAssessmentTab({
  node,
  linksByTarget,
  objects,
  edges,
  processes,
  assessment,
  suggestedPosture,
  canEdit,
  onSetAssessment,
}: {
  node: TreeNode;
  linksByTarget: Map<string, AppLink[]>;
  objects: readonly CapObj[];
  edges: readonly CapEdge[];
  processes: ProcessLike[];
  assessment?: CapabilityAssessment;
  suggestedPosture?: SuggestedPosture | null;
  canEdit: boolean;
  onSetAssessment?: (patch: AssessmentPatch) => void;
}) {
  const activities = node.children.length ? node.children : [];
  const appIds = new Set<string>();
  for (const links of [linksByTarget.get(node.id) ?? [], ...activities.map((activity) => linksByTarget.get(activity.id) ?? [])]) {
    for (const link of links) appIds.add(link.appId);
  }
  const apps = objects.filter((object) => appIds.has(object.id));
  const rows = [
    ...activities.map((activity) => rowFor(activity.id, activity.name, linksByTarget.get(activity.id) ?? [], processes, edges)),
    rowFor(node.id, node.name, [
      ...(linksByTarget.get(node.id) ?? []),
      ...activities.flatMap((activity) => linksByTarget.get(activity.id) ?? []),
    ], processes, edges, true, activities.map((activity) => rowFor(activity.id, activity.name, linksByTarget.get(activity.id) ?? [], processes, edges))),
  ];

  return (
    <div className="pt-4" data-testid="capability-assessment-tab">
      {assessment && onSetAssessment ? (
        <CapabilityAssessmentFields
          assessment={assessment}
          suggested={suggestedPosture ?? null}
          canEdit={canEdit}
          onChange={onSetAssessment}
        />
      ) : null}

      <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-[#1c2230]">Apps used — non-functional summary</h2>
      {apps.length ? (
        <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {apps.map((app) => (
            <NfSummary key={app.id} name={app.name} properties={(app.properties ?? {}) as Record<string, unknown>} />
          ))}
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-[#8b90a0]">No applications are linked under this capability yet.</p>
      )}

      <h2 className="mb-2 text-[15px] font-semibold tracking-tight text-[#1c2230]">Functional roll-up from activities</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0" data-testid="functional-rollup">
          <thead>
            <tr>
              <th className="pb-2 pr-3 text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#8b90a0]">Activity</th>
              {FUNCTIONAL_DIMENSIONS.map((key) => (
                <th key={key} className="px-1 pb-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-[#8b90a0]">
                  {functionalDescriptor(key).label}
                </th>
              ))}
              <th className="px-1 pb-2 text-center text-[10.5px] font-semibold uppercase tracking-wide text-[#8b90a0]">Gaps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-3 align-middle">
                  <div className="text-[13px] font-semibold text-[#1c2230]">{row.name}</div>
                  <div className="text-[11px] font-medium text-[#8b90a0]">{row.subtitle}</div>
                </td>
                {FUNCTIONAL_DIMENSIONS.map((key) => (
                  <td key={key} className="px-1 py-2">
                    <ScoreCell score={row.scores[key] ?? null} />
                  </td>
                ))}
                <td className="px-1 py-2 text-center text-[12.5px] font-semibold">
                  <span className={row.gaps ? "text-[#c2410c]" : "text-[#15803d]"}>{row.gaps}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-[11.5px] text-[#6b7289]">
        {([5, 4, 3, 2, 1] as const).map((score) => (
          <span key={score} className="inline-flex items-center gap-1">
            <i className={cn("inline-block h-3.5 w-3.5 rounded-sm", scoreTone(score))} />
            {score}
          </span>
        ))}
        <span>Each cell shows the lowest app score on that activity, then the same rule applies to the capability (and later the domain).</span>
      </div>
    </div>
  );
}

type RollupRow = {
  id: string;
  name: string;
  subtitle: string;
  scores: Partial<Record<FunctionalDimension, number>>;
  gaps: number;
};

function rowFor(
  id: string,
  name: string,
  links: AppLink[],
  processes: ProcessLike[],
  edges: readonly CapEdge[],
  isCapability = false,
  childRows: RollupRow[] = [],
): RollupRow {
  if (isCapability && childRows.length) {
    const scores: Partial<Record<FunctionalDimension, number>> = {};
    for (const key of FUNCTIONAL_DIMENSIONS) {
      const weakest = weakestScore(childRows.map((row) => row.scores[key] ?? null));
      if (weakest != null) scores[key] = weakest;
    }
    const direct = scoresFromLinks(id, links, processes, edges);
    for (const key of FUNCTIONAL_DIMENSIONS) {
      const weakest = weakestScore([scores[key] ?? null, direct.scores[key] ?? null]);
      if (weakest != null) scores[key] = weakest;
    }
    return {
      id,
      name,
      subtitle: "Lowest scores across activities",
      scores,
      gaps: childRows.reduce((sum, row) => sum + row.gaps, 0) + direct.gaps,
    };
  }
  return { id, name, ...scoresFromLinks(id, links, processes, edges) };
}

function scoresFromLinks(activityId: string, links: AppLink[], processes: ProcessLike[], edges: readonly CapEdge[]) {
  const byDim: Partial<Record<FunctionalDimension, number[]>> = {};
  let gaps = 0;
  let weakestFit: string | null = null;
  const rank: Record<string, number> = { strong: 3, adequate: 2, weak: 1 };
  for (const link of links) {
    const assessment = parseFunctionalAssessment(link.attributes?.functional_assessment);
    const computed = computeAppProcessCoverage(link.appId, activityId, processes, edges);
    if (computed) {
      byDim.coverage = [...(byDim.coverage ?? []), assessment?.scores.coverage?.score ?? computed.score];
    } else if (assessment?.scores.coverage?.score) {
      byDim.coverage = [...(byDim.coverage ?? []), assessment.scores.coverage.score];
    }
    for (const key of FUNCTIONAL_DIMENSIONS) {
      if (key === "coverage") continue;
      const score = assessment?.scores[key]?.score;
      if (score) byDim[key] = [...(byDim[key] ?? []), score];
    }
    gaps += assessment?.gaps.length ?? 0;
    const fitness = displayFitness(link.attributes, computed ? [computed.score] : []);
    if (fitness && (weakestFit == null || rank[fitness] < rank[weakestFit])) weakestFit = fitness;
  }
  const scores: Partial<Record<FunctionalDimension, number>> = {};
  for (const key of FUNCTIONAL_DIMENSIONS) {
    const weakest = weakestScore(byDim[key] ?? []);
    if (weakest != null) scores[key] = weakest;
  }
  const apps = links.length;
  const fitLabel = weakestFit ? `${weakestFit[0]!.toUpperCase()}${weakestFit.slice(1)}` : "unscored";
  return {
    subtitle: `${apps} app${apps === 1 ? "" : "s"} · ${apps ? `lowest ${fitLabel}` : "no apps"}`,
    scores,
    gaps,
  };
}

function NfSummary({ name, properties }: { name: string; properties: Record<string, unknown> }) {
  const assessment = parseNonfunctionalAssessment(properties.nonfunctional_assessment);
  return (
    <div className="rounded-xl border border-[#eef0f4] px-3 py-2.5">
      <div className="text-[13.5px] font-semibold text-[#1c2230]">
        {name} <span className="ml-1 text-[11.5px] font-medium text-[#6b7289]">from the application record</span>
      </div>
      <div className="mt-2 grid grid-cols-8 gap-1">
        {NONFUNCTIONAL_DIMENSIONS.map((key) => {
          const score = assessment?.scores[key]?.score;
          return (
            <div key={key} className="text-center">
              <div className={cn("flex h-7 items-center justify-center rounded-md text-[11.5px] font-bold", score ? `${scoreTone(score)} text-white` : "bg-[#f3f4f8] text-[#b0b4c0]")}>
                {score ?? "—"}
              </div>
              <div className="mt-0.5 text-[9px] font-semibold leading-tight tracking-wide text-[#8b90a0]">{nonfunctionalDescriptor(key).short}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
