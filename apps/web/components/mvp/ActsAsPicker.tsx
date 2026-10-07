"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACTS_AS_LABEL, type ActsAs } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { readActsAs } from "@/lib/ai/acts-as";
import { NameCombobox, type NameComboboxOption } from "@/components/ui/NameCombobox";

const TABS = Object.keys(ACTS_AS_LABEL) as ActsAs["type"][];

export function ActsAsPicker({
  value,
  onSave,
  onCancel,
}: {
  value: ActsAs | null;
  onSave: (value: ActsAs | null) => void;
  onCancel: () => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const authEnabled = useAuthQueryEnabled();
  const [tab, setTab] = useState<ActsAs["type"]>(value?.type ?? "contact");
  const [picked, setPicked] = useState<NameComboboxOption | null>(
    value && value.type !== "service_account" ? { id: value.id, label: value.name } : null
  );
  const [account, setAccount] = useState(value?.type === "service_account" ? value.name : "");
  const [error, setError] = useState("");

  const { data: contactsData } = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug, ""],
    enabled: authEnabled && tab === "contact",
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listContacts(orgSlug, workspaceSlug, token!, undefined);
    },
  });
  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    enabled: authEnabled && tab === "team",
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
  });

  const contactOptions = (contactsData?.items ?? []).map((item) => ({ id: item.id, label: item.name }));
  const teamOptions = (teamsData?.items ?? []).map((item) => ({ id: item.id, label: item.name }));

  const switchTab = (next: ActsAs["type"]) => {
    if (next === tab) return;
    setTab(next);
    setPicked(null);
    setAccount("");
    setError("");
  };

  const save = () => {
    const draft =
      tab === "service_account"
        ? { type: "service_account" as const, name: account }
        : picked
          ? { type: tab, id: picked.id, name: picked.label }
          : null;
    const next = readActsAs(draft);
    if (!next) {
      setError(
        tab === "contact"
          ? "Pick a person from the list"
          : tab === "team"
            ? "Pick a team from the list"
            : "Type the account name"
      );
      return;
    }
    onSave(next);
  };

  return (
    <div className="relative">
      <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={onCancel} />
      <div
        className="absolute right-0 z-20 w-[280px] rounded-lg border border-[#e6e8ee] bg-white p-3 text-left shadow-lg"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <div className="mb-2 flex flex-wrap gap-1">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={
                key === tab
                  ? "rounded-md bg-[#efeefe] px-2 py-1 text-[12px] font-semibold text-[#5b4ce6]"
                  : "rounded-md px-2 py-1 text-[12px] text-[#6b7289]"
              }
            >
              {ACTS_AS_LABEL[key]}
            </button>
          ))}
        </div>
        {tab === "service_account" ? (
          <input
            autoFocus
            aria-label="Service account"
            value={account}
            placeholder="e.g. svc-sales"
            onChange={(event) => {
              setAccount(event.target.value);
              setError("");
            }}
            className="h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[13px]"
          />
        ) : (
          <NameCombobox
            value={picked?.label ?? ""}
            onChange={(_label, option) => {
              setPicked(option ?? null);
              setError("");
            }}
            options={tab === "contact" ? contactOptions : teamOptions}
            placeholder="Search"
            emptyMessage="No matches"
          />
        )}
        {tab === "contact" && (
          <p className="mt-2 text-[12px] text-[#b45309]">A person's own account gets flagged. Prefer a team or service account.</p>
        )}
        {error && <p className="mt-1 text-[12px] text-[#b42318]">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          {value ? (
            <button type="button" className="text-[12px] text-[#b42318]" onClick={() => onSave(null)}>
              Clear
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="text-[12px] text-[#6b7289]" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[12px] font-semibold text-white" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
