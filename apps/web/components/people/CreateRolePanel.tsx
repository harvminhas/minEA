"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { PEOPLE_LAYER_COLOR } from "@/lib/people-utils";
import type { PeopleRoleKind } from "@minea/types";

interface Props {
  onClose: () => void;
  onSuccess: (newRoleId: string) => void;
}

export function CreateRolePanel({ onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const [name, setName] = useState("");
  const [roleKind, setRoleKind] = useState<PeopleRoleKind>("owner");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return peopleApi.createRole(orgSlug, workspaceSlug, { name: name.trim(), role_kind: roleKind, description }, token!);
    },
    onSuccess: (role) => onSuccess(role.id),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-8 pt-6 pb-2 bg-[#faf8f5]">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              People · Roles
            </p>
            <h1 className="text-xl font-semibold text-gray-900">New role</h1>
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
                  placeholder="Compliance Officer"
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Type
                </label>
                <div className="relative">
                  <select
                    value={roleKind}
                    onChange={(e) => setRoleKind(e.target.value as PeopleRoleKind)}
                    className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 pr-8"
                  >
                    <option value="owner">Owner</option>
                    <option value="performer">Performer</option>
                    <option value="steward">Steward</option>
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
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
                  placeholder="What this role is responsible for…"
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
                {createMutation.isPending ? "Creating…" : "Create role"}
              </button>
            </div>
          </div>

          {/* Right: placeholder */}
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center px-12">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4"
              style={{ backgroundColor: PEOPLE_LAYER_COLOR }}
            >
              {name ? name.charAt(0).toUpperCase() : "R"}
            </div>
            <p className="text-sm font-medium text-gray-600 mb-1">
              {name || "New Role"}
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              After creating, you can assign this role to teams and link it to products, capabilities, processes, and systems.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
