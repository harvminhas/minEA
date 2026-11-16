"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { moneyLabel, type FitnessKind, type TreeNode } from "@/lib/capability-tree";
import {
  coverageSummary,
  fitnessSummary,
  linkFitnessOf,
  moveTargetsFor,
  overlapNote,
  redundancySummary,
  type AppLink,
  type MoveTarget,
} from "@/lib/capability-detail";
import { themeForDomain } from "@/lib/domain-theme";
import { domainIcon } from "@/lib/capability-map-icons";

/** Clicks/keys on app chips, Move, remove, rename, and other controls stay on those controls. */
export function isCardChromeTarget(target: EventTarget | null, currentTarget: EventTarget | null): boolean {
  if (!(target instanceof Element) || !(currentTarget instanceof Element)) return true;
  if (target === currentTarget) return false;
  const blocking = target.closest("a, button, input, textarea, select, [data-no-card-nav], [role='menuitem']");
  return Boolean(blocking && currentTarget.contains(blocking));
}

export type CapabilityDetailViewProps = {
  node: TreeNode;
  domainName: string;
  theme?: { accent: string; tint: string; ink: string; icon: string };
  backHref: string;
  detailsHref: string;
  activityDetailsHref: (activityId: string) => string;
  onOpenDetails: (href: string) => void;
  highlightId?: string | null;
  linksByTarget: Map<string, AppLink[]>;
  canEdit?: boolean;
  canCreate?: boolean;
  error?: string;
  onAdd: (targetId: string) => void;
  onRemove: (link: AppLink) => void;
  onMove: (link: AppLink, targetId: string) => void;
  onRename?: (id: string, name: string) => void | Promise<void>;
  onAddActivity?: (name: string) => void | Promise<void>;
  onSetFitness?: (link: AppLink, fitness: Exclude<FitnessKind, "none">) => void;
  fitnessOpenRelId?: string | null;
  addDialog?: ReactNode;
};

