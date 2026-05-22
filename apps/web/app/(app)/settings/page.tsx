"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { workspacesApi } from "@/lib/api-client";
import { Check } from "lucide-react";
import type { Workspace } from "@minea/types";

export default function SettingsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { activeWorkspace, setActiveWorkspace } = useAppStore();
  const [newWsName, setNewWsName] = useState("");

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.list(token!);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return workspacesApi.create({ name: newWsName }, token!);
    },
    onSuccess: (ws) => {
      setNewWsName("");
      setActiveWorkspace(ws);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Workspace selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Workspaces</h2>

        <div className="space-y-2 mb-4">
          {(workspaces ?? []).map((ws: Workspace) => (
            <button
              key={ws.id}
              onClick={() => setActiveWorkspace(ws)}
              className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors text-left"
            >
              <div>
                <p className="font-medium text-gray-900 text-sm">{ws.name}</p>
                <p className="text-xs text-gray-400">
                  {ws.biz_layer_term} · {ws.constraint_mode} mode
                </p>
              </div>
              {activeWorkspace?.id === ws.id && (
                <Check size={16} className="text-indigo-600" />
              )}
            </button>
          ))}
        </div>

        {/* Create new workspace */}
        <div className="flex gap-2 pt-4 border-t border-gray-100">
          <input
            value={newWsName}
            onChange={(e) => setNewWsName(e.target.value)}
            placeholder="New workspace name..."
            className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => createMutation.mutate()}
            disabled={!newWsName.trim() || createMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>

      {/* Workspace settings */}
      {activeWorkspace && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Active Workspace: {activeWorkspace.name}</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span className="text-gray-400">Business layer term</span>
              <span>{activeWorkspace.biz_layer_term}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Application layer term</span>
              <span>{activeWorkspace.app_layer_term}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Constraint mode</span>
              <span className="capitalize">{activeWorkspace.constraint_mode}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
