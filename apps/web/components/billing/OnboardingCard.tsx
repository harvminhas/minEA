"use client";

import { CalendarClock, ExternalLink } from "lucide-react";
import { onboardingBookingUrl } from "@/lib/billing/plans";

/** Team and Business: 4 onboarding hours. Link from NEXT_PUBLIC_ONBOARDING_BOOKING_URL. */
export function OnboardingCard({ hours, planLabel }: { hours: number; planLabel: string }) {
  const url = onboardingBookingUrl();
  return (
    <div
      data-testid="onboarding-card"
      className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4 flex items-start gap-3"
    >
      <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
        <CalendarClock size={16} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{hours} onboarding hours included</p>
        <p className="text-xs text-gray-600 mt-0.5">
          Your {planLabel} plan includes {hours} hours with the BuboMap team to set up your map,
          import your apps and get your reports running.
        </p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Book your onboarding hours
            <ExternalLink size={13} />
          </a>
        ) : (
          <p className="mt-3 text-sm font-medium text-gray-500">Booking link coming soon</p>
        )}
      </div>
    </div>
  );
}