export function CapabilityDetailView({
  node,
  domainName,
  theme = themeForDomain({ name: domainName }),
  backHref,
  detailsHref,
  activityDetailsHref,
  onOpenDetails,
  highlightId,
  linksByTarget,
  canEdit = false,
  canCreate = false,
  error = "",
  onAdd,
  onRemove,
  onMove,
  onRename,
  onAddActivity,
  onSetFitness,
  fitnessOpenRelId = null,
  addDialog,
}: CapabilityDetailViewProps) {
  const coverage = coverageSummary(node);
  const fitness = fitnessSummary(node);
  const redundancy = redundancySummary(node);
  const [addingActivity, setAddingActivity] = useState(false);
  const DomainIcon = domainIcon(theme.icon);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`activity-${highlightId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, node.id]);

  return (
    <div className="px-6 py-5" data-testid="capability-detail">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">WHAT THE BUSINESS DOES</p>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1c2230]">Capability map</h1>
        </div>
        <Link
          href={backHref}
          className="inline-flex h-8 items-center rounded-md border border-[#e6e8ee] bg-white px-3 text-[12.5px] font-medium text-[#4b5163]"
        >
          Back to map
        </Link>
      </div>

      <div className="max-w-[880px]">
        <div className="mb-3.5 flex items-center gap-2 text-[13px] text-[#6b7289]">
          {domainName ? (
            <>
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                style={{ background: theme.tint, color: theme.ink }}
                aria-hidden
                data-testid="domain-theme-icon"
              >
                <DomainIcon size={12} strokeWidth={2.2} />
              </span>
              <span>{domainName}</span>
            </>
          ) : (
            <span>No domain</span>
          )}
          <span className="text-[#c0c3cc]">/</span>
          <strong className="font-semibold text-[#1c2230]">{node.name}</strong>
        </div>

        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <EditableTitle
              value={node.name}
              canEdit={canEdit && Boolean(onRename)}
              onSave={(name) => onRename?.(node.id, name)}
              heading
            />
            <p className="mt-0.5 text-[13px] text-[#6b7289]">Capability in {domainName || "this map"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={detailsHref}
              className="inline-flex h-8 items-center rounded-md border border-[#e6e8ee] bg-white px-3 text-[12.5px] font-medium text-[#4b5163]"
            >
              Details
            </Link>
            {canEdit && (
              <button
                type="button"
                data-testid="add-relationship"
                onClick={() => onAdd(node.id)}
                className="inline-flex h-8 items-center rounded-lg border border-[#5b4ce6] bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white"
              >
                Add relationship
              </button>
            )}
          </div>
        </div>

        <div className="my-5 grid grid-cols-3 gap-2.5">
          <Kpi value={String(node.uniqueAppIds.length)} label="Apps, rolled up once" />
          <Kpi value={moneyLabel(node.cost)} label="Annual spend" />
          <Kpi
            value={coverage.headline}
            label={coverage.detail}
            tone={coverage.tone}
          />
        </div>

        <div
          className="mb-5 grid grid-cols-3 gap-2.5 rounded-xl border border-[#eef0f4] px-3 py-2.5"
          data-testid="capability-assessment"
        >
          <AssessItem label="Coverage" item={coverage} />
          <AssessItem label="Fitness" item={fitness} />
          <AssessItem label="Redundancy" item={redundancy} />
        </div>

        {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}

        <TargetBlock
          node={node}
          kind="capability"
          highlight={false}
          links={linksByTarget.get(node.id) ?? []}
          moveTargets={moveTargetsFor(node, node.id)}
          canEdit={canEdit}
          detailsHref={detailsHref}
          onOpenDetails={onOpenDetails}
          onRemove={onRemove}
          onMove={onMove}
          onRename={onRename}
          onSetFitness={onSetFitness}
          fitnessOpenRelId={fitnessOpenRelId}
          theme={theme}
        />

        {node.children.map((activity) => (
          <TargetBlock
            key={activity.id}
            node={activity}
            kind="activity"
            highlight={highlightId === activity.id}
            links={linksByTarget.get(activity.id) ?? []}
            moveTargets={moveTargetsFor(node, activity.id)}
            canEdit={canEdit}
            detailsHref={activityDetailsHref(activity.id)}
            onOpenDetails={onOpenDetails}
            onRemove={onRemove}
            onMove={onMove}
            onRename={onRename}
            onSetFitness={onSetFitness}
            fitnessOpenRelId={fitnessOpenRelId}
            theme={theme}
          />
        ))}

        {canCreate && onAddActivity && (
          <div className="mt-1">
            {addingActivity ? (
              <AddActivityForm
                onCancel={() => setAddingActivity(false)}
                onSave={async (name) => {
                  await onAddActivity(name);
                  setAddingActivity(false);
                }}
              />
            ) : (
              <button
                type="button"
                className="bg-transparent text-[12.5px] font-medium text-[#5b4ce6]"
                onClick={() => setAddingActivity(true)}
              >
                + Activity
              </button>
            )}
          </div>
        )}
      </div>
      {addDialog}
    </div>
  );
}

function Kpi({ value, label, tone }: { value: string; label: string; tone?: "good" | "fair" | "gap" }) {
  const color =
    tone === "good" ? "text-[#065f46]" : tone === "fair" ? "text-[#9a3412]" : tone === "gap" ? "text-[#991b1b]" : "text-[#1c2230]";
  return (
    <div className="rounded-xl border border-[#eef0f4] px-3.5 py-3">
      <b className={cn("block text-[20px] font-semibold tracking-[-0.02em]", color)}>{value}</b>
      <span className="mt-0.5 block text-[12px] text-[#6b7289]">{label}</span>
    </div>
  );
}

function AssessItem({
  label,
  item,
}: {
  label: string;
  item: { headline: string; detail: string; tone: "good" | "fair" | "gap" };
}) {
  const color =
    item.tone === "good" ? "text-[#065f46]" : item.tone === "fair" ? "text-[#9a3412]" : "text-[#991b1b]";
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">{label.toUpperCase()}</p>
      <b className={cn("block text-[14px] font-semibold tracking-[-0.01em]", color)}>{item.headline}</b>
      <p className="mt-0.5 text-[12px] text-[#6b7289]">{item.detail}</p>
    </div>
  );
}

function TargetBlock({
  node,
  kind,
  highlight,
  links,
  moveTargets,
  canEdit,
  detailsHref,
  onOpenDetails,
  onRemove,
  onMove,
  onRename,
  onSetFitness,
  fitnessOpenRelId,
  theme,
}: {
  node: TreeNode;
  kind: "capability" | "activity";
  highlight: boolean;
  links: AppLink[];
  moveTargets: MoveTarget[];
  canEdit: boolean;
  detailsHref: string;
  onOpenDetails: (href: string) => void;
  onRemove: (link: AppLink) => void;
  onMove: (link: AppLink, targetId: string) => void;
  onRename?: (id: string, name: string) => void | Promise<void>;
  onSetFitness?: (link: AppLink, fitness: Exclude<FitnessKind, "none">) => void;
  fitnessOpenRelId?: string | null;
  theme: { accent: string; tint: string; ink: string; icon: string };
}) {
  const openDetails = () => onOpenDetails(detailsHref);
  const uniqueApps = [...new Set(links.map((link) => link.appId))];
  const label = kind === "capability" ? `${node.name} details` : `${node.name} activity details`;
  const leftBorder = kind === "capability" ? theme.accent : `color-mix(in srgb, ${theme.accent} 58%, white)`;
  const fill = highlight
    ? undefined
    : kind === "capability"
      ? theme.tint
      : `color-mix(in srgb, ${theme.tint} 55%, white)`;
  return (
    <section
      id={kind === "activity" ? `activity-${node.id}` : `capability-${node.id}`}
      data-testid={kind === "activity" ? `activity-block-${node.id}` : "capability-block"}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={(event) => {
        if (isCardChromeTarget(event.target, event.currentTarget)) return;
        openDetails();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
      style={{ borderLeftWidth: kind === "capability" ? 4 : 3, borderLeftColor: leftBorder, background: fill }}
      className={cn(
        "group relative mb-2.5 rounded-xl border p-3.5 px-4 cursor-pointer",
        "focus-visible:outline-none focus-visible:border-[#c4b5fd] focus-visible:shadow-[0_0_0_3px_rgba(91,76,230,0.14)]",
        kind === "capability" && !highlight && "border-[#e6e8ee] hover:border-[#c4b5fd]",
        kind === "activity" && !highlight && "border-[#e6e8ee] hover:border-[#c4b5fd]",
        highlight && "border-[#c4b5fd] bg-[#f6f5ff] shadow-[0_0_0_3px_rgba(91,76,230,0.14)] hover:border-[#a78bfa]",
        "has-[[data-fitness-open]]:z-20"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <EditableTitle
            value={node.name}
            canEdit={canEdit && Boolean(onRename)}
            onSave={(name) => onRename?.(node.id, name)}
          />
          <span className="mt-px block text-[11px] text-[#8b90a0]">
            {kind === "capability" ? "Capability — apps linked here apply to the whole capability" : "Activity"}
          </span>
        </div>
        {uniqueApps.length >= 2 ? (
          <span
            className="inline-flex h-5 shrink-0 items-center rounded-full bg-[#fff7ed] px-2 text-[11px] font-semibold text-[#9a3412]"
            data-testid={`overlap-badge-${node.id}`}
          >
            {uniqueApps.length} apps
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {links.length === 0 ? (
          <span className="inline-flex rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-medium text-[#c2410c]">No app</span>
        ) : (
          links.map((link) => (
            <AppChip
              key={link.relId}
              link={link}
              levelLabel={kind === "capability" ? "capability" : node.name}
              highlight={highlight}
              canEdit={canEdit}
              moveTargets={moveTargets}
              onRemove={onRemove}
              onMove={onMove}
              onSetFitness={onSetFitness}
              fitnessOpen={fitnessOpenRelId === link.relId}
            />
          ))
        )}
      </div>
      {uniqueApps.length >= 2 ? (
        <p className="mt-2 text-[12px] text-[#9a3412] group-has-[[data-fitness-open]]:invisible" data-testid={`overlap-note-${node.id}`}>
          {overlapNote(node.redundancyApps.length ? node.redundancyApps : uniqueApps.map((id) => links.find((link) => link.appId === id)?.appName).filter((name): name is string => Boolean(name)))}
        </p>
      ) : null}
    </section>
  );
}

const FITNESS_CHOICES: { id: Exclude<FitnessKind, "none">; label: string; dot: string }[] = [
  { id: "strong", label: "Strong", dot: "bg-[#10b981]" },
  { id: "adequate", label: "Adequate", dot: "bg-[#f59e0b]" },
  { id: "weak", label: "Weak", dot: "bg-[#ef4444]" },
];

function fitnessDot(fitness: Exclude<FitnessKind, "none">): string {
  return FITNESS_CHOICES.find((choice) => choice.id === fitness)?.dot ?? "bg-[#f59e0b]";
}

function AppChip({
  link,
  levelLabel,
  highlight,
  canEdit,
  moveTargets,
  onRemove,
  onMove,
  onSetFitness,
  fitnessOpen: fitnessOpenProp = false,
}: {
  link: AppLink;
  levelLabel: string;
  highlight: boolean;
  canEdit: boolean;
  moveTargets: MoveTarget[];
  onRemove: (link: AppLink) => void;
  onMove: (link: AppLink, targetId: string) => void;
  onSetFitness?: (link: AppLink, fitness: Exclude<FitnessKind, "none">) => void;
  fitnessOpen?: boolean;
}) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [fitnessOpen, setFitnessOpen] = useState(fitnessOpenProp);
  const root = useRef<HTMLSpanElement>(null);
  const fitness = linkFitnessOf(link);
  const canSet = Boolean(canEdit && onSetFitness);

  useEffect(() => {
    setFitnessOpen(fitnessOpenProp);
  }, [fitnessOpenProp]);

  useEffect(() => {
    if (!moveOpen && !fitnessOpen) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setMoveOpen(false);
        setFitnessOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moveOpen, fitnessOpen]);

  return (
    <span
      ref={root}
      data-no-card-nav
      data-fitness-open={fitnessOpen ? "true" : undefined}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2.5 pr-2 text-[12.5px] text-[#1c2230]",
        highlight || fitnessOpen ? "bg-[#ece9ff]" : "bg-[#f3f4f8]"
      )}
    >
      <button
        type="button"
        data-testid={`fitness-chip-${link.relId}`}
        disabled={!canSet}
        aria-label={`Set fitness for ${link.appName}`}
        onClick={() => {
          if (!canSet) return;
          setMoveOpen(false);
          setFitnessOpen((value) => !value);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 bg-transparent p-0 text-[12.5px] text-[#1c2230]",
          canSet ? "cursor-pointer" : "cursor-default"
        )}
      >
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", fitnessDot(fitness))} aria-hidden />
        {link.appName} · {levelLabel}
        <span className="text-[11px] font-medium text-[#6b7289]">{FITNESS_CHOICES.find((choice) => choice.id === fitness)?.label}</span>
      </button>
      {canEdit && (
        <>
          <button
            type="button"
            className="bg-transparent text-[11px] font-medium text-[#8b90a0] hover:text-[#5b4ce6]"
            onClick={() => {
              setFitnessOpen(false);
              setMoveOpen((value) => !value);
            }}
          >
            Move
          </button>
          {moveOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-[#e6e8ee] bg-white py-1 shadow-md">
              {moveTargets.length === 0 ? (
                <p className="px-3 py-1.5 text-[12px] text-[#8b90a0]">No other target</p>
              ) : (
                moveTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[12.5px] text-[#1c2230] hover:bg-[#f6f5ff]"
                    onClick={() => {
                      setMoveOpen(false);
                      onMove(link, target.id);
                    }}
                  >
                    {target.name}
                    <span className="ml-1 text-[11px] text-[#8b90a0]">{target.level === "capability" ? "Capability" : "Activity"}</span>
                  </button>
                ))
              )}
            </div>
          )}
          <button
            type="button"
            aria-label={`Remove ${link.appName}`}
            className="bg-transparent px-0.5 text-[13px] leading-none text-[#8b90a0] hover:text-[#5b4ce6]"
            onClick={() => onRemove(link)}
          >
            ×
          </button>
        </>
      )}
      {fitnessOpen && canSet && (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-30 min-w-[148px] rounded-[10px] border border-[#e6e8ee] bg-white p-1.5 shadow-[0_10px_28px_rgba(28,34,48,0.14)]"
          data-testid="fitness-setter"
        >
          <p className="mx-2 mb-1.5 mt-1 text-[10px] font-semibold tracking-[0.08em] text-[#8b90a0]">FITNESS</p>
          {FITNESS_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              data-testid={`fitness-choice-${choice.id}`}
              className={cn(
                "flex w-full items-center gap-2 rounded-[7px] bg-transparent px-2 py-1.5 text-left text-[12.5px] text-[#1c2230]",
                choice.id === fitness && "bg-[#f6f5ff] font-semibold"
              )}
              onClick={() => {
                setFitnessOpen(false);
                onSetFitness?.(link, choice.id);
              }}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", choice.dot)} aria-hidden />
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function EditableTitle({
  value,
  canEdit,
  onSave,
  heading,
}: {
  value: string;
  canEdit: boolean;
  onSave?: (name: string) => void | Promise<void>;
  heading?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    await onSave?.(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(
          "rounded border border-[#c4b5fd] bg-white px-1 font-semibold text-[#1c2230] outline-none",
          heading ? "text-[22px] tracking-[-0.02em]" : "text-[14.5px]"
        )}
      />
    );
  }

  const className = heading
    ? "m-0 text-[22px] font-semibold tracking-[-0.02em] text-[#1c2230]"
    : "m-0 text-[14.5px] font-semibold text-[#1c2230]";

  if (!canEdit) {
    const Tag = heading ? "h2" : "h3";
    return <Tag className={className}>{value}</Tag>;
  }

  return (
    <button
      type="button"
      className={cn(className, "cursor-text rounded bg-transparent text-left hover:ring-1 hover:ring-[#e6e8ee]")}
      onClick={() => setEditing(true)}
    >
      {value}
    </button>
  );
}

function AddActivityForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (trimmed) void onSave(trimmed);
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        placeholder="Activity name"
        data-testid="new-activity-name"
        className="w-64 rounded-md border border-[#e5e7eb] px-3 py-1.5 text-[13px] outline-none focus:border-[#5b4ce6]"
      />
      <button type="submit" disabled={!name.trim()} className="text-[12.5px] font-medium text-[#5b4ce6] disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={onCancel} className="text-[12.5px] text-[#6b7289]">
        Cancel
      </button>
    </form>
  );
}
