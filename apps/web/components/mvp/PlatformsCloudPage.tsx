"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PlatformsTable } from "@/components/mvp/InfraTables";
import { LocationsTable } from "@/components/mvp/LocationsTable";
import { useTenancy } from "@/lib/tenancy";
import { platformsPath } from "@/lib/model-legacy-paths";
import type { CatalogRow } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";

export function PlatformsCloudPage({
  rows,
  selectedId,
  anywhere,
  initialTab,
}: {
  rows: CatalogRow[];
  selectedId?: string;
  anywhere?: boolean;
  initialTab?: "platforms" | "locations";
}) {
  const { basePath } = useTenancy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") === "locations" || initialTab === "locations") ? "locations" : "platforms";
  const setTab = (next: "platforms" | "locations") => router.replace(platformsPath(basePath, next));

  return (
    <div data-testid="platforms-cloud-page">
      <div className="flex gap-5 border-b border-[#e6e8ee] px-6 pt-5 text-[13px]">
        <button
          type="button"
          onClick={() => setTab("platforms")}
          className={cn(
            "mb-[-1px] border-b-2 pb-2 font-medium",
            tab === "platforms" ? "border-[#5b4ce6] text-[#1c2230]" : "border-transparent text-[#8b90a0]",
          )}
        >
          Platforms
        </button>
        <button
          type="button"
          onClick={() => setTab("locations")}
          className={cn(
            "mb-[-1px] border-b-2 pb-2 font-medium",
            tab === "locations" ? "border-[#5b4ce6] text-[#1c2230]" : "border-transparent text-[#8b90a0]",
          )}
        >
          Locations
        </button>
      </div>
      {tab === "platforms" ? (
        <PlatformsTable rows={rows} selectedId={selectedId} anywhere={anywhere} />
      ) : (
        <LocationsTable anywhere={anywhere} selectedId={selectedId} />
      )}
    </div>
  );
}
