"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { showReportsSidebar } from "@/lib/views-hub/routes";
import { CatalogRefreshBar } from "@/components/mvp/CatalogRefreshBar";
import { ModelSidebar } from "@/components/mvp/ModelSidebar";
import { ReportsSidebar } from "@/components/mvp/ReportsSidebar";
import { isModelSection, type ModelSection } from "@/lib/mvp-paths";
import { isEstateViewsPath } from "@/lib/views";

export function MvpFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ask = /\/ask(\/|$)/.test(pathname);
  const reports = /\/reports(\/|$)/.test(pathname);
  const modelMatch = pathname.match(/\/model\/([^/]+)/);
  const section = modelMatch && isModelSection(modelMatch[1]) ? (modelMatch[1] as ModelSection) : undefined;
  const showModel = !ask && !reports && !isEstateViewsPath(pathname);

  if (isEstateViewsPath(pathname)) {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        <CatalogRefreshBar />
        {children}
      </main>
    );
  }

  if (reports) {
    return (
      <Suspense fallback={<ReportsFrame fromViews={false}>{children}</ReportsFrame>}>
        <ReportsFrameFromParams>{children}</ReportsFrameFromParams>
      </Suspense>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      {showModel && <ModelSidebar active={section} />}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">
        <CatalogRefreshBar />
        {children}
      </main>
    </div>
  );
}

function ReportsFrameFromParams({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return <ReportsFrame fromViews={!showReportsSidebar(pathname, params)}>{children}</ReportsFrame>;
}

/** Reports keep their sidebar; opened from a Views hub card (?from=views) they go full width, capped. */
function ReportsFrame({ fromViews, children }: { fromViews: boolean; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-1">
      {!fromViews && <ReportsSidebar />}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white" data-reports-frame={fromViews ? "full" : "sidebar"}>
        <CatalogRefreshBar />
        {fromViews ? <div className="mx-auto w-full max-w-[1180px]">{children}</div> : children}
      </main>
    </div>
  );
}
