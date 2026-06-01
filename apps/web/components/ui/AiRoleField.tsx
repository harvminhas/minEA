"use client";

import { AI_ROLES, aiRoleFromProperties } from "@/lib/ai-role-utils";
import type { AiRole } from "@minea/types";

interface AiRoleFieldProps {
  value: AiRole | string | undefined;
  onChange: (value: AiRole) => void;
  /** Match FormField label styling when true (ObjectForm drawer). */
  variant?: "drawer" | "panel";
}

export function AiRoleField({ value, onChange, variant = "panel" }: AiRoleFieldProps) {
  const role = aiRoleFromProperties(value as AiRole | undefined);
  const selected = AI_ROLES.find((r) => r.value === role);

  const labelClass =
    variant === "drawer"
      ? "block text-xs font-medium text-gray-600 mb-1"
      : "block text-xs font-medium text-gray-600 mb-1";

  const selectClass =
    variant === "drawer"
      ? "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      : "w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div>
      <label className={labelClass}>AI role</label>
      <select
        value={role}
        onChange={(e) => onChange(e.target.value as AiRole)}
        className={selectClass}
      >
        {AI_ROLES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-gray-400 mt-1.5">
        How does this relate to AI? {selected?.hint}
      </p>
    </div>
  );
}
