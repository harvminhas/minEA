"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { moneyLabel, type TreeNode } from "@/lib/capability-tree";
import {
  coverageSummary,
  moveTargetsFor,
  type AppLink,
  type MoveTarget,
} from "@/lib/capability-detail";

export type CapabilityDetailViewProps = {
  node: TreeNode;
  domainName: string;
  backHref: string;
  detailsHref: string;
  activityHref: (activityId: string) => string;
  activityDetailsHref: (activityId: string) => string;
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
  addDialog?: ReactNode;
};

export function CapabilityDetailView({
  node,
  domainName,
  backHref,
  detailsHref,
  activityHref,
  activityDetailsHref,
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
  addDialog,
}: CapabilityDetailViewProps) {
  const coverage = coverageSummary(node);
  const [addingActivity, setAddingActivity] = useState(false);

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
          <span>{domainName || "No domain"}</span>
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

        {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}

        <TargetBlock
          node={node}
          kind="capability"
          highlight={false}
          links={linksByTarget.get(node.id) ?? []}
          moveTargets={moveTargetsFor(node, node.id)}
          canEdit={canEdit}
          detailsHref={detailsHref}
          onAdd={onAdd}
          onRemove={onRemove}
          onMove={onMove}
          onRename={onRename}
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
            href={activityHref(activity.id)}
            detailsHref={activityDetailsHref(activity.id)}
            onAdd={onAdd}
            onRemove={onRemove}
            onMove={onMove}
            onRename={onRename}
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

function TargetBlock({
  node,
  kind,
  highlight,
  links,
  moveTargets,
  canEdit,
  href,
  detailsHref,
  onAdd,
  onRemove,
  onMove,
  onRename,
}: {
  node: TreeNode;
  kind: "capability" | "activity";
  highlight: boolean;
  links: AppLink[];
  moveTargets: MoveTarget[];
  canEdit: boolean;
  href?: string;
  detailsHref: string;
  onAdd: (targetId: string) => void;
  onRemove: (link: AppLink) => void;
  onMove: (link: AppLink, targetId: string) => void;
  onRename?: (id: string, name: string) => void | Promise<void>;
}) {
  return (
    <section
      id={kind === "activity" ? `activity-${node.id}` : `capability-${node.id}`}
      data-testid={kind === "activity" ? `activity-block-${node.id}` : "capability-block"}
      className={cn(
        "mb-2.5 rounded-xl border p-3.5 px-4",
        kind === "capability" && !highlight && "border-[#e6e8ee] bg-[#fafafb]",
        kind === "activity" && !highlight && "border-[#e6e8ee] bg-white",
        highlight && "border-[#c4b5fd] bg-[#f6f5ff] shadow-[0_0_0_3px_rgba(91,76,230,0.14)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <EditableTitle
            value={node.name}
            canEdit={canEdit && Boolean(onRename)}
            onSave={(name) => onRename?.(node.id, name)}
            href={href}
          />
          <span className="mt-px block text-[11px] text-[#8b90a0]">
            {kind === "capability" ? "Capability — apps linked here apply to the whole capability" : "Activity"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href={detailsHref} className="bg-transparent text-[12.5px] font-medium text-[#6b7289] hover:text-[#5b4ce6]">
            Details
          </Link>
          {canEdit && (
            <button
              type="button"
              data-testid={`link-app-${node.id}`}
              onClick={() => onAdd(node.id)}
              className="bg-transparent text-[12.5px] font-medium text-[#5b4ce6]"
            >
              + Link app
            </button>
          )}
        </div>
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
            />
          ))
        )}
      </div>
    </section>
  );
}

function AppChip({
  link,
  levelLabel,
  highlight,
  canEdit,
  moveTargets,
  onRemove,
  onMove,
}: {
  link: AppLink;
  levelLabel: string;
  highlight: boolean;
  canEdit: boolean;
  moveTargets: MoveTarget[];
  onRemove: (link: AppLink) => void;
  onMove: (link: AppLink, targetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span
      ref={root}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full py-[3px] pl-2.5 pr-2 text-[12.5px] text-[#1c2230]",
        highlight ? "bg-[#ece9ff]" : "bg-[#f3f4f8]"
      )}
    >
      {link.appName} · {levelLabel}
      {canEdit && (
        <>
          <button
            type="button"
            className="bg-transparent text-[11px] font-medium text-[#8b90a0] hover:text-[#5b4ce6]"
            onClick={() => setOpen((value) => !value)}
          >
            Move
          </button>
          {open && (
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
                      setOpen(false);
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
    </span>
  );
}

function EditableTitle({
  value,
  canEdit,
  onSave,
  heading,
  href,
}: {
  value: string;
  canEdit: boolean;
  onSave?: (name: string) => void | Promise<void>;
  heading?: boolean;
  href?: string;
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

  if (href && !canEdit) {
    return (
      <Link href={href} className={className}>
        {value}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={cn(className, "bg-transparent text-left", canEdit && "cursor-text rounded hover:ring-1 hover:ring-[#e6e8ee]")}
      onClick={() => {
        if (canEdit) setEditing(true);
      }}
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
