"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { MinEAObject } from "@minea/types";
import { peopleApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { accountabilityEntityKindOf, accountabilityWords } from "@/lib/people-utils";
import { useTenancy } from "@/lib/tenancy";

/**
 * Accountabilities read from the entity's side: "Approved by Finance", "Stewarded by Data team".
 * The owner team already shows in the Owned by field, so its row is left out here.
 */
export function EntityAccountabilities({ object }: { object: Pick<MinEAObject, "id" | "type"> }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const entityKind = accountabilityEntityKindOf(object.type);
  const query = useQuery({
    queryKey: ["entity-accountabilities", orgSlug, workspaceSlug, entityKind, object.id],
    enabled: Boolean(entityKind && orgSlug && workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug || !entityKind) return { items: [] };
      return peopleApi.listEntityAccountabilities(orgSlug, workspaceSlug, entityKind, object.id, token);
    },
  });
  const items = (query.data?.items ?? []).filter((item) => !item.is_owner);
  if (!entityKind || items.length === 0) return null;
  return (
    <section data-testid="entity-accountabilities">
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">TEAMS AND ROLES</h3>
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 py-1.5 text-[13px]">
          <span className="text-[#8b90a0]">{accountabilityWords(item, "entity")}</span>
          <Link
            href={`${basePath}/people/${item.subject_type === "role" ? "roles" : "teams"}`}
            className="font-medium text-[#1c2230] hover:text-[#3f35b5]"
          >
            {item.subject_name}
          </Link>
        </div>
      ))}
    </section>
  );
}
