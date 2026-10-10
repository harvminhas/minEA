"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { businessGetStartedHref } from "@/lib/billing/business-request";
import { usePlanFeatures } from "@/lib/use-plan-features";
import { billingUiEnabled } from "@/lib/billing/flags";
import { adminTabHref } from "@/lib/billing/admin-centre";
import { CATALOG, formatUsd } from "@/lib/billing/plans";
import { useAppStore } from "@/lib/store";

interface Props {
  title: string;
  message: string;
  /** Show Business contact CTA */
  showBusinessContact?: boolean;
}

export function PlanUpgradePanel({ title, message, showBusinessContact }: Props) {
  const { isFree } = usePlanFeatures();
  const { activeOrg } = useAppStore();
  const billingUi = billingUiEnabled();

  return (
    <div className="max-w-lg mx-auto mt-16 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
        <Lock size={20} className="text-indigo-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">{message}</p>
      {(showBusinessContact || isFree) && billingUi && activeOrg && (
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">
            Paid plans start at <span className="font-medium text-gray-800">
              {formatUsd(CATALOG.starter.monthlyUsd)}/month
            </span>, with
            unlimited workspaces and AI chat. Viewers are always free.
          </p>
          <Link
            href={adminTabHref(activeOrg.slug, "billing")}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            See plans
          </Link>
        </div>
      )}
      {(showBusinessContact || isFree) && !billingUi && (
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">
            <span className="font-medium text-gray-800">Business</span>: unlimited workspaces, AI
            chat and 4 hours of onboarding, starting from 5 licences.
          </p>
          <Link
            href={businessGetStartedHref({ org: activeOrg?.slug, from: "upgrade_panel" })}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      )}
    </div>
  );
}
