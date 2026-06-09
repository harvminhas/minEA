"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { TEAM_CONTACT_EMAIL } from "@/lib/plan-features";
import { usePlanFeatures } from "@/lib/use-plan-features";

interface Props {
  title: string;
  message: string;
  /** Show Team contact CTA instead of generic upgrade copy */
  showTeamContact?: boolean;
}

export function PlanUpgradePanel({ title, message, showTeamContact }: Props) {
  const { isFree, isSolo } = usePlanFeatures();

  return (
    <div className="max-w-lg mx-auto mt-16 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
        <Lock size={20} className="text-indigo-600" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">{message}</p>
      {showTeamContact || isSolo ? (
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">
            <span className="font-medium text-gray-800">Team</span> — custom contributor licenses, unlimited
            viewers.
          </p>
          <Link
            href={`mailto:${TEAM_CONTACT_EMAIL}?subject=BuboMap%20Team%20plan`}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Contact us for Team
          </Link>
        </div>
      ) : isFree ? (
        <p className="text-sm text-gray-600">
          Upgrade to <span className="font-medium">Solo</span> for all views and AI chat, or{" "}
          <span className="font-medium">Team</span> to collaborate.
        </p>
      ) : null}
    </div>
  );
}
