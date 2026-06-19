"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import type { Team } from "@minea/types";
import { useQuery } from "@tanstack/react-query";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

interface Props {
  onClose: () => void;
  onSuccess: (newContactId: string) => void;
  defaultTeamId?: string;
}

export function CreateContactPanel({ onClose, onSuccess, defaultTeamId }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");

  const { data: teamsData } = useQuery({
    queryKey: ["people-teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.createContact(orgSlug, workspaceSlug, {
        name: name.trim(),
        email: email.trim() || undefined,
        team_id: teamId || undefined,
      }, token!);
    },
    onSuccess: (contact) => onSuccess(contact.id),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col max-w-lg ml-auto shadow-xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <h1 className="text-lg font-semibold text-gray-900">New contact</h1>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Team</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">No team</option>
              {(teamsData?.items ?? []).map((team: Team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="w-full bg-gray-900 text-white rounded-md py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {createMutation.isPending ? "Creating…" : "Create contact"}
          </button>
        </div>
      </div>
    </>
  );
}
