"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { COMPONENT_STATUSES, COMPONENT_TYPES } from "@/lib/component-utils";
import type { MinEAObject, ObjectStatus } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";

const inputClass =
  "w-full min-w-0 rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function ComponentQuickAddRow({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (item: MinEAObject) => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [componentType, setComponentType] = useState("");
  const [techStack, setTechStack] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<(typeof COMPONENT_STATUSES)[number]["value"]>("planned");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Component name is required");

      const properties: Record<string, unknown> = { systems: [] };
      if (componentType) properties.component_type = componentType;
      if (techStack.trim()) properties.tech_stack = techStack.trim();

      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "component",
          name: trimmedName,
          owner: owner.trim() || undefined,
          status: status as ObjectStatus,
          properties,
        },
        token
      );
    },
    onSuccess: (item) => onCreated(item),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not create component");
    },
  });

  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <tr className="border-t border-indigo-100 bg-indigo-50/30">
      <td className="px-4 py-2 min-w-[160px]">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Component name"
          className={inputClass}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSave) saveMutation.mutate();
          }}
        />
      </td>
      <td className="px-4 py-2 min-w-[120px]">
        <select
          value={componentType}
          onChange={(e) => setComponentType(e.target.value)}
          className={cn(inputClass, "pr-7")}
        >
          <option value="">Type</option>
          {COMPONENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 min-w-[120px]">
        <input
          value={techStack}
          onChange={(e) => setTechStack(e.target.value)}
          placeholder="Tech stack"
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2 text-gray-400 text-sm text-center">—</td>
      <td className="px-4 py-2 text-gray-400 text-sm text-center">—</td>
      <td className="px-4 py-2 text-gray-400 text-sm text-center">—</td>
      <td className="px-4 py-2 min-w-[120px]">
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner"
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2 min-w-[110px]">
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as (typeof COMPONENT_STATUSES)[number]["value"])
          }
          className={cn(inputClass, "pr-7")}
        >
          {COMPONENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Esc
          </button>
        </div>
        {error && <p className="text-[10px] text-red-600 mt-1 max-w-[140px]">{error}</p>}
      </td>
    </tr>
  );
}
