"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import type { MinEAObject, StructureDeleteImpact, StructureMoveRequest } from "@minea/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { capabilityMapApi, objectsApi } from "@/lib/api-client";
import { applyCatalogWrite, catalogQueryKey } from "@/lib/use-model-catalog";
import { isActivity } from "@/lib/capability-tree";
import {
  deleteConfirmLabel,
  deleteTitle,
  impactSummary,
  type StructureTarget,
} from "@/lib/structure-actions";

export type { StructureTarget };

export function StructureKebab({
  items,
  ariaLabel,
  testId,
  className,
  buttonClassName,
  align = "end",
}: {
  items: { label: string; icon?: React.ReactNode; onClick: () => void; variant?: "default" | "danger"; hidden?: boolean }[];
  ariaLabel: string;
  testId?: string;
  className?: string;
  buttonClassName?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((item) => !item.hidden);
  if (!visible.length) return null;
  return (
    <div className={cn("relative flex-shrink-0", className)}>
      <button
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-[#64748b] hover:bg-white hover:text-[#1c2230] hover:shadow-[0_0_0_1px_#e2e8f0]",
          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          open && "opacity-100 bg-white text-[#1c2230] shadow-[0_0_0_1px_#e2e8f0]",
          buttonClassName,
        )}
      >
        <MoreVertical size={16} />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className={cn(
              "absolute top-full z-40 mt-1 min-w-[13.5rem] rounded-xl border border-[#e6e8ee] bg-white py-1.5 shadow-[0_10px_30px_rgba(28,34,48,0.12)]",
              align === "start" ? "left-0" : "right-0",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {visible.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                  item.variant === "danger" ? "text-[#b42318] hover:bg-red-50" : "text-[#1c2230] hover:bg-[#f8fafc]",
                )}
              >
                <span className="inline-flex w-4 justify-center text-[#64748b]">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function InlineRename({
  value,
  editing,
  onClose,
  onSave,
  ariaLabel,
  className,
}: {
  value: string;
  editing: boolean;
  onClose: () => void;
  onSave: (name: string) => void | Promise<void>;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, editing]);
  if (!editing) return null;
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      onClose();
      return;
    }
    await onSave(next);
    onClose();
  };
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      data-testid="structure-rename"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className={cn(
        "rounded-md border-2 border-[#4f46e5] bg-white px-1.5 py-0.5 font-semibold text-[#1c2230] outline-none shadow-[0_0_0_3px_rgba(79,70,229,0.15)]",
        className,
      )}
    />
  );
}

