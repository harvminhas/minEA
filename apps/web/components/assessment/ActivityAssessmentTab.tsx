"use client";

import { useMemo, useState } from "react";
import {
  FUNCTIONAL_DIMENSIONS,
  REGIONAL_SCOPES,
  computeAppProcessCoverage,
  displayFitness,
  functionalDescriptor,
  parseFunctionalAssessment,
  regionalScopeLabel,
  serializeFunctionalAssessment,
  type CoverageComputed,
  type DimensionScore,
  type FunctionalAssessment,
  type FunctionalDimension,
  OBJECT_TYPE_LABELS,
  type ObjectType,
} from "@minea/types";
import type { AppLink } from "@/lib/capability-detail";
import { ConfidenceMark, ScorePips } from "@/components/assessment/ScorePips";
import { ScoreEditorPanel, type ScoreEditorTarget } from "@/components/assessment/ScoreEditorPanel";
import { cn } from "@/lib/utils";

export type ProcessLike = { stages?: { capability_ids?: string[] }[] };
export type EdgeLike = { type?: string; from_object_id?: string; to_object_id?: string };

const FITNESS_TONE = {
  strong: "bg-[#ecfdf3] text-[#15803d]",
  adequate: "bg-[#fff7ed] text-[#c2410c]",
  weak: "bg-[#fef2f2] text-[#b91c1c]",
} as const;

