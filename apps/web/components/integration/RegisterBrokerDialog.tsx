"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { EVENT_BROKER_TRANSPORTS } from "@/lib/event-utils";

interface Props {
  defaultTransport?: string;
  onClose: () => void;
  onCreated: (brokerId: string) => void;
}

export function RegisterBrokerDialog({ defaultTransport, onClose, onCreated }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [transport, setTransport] = useState(defaultTransport ?? "kafka");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");

      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "message_broker",
          name: trimmed,
          status: "active",
          properties: { transport },
        },
        token
      );
    },
    onSuccess: (broker) => {
      queryClient.invalidateQueries({
        queryKey: ["objects", orgSlug, workspaceSlug, "message_broker"],
      });
      onCreated(broker.id);
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not register broker"),
  });

  return createPortal(
    <>
      <div className="fixed inset-0 z-[220] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[230] w-full max-w-sm bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Register broker</h3>
            <p className="text-xs text-gray-400 mt-0.5">Add a workspace message broker instance</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kafka (events-prod)"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Transport</label>
            <select
              value={transport}
              onChange={(e) => setTransport(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {EVENT_BROKER_TRANSPORTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40"
          >
            {createMutation.isPending ? "Registering…" : "Register"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
