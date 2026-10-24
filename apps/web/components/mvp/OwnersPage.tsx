"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ObjectOwnership,
  OwnershipBulkRequest,
  OwnershipRole,
  PeopleContact,
  Team,
} from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { DetailPanelCloseButton } from "@/components/ui/DetailPanel";
import { PeopleTeamsHub } from "@/components/people/PeopleTeamsHub";
import {
  OWNERSHIP_ROLES,
  categoriesIn,
  filterPicker,
  typeLabel,
  typesIn,
} from "@/lib/ownership";

const selectClass =
  "rounded-md border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#1c2230]";

export function useOwnershipData() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = Boolean(orgSlug && workspaceSlug);
  const ownership = useQuery({
    queryKey: ["ownership", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () =>
      peopleApi.listOwnership(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  const teams = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () =>
      peopleApi.listTeams(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  const contacts = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug, ""],
    enabled,
    queryFn: async () =>
      peopleApi.listContacts(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  return {
    items: ownership.data?.items ?? [],
    unowned: ownership.data?.unowned_count ?? 0,
    teams: teams.data?.items ?? [],
    contacts: contacts.data?.items ?? [],
    loading: ownership.isPending,
    failed: ownership.isError,
  };
}

export function useOwnershipWrite() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: OwnershipBulkRequest) =>
      peopleApi.bulkOwnership(
        orgSlug!,
        workspaceSlug!,
        body,
        (await getToken())!,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ownership"] });
      qc.invalidateQueries({ queryKey: ["model-catalog"] });
    },
    onError: (e: Error) =>
      toast({
        title: "Could not save owners",
        description: e.message,
        variant: "destructive",
      }),
  });
}

/** Owners & teams screen is now People & teams (People tab first). */
export function OwnersPage() {
  return <PeopleTeamsHub tab="people" />;
}

export function ownerOptions(teams: Team[], contacts: PeopleContact[]) {
  return [
    ...teams.map((t) => ({ value: `team:${t.id}`, label: t.name })),
    ...contacts.map((c) => ({
      value: `contact:${c.id}`,
      label: `${c.name}${c.team_name ? ` · ${c.team_name}` : ""}`,
    })),
  ];
}

export function BulkAssignDialog({
  title,
  items,
  onClose,
  onSave,
  pending,
}: {
  title: string;
  items: ObjectOwnership[];
  onClose: () => void;
  onSave: (ids: string[], role: OwnershipRole) => void;
  pending: boolean;
}) {
  const [filter, setFilter] = useState({
    q: "",
    unowned: false,
    type: "",
    category: "",
  });
  const [role, setRole] = useState<OwnershipRole>("business_owner");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = filterPicker(items, filter);
  const unowned = items.filter((i) => !i.owned).length;
  const cats = categoriesIn(items);
  const allShown =
    shown.length > 0 && shown.every((i) => picked.has(i.object_id));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[560px] flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e6e8ee] px-5 py-3">
          <h3 className="text-[15px] font-semibold text-[#1c2230]">{title}</h3>
          <DetailPanelCloseButton onClose={onClose} />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <input
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            placeholder="Search"
            className={cn(selectClass, "min-w-0 flex-1")}
          />
          <button
            type="button"
            onClick={() => setFilter({ ...filter, unowned: !filter.unowned })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px]",
              filter.unowned
                ? "border-[#5b4ce6] bg-[#f1efff] text-[#5b4ce6]"
                : "border-[#e6e8ee] text-[#1c2230]",
            )}
          >
            Unowned ({unowned})
          </button>
          <select
            aria-label="Type"
            value={filter.type}
            onChange={(e) =>
              setFilter({ ...filter, type: e.target.value, category: "" })
            }
            className={selectClass}
          >
            <option value="">All types</option>
            {typesIn(items).map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
          {filter.type === "application" && cats.length > 0 && (
            <select
              aria-label="Category"
              value={filter.category}
              onChange={(e) =>
                setFilter({ ...filter, category: e.target.value })
              }
              className={selectClass}
            >
              <option value="">All categories</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-y border-[#e6e8ee]">
          <label className="flex items-center gap-2.5 bg-[#fafbfc] px-5 py-2 text-[12px] text-[#8b90a0]">
            <input
              type="checkbox"
              checked={allShown}
              onChange={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  shown.forEach((i) =>
                    allShown ? next.delete(i.object_id) : next.add(i.object_id),
                  );
                  return next;
                })
              }
            />
            {shown.length} shown
          </label>
          {shown.map((i) => (
            <label
              key={i.object_id}
              className="flex cursor-pointer items-center gap-2.5 px-5 py-2 text-[13px]"
            >
              <input
                type="checkbox"
                checked={picked.has(i.object_id)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(i.object_id)) next.delete(i.object_id);
                    else next.add(i.object_id);
                    return next;
                  })
                }
              />
              <span className="flex-1 text-[#1c2230]">{i.name}</span>
              <span className="text-[12px] text-[#8b90a0]">
                {typeLabel(i.type)}
                {i.owned ? "" : " · unowned"}
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 px-5 py-3">
          <span className="text-[13px] text-[#1c2230]">
            {picked.size} selected as
          </span>
          <select
            aria-label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value as OwnershipRole)}
            className={selectClass}
          >
            {OWNERSHIP_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!picked.size || pending}
            onClick={() => onSave([...picked], role)}
            className="ml-auto rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
