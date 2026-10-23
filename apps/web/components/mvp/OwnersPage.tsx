"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ObjectOwnership,
  OwnerRef,
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
import {
  DetailPanel,
  DetailPanelCloseButton,
} from "@/components/ui/DetailPanel";
import {
  OWNERSHIP_ROLES,
  categoriesIn,
  filterPicker,
  groupByType,
  ownedBy,
  roleLabel,
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

export function OwnersPage() {
  const { basePath } = useTenancy();
  const data = useOwnershipData();
  const [tab, setTab] = useState<"team" | "contact">("team");
  const [open, setOpen] = useState<OwnerRef | null>(null);

  const rows = useMemo(() => {
    const list: { ref: OwnerRef; name: string; sub: string }[] =
      tab === "team"
        ? data.teams.map((t) => ({
            ref: { type: "team", id: t.id },
            name: t.name,
            sub:
              data.contacts.find((c) => c.id === t.lead_contact_id)?.name ??
              t.lead_name ??
              "",
          }))
        : data.contacts.map((c) => ({
            ref: { type: "contact", id: c.id },
            name: c.name,
            sub: c.team_name ?? "",
          }));
    return list.map((r) => ({
      ...r,
      owned: ownedBy(data.items, r.ref).length,
    }));
  }, [tab, data.teams, data.contacts, data.items]);

  const openName = open
    ? (rows.find((r) => r.ref.id === open.id)?.name ?? "")
    : "";

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#1c2230]">
          Owners & teams
        </h1>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-medium",
            data.unowned
              ? "bg-amber-50 text-amber-700"
              : "bg-[#f4f5f8] text-[#8b90a0]",
          )}
        >
          {data.unowned} unowned
        </span>
      </div>
      <div className="mb-3 flex gap-4 border-b border-[#e6e8ee] text-[13px]">
        {(["team", "contact"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 pb-2 font-medium",
              tab === t
                ? "border-[#5b4ce6] text-[#1c2230]"
                : "border-transparent text-[#8b90a0]",
            )}
          >
            {t === "team"
              ? `Teams (${data.teams.length})`
              : `Contacts (${data.contacts.length})`}
          </button>
        ))}
      </div>
      <div className="divide-y divide-[#f0f1f5] rounded-xl border border-[#e6e8ee]">
        {rows.map((r) => (
          <button
            key={r.ref.id}
            type="button"
            onClick={() => setOpen(r.ref)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-[#fafbfc]"
          >
            <span>
              <span className="font-medium text-[#1c2230]">{r.name}</span>
              {r.sub && (
                <span className="ml-2 text-[#8b90a0]">
                  {tab === "team" ? `Lead: ${r.sub}` : r.sub}
                </span>
              )}
            </span>
            <span className="text-[#8b90a0]">
              {r.owned ? `${r.owned} owned` : "—"}
            </span>
          </button>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-6 text-[13px] text-[#8b90a0]">
            No {tab === "team" ? "teams" : "contacts"} yet.{" "}
            <Link
              href={`${basePath}/people/${tab === "team" ? "teams" : "contacts"}`}
              className="text-[#5b4ce6]"
            >
              Add one
            </Link>
          </p>
        )}
      </div>
      {open && (
        <OwnerPanel
          owner={open}
          name={openName}
          data={data}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

type Data = ReturnType<typeof useOwnershipData>;

function OwnerPanel({
  owner,
  name,
  data,
  onClose,
}: {
  owner: OwnerRef;
  name: string;
  data: Data;
  onClose: () => void;
}) {
  const owned = ownedBy(data.items, owner);
  const groups = groupByType(
    owned,
    (r) => r.item.type,
    (r) => r.item.name,
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const write = useOwnershipWrite();
  const targets = ownerOptions(data.teams, data.contacts).filter(
    (o) => o.value !== `${owner.type}:${owner.id}`,
  );

  const run = (body: Omit<OwnershipBulkRequest, "owner">, done: string) =>
    write.mutate(
      { ...body, owner },
      {
        onSuccess: () => {
          toast({ title: done });
          setPicked(new Set());
          setMoveTo("");
        },
      },
    );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-center justify-between border-b border-[#e6e8ee] px-6 py-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">
                {owner.type === "team" ? "TEAM" : "CONTACT"}
              </p>
              <h2 className="text-[17px] font-semibold text-[#1c2230]">
                {name}
              </h2>
            </div>
            <DetailPanelCloseButton onClose={onClose} />
          </div>
        }
        footer={
          <div className="flex items-center gap-2 border-t border-[#e6e8ee] px-6 py-3">
            {picked.size > 0 ? (
              <>
                <span className="whitespace-nowrap text-[13px] text-[#1c2230]">
                  {picked.size} selected
                </span>
                <select
                  aria-label="Move to"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className={cn(selectClass, "ml-auto")}
                >
                  <option value="">Move to…</option>
                  {targets.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!moveTo || write.isPending}
                  onClick={() => {
                    const [type, id] = moveTo.split(":") as [
                      OwnerRef["type"],
                      string,
                    ];
                    run(
                      {
                        action: "move",
                        object_ids: [...picked],
                        target: { type, id },
                      },
                      `Moved ${picked.size}`,
                    );
                  }}
                  className="rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                >
                  Move
                </button>
                <button
                  type="button"
                  disabled={write.isPending}
                  onClick={() =>
                    run(
                      { action: "remove", object_ids: [...picked] },
                      `Removed from ${picked.size}`,
                    )
                  }
                  className="rounded-md border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-red-600"
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAssigning(true)}
                className="ml-auto rounded-md bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-medium text-white"
              >
                Assign objects
              </button>
            )}
          </div>
        }
      >
        {owned.length === 0 && (
          <p className="text-[13px] text-[#8b90a0]">Owns nothing yet.</p>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]">
              {g.label} · {g.items.length}
            </p>
            <ul className="divide-y divide-[#f0f1f5] rounded-lg border border-[#e6e8ee]">
              {g.items.map(({ item, roles }) => (
                <li key={item.object_id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px]">
                    <input
                      type="checkbox"
                      checked={picked.has(item.object_id)}
                      onChange={() => toggle(item.object_id)}
                    />
                    <span className="flex-1 text-[#1c2230]">{item.name}</span>
                    <span className="text-[12px] text-[#8b90a0]">
                      {roles.map(roleLabel).join(", ")}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </DetailPanel>
      {assigning && (
        <BulkAssignDialog
          title={`Assign to ${name}`}
          items={data.items}
          onClose={() => setAssigning(false)}
          pending={write.isPending}
          onSave={(ids, role) =>
            write.mutate(
              { action: "assign", object_ids: ids, role, owner },
              {
                onSuccess: () => {
                  toast({
                    title: `Assigned ${ids.length} as ${roleLabel(role)}`,
                  });
                  setAssigning(false);
                },
              },
            )
          }
        />
      )}
    </>
  );
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
