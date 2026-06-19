"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { peopleApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { NameCombobox } from "@/components/ui/NameCombobox";
import type { OwnershipValue } from "@/lib/owner-fields";

interface Props {
  value: OwnershipValue;
  onChange: (value: OwnershipValue) => void;
  required?: boolean;
  className?: string;
  teamLabel?: string;
  pocLabel?: string;
}

export function OwnershipFields({
  value,
  onChange,
  required = true,
  className = "",
  teamLabel = "Owner (team)",
  pocLabel = "Point of contact (optional)",
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const { data: teamsData } = useQuery({
    queryKey: ["teams", orgSlug, workspaceSlug],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
  });

  const { data: contactsData } = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug, value.ownerTeamId],
    enabled,
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listContacts(
        orgSlug,
        workspaceSlug,
        token!,
        value.ownerTeamId || undefined
      );
    },
  });

  const teams = teamsData?.items ?? [];
  const teamOptions = useMemo(
    () => teams.map((team) => ({ id: team.id, label: team.name })),
    [teams]
  );
  const contactOptions = useMemo(
    () => (contactsData?.items ?? []).map((c) => ({ id: c.id, label: c.name })),
    [contactsData]
  );

  function handleTeamChange(name: string, option?: { id: string; label: string }) {
    const previousTeamKey = value.ownerTeamId || value.ownerTeamName.trim().toLowerCase();
    const nextTeamKey = option?.id ?? name.trim().toLowerCase();
    const teamChanged = previousTeamKey !== nextTeamKey;

    onChange({
      ...value,
      ownerTeamName: name,
      ownerTeamId: option?.id ?? "",
      ...(teamChanged ? { pointOfContactId: "", pointOfContactName: "" } : {}),
    });
  }

  function handlePocChange(name: string, option?: { id: string; label: string }) {
    onChange({
      ...value,
      pointOfContactName: name,
      pointOfContactId: option?.id ?? "",
    });
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          {teamLabel}
          {required && <span className="text-red-500"> *</span>}
        </label>
        <NameCombobox
          value={value.ownerTeamName}
          onChange={handleTeamChange}
          options={teamOptions}
          placeholder="Select or type a team…"
          required={required}
          hint="Fed from People → Teams. Type a new name to create on save."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">{pocLabel}</label>
        <NameCombobox
          value={value.pointOfContactName}
          onChange={handlePocChange}
          options={contactOptions}
          placeholder="Select or type a contact…"
          hint="Fed from People → Contacts. Type a new name to create on save."
        />
      </div>
    </div>
  );
}
