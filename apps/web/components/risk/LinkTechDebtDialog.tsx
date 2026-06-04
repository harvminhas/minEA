"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import type { MinEAObject, TechDebtProperties } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { PickAffectedDialog } from "@/components/risk/PickAffectedDialog";
import { buildTechDebtProperties } from "@/lib/tech-debt-utils";
import { syncTechDebtRelationships } from "@/lib/tech-debt-relationships";

interface Props {
  techDebt: MinEAObject;
  onClose: () => void;
  onLinked: () => void;
}

export function LinkTechDebtDialog({ techDebt, onClose, onLinked }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [error, setError] = useState<string | null>(null);

  const linkMutation = useMutation({
    mutationFn: async (affects: NonNullable<TechDebtProperties["affects"]>) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const props = (techDebt.properties ?? {}) as TechDebtProperties;
      const nextProps = buildTechDebtProperties({
        severity: props.severity ?? "medium",
        debtType: props.debt_type ?? "eol_software",
        debtTypeOther: props.debt_type_other ?? "",
        debtStatus: props.debt_status ?? "open",
        affects,
        identifiedBy: props.identified_by ?? "",
        targetResolution: props.target_resolution ?? "no_target",
        effortEstimate: props.effort_estimate ?? "",
      });
      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        techDebt.id,
        { properties: nextProps as Record<string, unknown> },
        token
      );
      await syncTechDebtRelationships(orgSlug, workspaceSlug, techDebt.id, affects, token);
    },
    onSuccess: () => onLinked(),
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not link tech debt item"),
  });

  return (
    <>
      {error && (
        <p className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[130] rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
          {error}
        </p>
      )}
      <PickAffectedDialog
        selected={null}
        onClose={onClose}
        onApply={(affects) => {
          if (!affects) return;
          linkMutation.mutate(affects);
        }}
      />
    </>
  );
}
