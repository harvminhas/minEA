"use client";

import { useState } from "react";
import {
  emptyOwnership,
  ownershipFromEntity,
  ownershipIsValid,
  ownershipToPayload,
  type OwnershipValue,
} from "@/lib/owner-fields";
import type { OwnershipFields as OwnershipFieldsType } from "@minea/types";

export function useOwnershipForm(
  initial?: Partial<OwnershipFieldsType> & { owner?: string | null } | null
) {
  const [value, setValue] = useState<OwnershipValue>(() => ownershipFromEntity(initial));

  return {
    value,
    setValue,
    isValid: ownershipIsValid(value),
    toPayload: () => ownershipToPayload(value),
    reset: (next?: Partial<OwnershipFieldsType> & { owner?: string | null } | null) =>
      setValue(next ? ownershipFromEntity(next) : emptyOwnership()),
  };
}
