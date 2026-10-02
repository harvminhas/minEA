"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import type { InfraField } from "@/lib/infra/fields";

function stored(object: MinEAObject, key: string): string {
  const value = (object.properties ?? {})[key];
  return typeof value === "string" ? value : "";
}

export function InfraFields({ object, fields }: { object: MinEAObject; fields: InfraField[] }) {
  return (
    <div>
      {fields.map((field) => (
        <InfraControl key={field.key} object={object} field={field} />
      ))}
    </div>
  );
}

export function InfraControl({
  object,
  field,
  compact,
}: {
  object: MinEAObject;
  field: InfraField;
  compact?: boolean;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const current = stored(object, field.key);
  const known = field.options?.some((option) => option.key === current) ?? false;
  const was = field.type === "enum" && current && !known ? current : "";
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(current);

  const save = async (next: string) => {
    setError("");
    const token = await getToken();
    if (!token || !orgSlug || !workspaceSlug) {
      setError("Not signed in");
      return;
    }
    try {
      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        object.id,
        { properties: { [field.key]: next || null } },
        token
      );
      queryClient.invalidateQueries({ queryKey: ["model-catalog", orgSlug, workspaceSlug] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const control =
    field.type === "enum" ? (
      <select
        aria-label={field.label}
        value={known ? current : ""}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => save(event.target.value)}
        className="h-8 max-w-full rounded-lg border border-[#e6e8ee] bg-white px-2 text-[13px]"
      >
        <option value="">Not set</option>
        {(field.options ?? []).map((option) => (
          <option key={option.key} value={option.key}>{option.label}</option>
        ))}
      </select>
    ) : field.type === "date" ? (
      <input
        aria-label={field.label}
        type="date"
        defaultValue={current}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => save(event.target.value)}
        className="h-8 rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
      />
    ) : (
      <input
        aria-label={field.label}
        value={draft}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== current) save(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save(draft);
          }
        }}
        className="h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
      />
    );

  if (compact) {
    return (
      <span onClick={(event) => event.stopPropagation()}>
        {control}
        {error && <span className="mt-1 block text-[11px] text-[#b42318]">{error}</span>}
      </span>
    );
  }

  return (
    <div className="py-1.5" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[#8b90a0]">{field.label}</span>
        {control}
      </div>
      {was && <p className="mt-1 text-right text-[12px] text-[#8b90a0]">Was: {was}</p>}
      {error && <p className="mt-1 text-right text-[12px] text-[#b42318]">{error}</p>}
    </div>
  );
}
