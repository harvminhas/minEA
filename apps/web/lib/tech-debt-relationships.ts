import { relationshipsApi } from "@/lib/api-client";
import { TECH_DEBT_RELATIONSHIP_TARGETS } from "@/lib/object-tech-debt";
import type { ObjectType, TechDebtAffectsRef } from "@minea/types";

export async function syncTechDebtRelationships(
  orgSlug: string,
  workspaceSlug: string,
  techDebtId: string,
  affects: TechDebtAffectsRef | null,
  token: string
) {
  const existing = await relationshipsApi.list(
    orgSlug,
    workspaceSlug,
    { from_object_id: techDebtId },
    token
  );

  for (const rel of existing) {
    if (rel.from_type === "tech_debt" && rel.type === "affects") {
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    }
  }

  if (affects && TECH_DEBT_RELATIONSHIP_TARGETS.has(affects.object_kind)) {
    await relationshipsApi.create(
      orgSlug,
      workspaceSlug,
      {
        type: "affects",
        from_object_id: techDebtId,
        from_type: "tech_debt",
        to_object_id: affects.object_id,
        to_type: affects.object_kind as ObjectType,
      },
      token
    );
  }
}
