"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { ContactAssignmentsPanel } from "@/components/people/ContactAssignmentsPanel";
import type { Team } from "@minea/types";

interface Props {
  contactId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function ContactDetailPanel({ contactId, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(contactId);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");

  const { data: contact, isLoading } = useQuery({
    queryKey: ["people-contact", orgSlug, workspaceSlug, contactId],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.getContact(orgSlug, workspaceSlug, contactId, token!);
    },
    enabled,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["people-teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  useEffect(() => {
    if (!contact) return;
    setName(contact.name);
    setEmail(contact.email ?? "");
    setTeamId(contact.team_id ?? "");
  }, [contact]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.updateContact(orgSlug, workspaceSlug, contactId, {
        name: name.trim(),
        email: email.trim() || null,
        team_id: teamId || null,
      }, token!);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["people-contact", orgSlug, workspaceSlug, contactId],
      });
      queryClient.invalidateQueries({ queryKey: ["people-contacts", orgSlug, workspaceSlug] });
      onUpdate();
    },
  });

  if (isLoading || !contact) {
    return (
      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-6 pb-2 bg-[#faf8f5]">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              People · Contacts
            </p>
            <h1 className="text-xl font-semibold text-gray-900">{contact.name}</h1>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-black/5 text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="h-px bg-gray-200/80 mx-8 mt-3" />

        <div className="flex flex-1 min-h-0">
          <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Team (optional)
                </label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm"
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
            <div className="px-6 py-5 border-t border-gray-100">
              {saveMutation.isError && (
                <p className="text-xs text-red-500 mb-3">Something went wrong. Please try again.</p>
              )}
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-md py-3 text-sm font-semibold"
              >
                {saveMutation.isPending ? "Saving…" : "Save contact"}
              </button>
            </div>
          </div>

          <div className="flex-1 min-w-0 overflow-y-auto">
            <ContactAssignmentsPanel assignments={contact.assignments ?? []} />
          </div>
        </div>
      </div>
    </>
  );
}
