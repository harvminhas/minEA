"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BillingStatus } from "@minea/types";
import { toast } from "@/hooks/use-toast";
import { billingApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { billingUiEnabled } from "@/lib/billing/flags";
import { useAppStore } from "@/lib/store";
import { limitLink, limitOffer, objectLimitToastCopy, OBJECT_LIMIT_EVENT, type ObjectLimitDetail } from "@/lib/object-limit";

/**
 * One place for the item-limit 403 on every single-add form (≈30 of them): a toast with the plan
 * line and the upgrade link this person can use. The forms keep showing err.message, which
 * apiFetch already made friendly. The Add cards show their own panel and ask for no toast.
 */
export function ObjectLimitNotice() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { activeOrg } = useAppStore();
  const orgSlug = activeOrg?.slug;

  useEffect(() => {
    const onLimit = async (event: Event) => {
      const detail = (event as CustomEvent<ObjectLimitDetail>).detail;
      if (!detail) return;
      let status: BillingStatus | undefined;
      if (orgSlug) {
        try {
          status = await queryClient.fetchQuery({
            queryKey: ["billing-status", orgSlug],
            queryFn: async () => billingApi.status(orgSlug, (await getToken())!),
            staleTime: 60_000,
          });
        } catch {
          status = undefined;
        }
      }
      const offer = limitOffer(status, billingUiEnabled());
      const link = orgSlug ? limitLink(offer, orgSlug) : null;
      const copy = objectLimitToastCopy(detail, offer);
      toast({
        tag: "object-limit",
        title: copy.title,
        description: copy.description,
        action: link ?? undefined,
        duration: 9000,
      });
    };
    window.addEventListener(OBJECT_LIMIT_EVENT, onLimit);
    return () => window.removeEventListener(OBJECT_LIMIT_EVENT, onLimit);
  }, [orgSlug, queryClient, getToken]);

  return null;
}