function DeleteImpactDialog({
  target,
  impact,
  loading,
  error,
  pending,
  onCancel,
  onConfirm,
}: {
  target: StructureTarget;
  impact: StructureDeleteImpact | null;
  loading: boolean;
  error: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const summary = impact ? impactSummary(impact) : null;
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={pending ? undefined : onCancel} />
      <div
        role="dialog"
        aria-labelledby="delete-impact-title"
        aria-modal="true"
        data-testid="delete-impact-dialog"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)]"
      >
        <div className="px-5 pt-5">
          <h3 id="delete-impact-title" className="text-[17px] font-semibold tracking-[-0.02em] text-[#1c2230]">
            {deleteTitle(target)}
          </h3>
        </div>
        <div className="px-5 pt-2.5 pb-2 text-[14px] leading-5 text-[#334155]">
          {loading ? <p className="text-[#6b7289]">Checking what this will affect…</p> : null}
          {error ? <p className="text-[#b42318]">{error}</p> : null}
          {summary ? (
            <>
              <p>{summary.intro}</p>
              <ul className="my-3 overflow-hidden rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] py-2" data-testid="delete-impact-counts">
                {summary.rows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between px-3 py-1 text-[13.5px] text-[#1c2230]">
                    <span>{row.label}</span>
                    <span className="font-semibold" data-testid={`delete-impact-${row.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[12.5px] text-[#6b7289]">{summary.note}</p>
            </>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] text-[#4b5163] disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || loading || Boolean(error) || !impact}
            data-testid="delete-impact-confirm"
            className="rounded-lg bg-[#b42318] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Deleting…" : deleteConfirmLabel(target.kind)}
          </button>
        </div>
      </div>
    </>
  );
}

function MoveNodeDialog({
  target,
  destinations,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  target: StructureTarget;
  destinations: { id: string; name: string; hint?: string }[];
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (body: StructureMoveRequest) => void;
}) {
  const creatingNew = "__new__";
  const currentId = target.kind === "capability" ? target.domainId ?? "" : target.parentId ?? "";
  const [choice, setChoice] = useState(destinations.find((item) => item.id !== currentId)?.id ?? creatingNew);
  const [newName, setNewName] = useState("");
  const isNew = choice === creatingNew;
  const title = target.kind === "activity" ? `Move ${target.name}` : `Move ${target.name}`;
  const createLabel = target.kind === "activity" ? "New capability…" : "New domain…";
  const canSubmit = isNew ? Boolean(newName.trim()) : Boolean(choice);
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={pending ? undefined : onCancel} />
      <div
        role="dialog"
        aria-labelledby="move-node-title"
        aria-modal="true"
        data-testid="move-node-dialog"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)]"
      >
        <div className="px-5 pt-5">
          <h3 id="move-node-title" className="text-[17px] font-semibold tracking-[-0.02em] text-[#1c2230]">
            {title}
          </h3>
        </div>
        <div className="px-5 pt-2.5 text-[14px] leading-5 text-[#334155]">
          {target.kind === "capability" ? (
            <p>
              Activities under this capability move with it. App links stay attached.
            </p>
          ) : (
            <p>App links stay attached to this activity.</p>
          )}
          <div className="mt-3 overflow-hidden rounded-[10px] border border-[#e2e8f0]">
            {destinations.map((item) => (
              <label
                key={item.id || item.name}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 border-t border-[#f1f5f9] px-3 py-2 text-[13.5px] first:border-t-0",
                  choice === item.id && "bg-[#eef2ff]",
                )}
              >
                <input
                  type="radio"
                  name="structure-move"
                  className="accent-[#4f46e5]"
                  checked={choice === item.id}
                  onChange={() => setChoice(item.id)}
                />
                <span className="flex-1">{item.name}</span>
                {item.id === currentId ? <span className="text-[11px] text-[#64748b]">Current</span> : null}
                {item.hint ? <span className="text-[11px] text-[#64748b]">{item.hint}</span> : null}
              </label>
            ))}
            <label className={cn("flex cursor-pointer items-center gap-2.5 border-t border-[#f1f5f9] px-3 py-2 text-[13.5px] font-medium text-[#4f46e5]", isNew && "bg-[#eef2ff]")}>
              <input type="radio" name="structure-move" className="accent-[#4f46e5]" checked={isNew} onChange={() => setChoice(creatingNew)} />
              {createLabel}
            </label>
            {isNew ? (
              <div className="border-t border-[#f1f5f9] px-3 py-2">
                <input
                  autoFocus
                  data-testid="move-new-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder={target.kind === "activity" ? "Capability name" : "Domain name"}
                  className="h-8 w-full rounded-md border border-[#e6e8ee] px-2.5 text-[13px] outline-none focus:border-[#4f46e5]"
                />
              </div>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-[12.5px] text-[#b42318]">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] text-[#4b5163] disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            data-testid="move-node-confirm"
            disabled={pending || !canSubmit}
            onClick={() => {
              if (target.kind === "activity") {
                onConfirm(isNew ? { new_capability_name: newName.trim(), domain_id: target.domainId } : { parent_id: choice });
              } else {
                onConfirm(isNew ? { new_domain_name: newName.trim() } : { domain_id: choice });
              }
            }}
            className="rounded-lg bg-[#4f46e5] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </>
  );
}

export function useStructureActions(objects: readonly MinEAObject[]) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const queryClient = useQueryClient();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StructureTarget | null>(null);
  const [impact, setImpact] = useState<StructureDeleteImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [moveTarget, setMoveTarget] = useState<StructureTarget | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] });
  };

  const token = async () => {
    const value = await getToken();
    if (!value || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return value;
  };

  const run = async (work: () => Promise<void>) => {
    setError("");
    setPending(true);
    try {
      await work();
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save");
      throw caught;
    } finally {
      setPending(false);
    }
  };

  const rename = (id: string, name: string) =>
    run(async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const current = objects.find((item) => item.id === id);
      if (!current || current.name === trimmed) return;
      const updated = await objectsApi.update(orgSlug!, workspaceSlug!, id, { name: trimmed }, await token());
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: updated });
    });

  const addCapability = (domainId: string) =>
    run(async () => {
      const created = await objectsApi.create(
        orgSlug!,
        workspaceSlug!,
        { type: "capability", name: "New capability", status: "active", properties: domainId ? { domain_id: domainId } : {} },
        await token(),
      );
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: created });
      setRenamingId(created.id);
    });

  const addActivity = (parentId: string, domainId?: string | null) =>
    run(async () => {
      const properties: Record<string, string> = { parent_id: parentId };
      if (domainId) properties.domain_id = domainId;
      const created = await objectsApi.create(
        orgSlug!,
        workspaceSlug!,
        { type: "capability", name: "New activity", status: "active", properties },
        await token(),
      );
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: created });
      setRenamingId(created.id);
    });

  useEffect(() => {
    if (!deleteTarget) {
      setImpact(null);
      setError("");
      return;
    }
    let cancelled = false;
    setImpactLoading(true);
    setImpact(null);
    setError("");
    void (async () => {
      try {
        const data = await capabilityMapApi.deleteImpact(orgSlug, workspaceSlug, deleteTarget.id, await token());
        if (!cancelled) setImpact(data);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Couldn't load impact");
      } finally {
        if (!cancelled) setImpactLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteTarget?.id, orgSlug, workspaceSlug]);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    void run(async () => {
      await objectsApi.delete(orgSlug!, workspaceSlug!, deleteTarget.id, await token());
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { removeId: deleteTarget.id });
      setDeleteTarget(null);
    }).catch(() => undefined);
  };

  const confirmMove = (body: StructureMoveRequest) => {
    if (!moveTarget) return;
    void run(async () => {
      await capabilityMapApi.moveNode(orgSlug!, workspaceSlug!, moveTarget.id, body, await token());
      setMoveTarget(null);
    }).catch(() => undefined);
  };

  const destinations = useMemo(() => {
    if (!moveTarget) return [];
    if (moveTarget.kind === "capability") {
      return objects
        .filter((item) => item.type === "business_domain")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({ id: item.id, name: item.name }));
    }
    return objects
      .filter((item) => item.type === "capability" && !isActivity(item.properties) && item.id !== moveTarget.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => ({
        id: item.id,
        name: item.name,
        hint: objects.find((domain) => domain.id === String(item.properties?.domain_id ?? ""))?.name,
      }));
  }, [moveTarget, objects]);

  const dialogs = (
    <>
      {deleteTarget ? (
        <DeleteImpactDialog
          target={deleteTarget}
          impact={impact}
          loading={impactLoading}
          error={error}
          pending={pending}
          onCancel={() => {
            if (!pending) {
              setDeleteTarget(null);
              setError("");
            }
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
      {moveTarget ? (
        <MoveNodeDialog
          target={moveTarget}
          destinations={destinations}
          pending={pending}
          error={error}
          onCancel={() => {
            if (!pending) {
              setMoveTarget(null);
              setError("");
            }
          }}
          onConfirm={confirmMove}
        />
      ) : null}
    </>
  );

  const api = {
    canCreate,
    canEdit,
    canDelete,
    pending,
    error,
    renamingId,
    setRenamingId,
    rename,
    addCapability,
    addActivity,
    openDelete: setDeleteTarget,
    openMove: setMoveTarget,
    dialogs,
  };
  return api;
}

export type StructureActions = ReturnType<typeof useStructureActions>;
