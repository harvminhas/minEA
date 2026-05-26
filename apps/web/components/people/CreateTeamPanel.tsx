"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";

interface Props {
  onClose: () => void;
  onSuccess: (newTeamId: string) => void;
}

export function CreateTeamPanel({ onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const [name, setName] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.createTeam(orgSlug, workspaceSlug, {
        name: name.trim(),
        description,
        lead_name: leadName || undefined,
        lead_email: leadEmail || undefined,
      }, token!);
    },
    onSuccess: (team) => onSuccess(team.id),
  });

  const teamInitials = name
    ? name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")
    : "T";

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-8 pt-6 pb-2 bg-[#faf8f5]">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              People · Teams
            </p>
            <h1 className="text-xl font-semibold text-gray-900">New team</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 text-gray-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-px bg-gray-200/80 mx-8 mt-3" />

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">

          {/* Left: form */}
          <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

              {/* Name */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Name
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Compliance team"
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              {/* Team Lead */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Team Lead
                </label>
                <div className="rounded-md border border-gray-200 overflow-hidden">
                  <input
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    placeholder="Name"
                    className="w-full px-3 py-2.5 text-sm text-gray-800 border-b border-gray-100 focus:outline-none focus:bg-gray-50"
                  />
                  <input
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full px-3 py-2.5 text-sm text-gray-500 focus:outline-none focus:bg-gray-50"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder="What this team owns…"
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>

            {/* Save */}
            <div className="px-6 py-5 border-t border-gray-100">
              {createMutation.isError && (
                <p className="text-xs text-red-500 mb-3">Something went wrong. Please try again.</p>
              )}
              <button
                type="button"
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
                className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-md py-3 text-sm font-semibold transition-colors"
              >
                {createMutation.isPending ? "Creating…" : "Create team"}
              </button>
            </div>
          </div>

          {/* Right: placeholder */}
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center px-12">
            <div className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-lg mb-4 bg-orange-500">
              {teamInitials}
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {name || "New Team"}
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              After creating, you can add roles with assignees and link this team to products, capability domains, processes, and systems.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