export function ActivityAssessmentTab({
  activityId,
  activityName,
  links,
  processes,
  edges,
  canEdit,
  onChange,
  pending,
  error,
}: {
  activityId: string;
  activityName: string;
  links: AppLink[];
  processes: ProcessLike[];
  edges: readonly EdgeLike[];
  canEdit: boolean;
  onChange: (link: AppLink, next: FunctionalAssessment) => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
}) {
  const [editor, setEditor] = useState<{ link: AppLink; dimension: FunctionalDimension } | null>(null);

  const target: ScoreEditorTarget | null = useMemo(() => {
    if (!editor) return null;
    const assessment = parseFunctionalAssessment(editor.link.attributes?.functional_assessment) ?? { scores: {}, gaps: [], regional_scope: null };
    return {
      title: functionalDescriptor(editor.dimension).label,
      subtitle: `${editor.link.appName} on ${activityName}`,
      descriptor: functionalDescriptor(editor.dimension),
      value: assessment.scores[editor.dimension] ?? null,
    };
  }, [editor, activityName]);

  return (
    <div className="pt-4" data-testid="activity-assessment">
      <p className="mb-3.5 max-w-[820px] text-[13px] text-[#5b6170]">
        Rate how well each app supports this activity. Its Strong / Adequate / Weak rating updates from these scores.
      </p>
      {links.length === 0 ? (
        <p className="text-[13px] text-[#8b90a0]">No applications are linked to this activity yet.</p>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <AppScorecard
              key={link.relId}
              link={link}
              activityId={activityId}
              processes={processes}
              edges={edges}
              canEdit={canEdit}
              activeDimension={editor?.link.relId === link.relId ? editor.dimension : null}
              onEdit={(dimension) => setEditor({ link, dimension })}
              onAssessment={(next) => void onChange(link, next)}
            />
          ))}
        </div>
      )}
      {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}
      {editor && target ? (
        <ScoreEditorPanel
          target={target}
          canEdit={canEdit}
          pending={pending}
          error={error}
          onClose={() => setEditor(null)}
          onSave={(value) => {
            const current = parseFunctionalAssessment(editor.link.attributes?.functional_assessment) ?? { scores: {}, gaps: [], regional_scope: null };
            const next: FunctionalAssessment = { ...current, scores: { ...current.scores, [editor.dimension]: value } };
            void onChange(editor.link, next);
            setEditor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AppScorecard({
  link,
  activityId,
  processes,
  edges,
  canEdit,
  activeDimension,
  onEdit,
  onAssessment,
}: {
  link: AppLink;
  activityId: string;
  processes: ProcessLike[];
  edges: readonly EdgeLike[];
  canEdit: boolean;
  activeDimension: FunctionalDimension | null;
  onEdit: (dimension: FunctionalDimension) => void;
  onAssessment: (next: FunctionalAssessment) => void;
}) {
  const assessment = parseFunctionalAssessment(link.attributes?.functional_assessment) ?? { scores: {}, gaps: [], regional_scope: null };
  const computed = computeAppProcessCoverage(link.appId, activityId, processes, edges);
  const coverage = coverageFor(assessment, computed);
  const fitness = displayFitness(link.attributes, computed ? [computed.score] : []);
  const derived = Boolean(parseFunctionalAssessment(link.attributes?.functional_assessment));

  return (
    <section className="rounded-xl border border-[#eef0f4] px-4 py-3.5" data-testid={`functional-scorecard-${link.appId}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-[#1c2230]">{link.appName}</div>
          <div className="mt-0.5 text-[12px] text-[#6b7289]">
            Supported by {OBJECT_TYPE_LABELS[link.appType as ObjectType] ?? link.appType ?? "application"} on this activity
          </div>
        </div>
        <div className="flex items-center gap-2">
          {fitness ? (
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", FITNESS_TONE[fitness])}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {fitness === "strong" ? "Strong" : fitness === "adequate" ? "Adequate" : "Weak"}
            </span>
          ) : (
            <span className="text-[12px] text-[#8b90a0]">Fitness not scored</span>
          )}
          {derived ? <span className="text-[11.5px] font-medium text-[#6b7289]">updated from scores</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2">
        {FUNCTIONAL_DIMENSIONS.map((key) => {
          const item = key === "coverage" ? coverage.score : assessment.scores[key];
          const hint = key === "coverage" && coverage.computed
            ? `${coverage.computed.supported} of ${coverage.computed.total} linked process steps supported`
            : undefined;
          const ev = evidenceLabel(item, key === "coverage" && coverage.computed ? "Computed" : undefined);
          return (
            <button
              key={key}
              type="button"
              disabled={!canEdit}
              data-testid={`dimension-${link.appId}-${key}`}
              onClick={() => onEdit(key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                canEdit && "hover:bg-[#f6f5ff]",
                activeDimension === key && "bg-[#f6f5ff]",
                !canEdit && "cursor-default",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[#1c2230]">{functionalDescriptor(key).label}</span>
                {hint ? <span className="block text-[11px] font-medium text-[#8b90a0]">{hint}</span> : null}
              </span>
              <ScorePips score={item?.score} />
              <ConfidenceMark value={item?.confidence} />
              <span className={cn("whitespace-nowrap text-[11px] font-medium", ev ? "text-[#5b4ce6]" : "text-[#b0b4c0]")}>
                {ev || "Add evidence"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-1">
        {REGIONAL_SCOPES.map((scope) => (
          <button
            key={scope}
            type="button"
            disabled={!canEdit}
            onClick={() => onAssessment({ ...assessment, regional_scope: scope })}
            className={cn(
              "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
              assessment.regional_scope === scope ? "bg-[#1c2230] font-semibold text-white" : "bg-[#f3f4f8] text-[#4b5163]",
            )}
          >
            {regionalScopeLabel(scope)}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t border-[#eef0f4] pt-2.5">
        <div className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">GAPS &amp; WANTS</div>
        {assessment.gaps.length ? (
          <ul className="space-y-1">
            {assessment.gaps.map((gap, index) => (
              <li key={`${gap}-${index}`} className="flex items-start gap-2 text-[13px] text-[#1c2230]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c2410c]" />
                <span className="flex-1">{gap}</span>
                {canEdit ? (
                  <button
                    type="button"
                    className="text-[11px] text-[#8b90a0] hover:text-[#1c2230]"
                    onClick={() => onAssessment({ ...assessment, gaps: assessment.gaps.filter((_, i) => i !== index) })}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[#6b7289]">No open gaps recorded.</p>
        )}
        {canEdit ? <GapAdder onAdd={(text) => onAssessment({ ...assessment, gaps: [...assessment.gaps, text] })} /> : null}
      </div>
    </section>
  );
}

function coverageFor(assessment: FunctionalAssessment, computed: CoverageComputed | null): { score: DimensionScore | null; computed: CoverageComputed | null } {
  if (computed) {
    const stored = assessment.scores.coverage;
    return {
      computed,
      score: {
        score: stored?.score ?? computed.score,
        confidence: stored?.confidence ?? "H",
        evidence: stored?.evidence?.length ? stored.evidence : [{ kind: "note", text: `${computed.supported} of ${computed.total} linked process steps supported` }],
      },
    };
  }
  return { score: assessment.scores.coverage ?? null, computed: null };
}

function evidenceLabel(item: DimensionScore | null | undefined, fallback?: string): string | undefined {
  if (fallback && !item?.evidence?.length) return fallback;
  const first = item?.evidence?.[0];
  if (!first) return fallback;
  if (first.kind === "link") return "1 link";
  const text = first.text ?? "";
  if (/survey/i.test(text)) return text.length > 22 ? "Survey" : text;
  if (item && item.evidence.length > 1) return `${item.evidence.length} notes`;
  return "1 note";
}

function GapAdder({ onAdd }: { onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button type="button" className="mt-1 text-[12.5px] font-medium text-[#5b4ce6]" onClick={() => setOpen(true)}>
        + Add a gap or request
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-1.5">
      <input
        data-testid="gap-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="A pain point or requested change"
        className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#5b4ce6]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="text-[12px] font-medium text-[#5b4ce6]"
          onClick={() => {
            if (!text.trim()) return;
            onAdd(text.trim());
            setText("");
            setOpen(false);
          }}
        >
          Add
        </button>
        <button type="button" className="text-[12px] text-[#8b90a0]" onClick={() => { setOpen(false); setText(""); }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function assessmentPayload(assessment: FunctionalAssessment): Record<string, unknown> {
  return serializeFunctionalAssessment(assessment);
}
