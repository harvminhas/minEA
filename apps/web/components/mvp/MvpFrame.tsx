"use client";

import { usePathname } from "next/navigation";
import { ModelSidebar } from "@/components/mvp/ModelSidebar";
import { ReportsSidebar } from "@/components/mvp/ReportsSidebar";
import { isModelSection, type ModelSection } from "@/lib/mvp-paths";

export function MvpFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ask = /\/ask(\/|$)/.test(pathname);
  const reports = /\/reports(\/|$)/.test(pathname);
  const modelMatch = pathname.match(/\/model\/([^/]+)/);
  const section = modelMatch && isModelSection(modelMatch[1]) ? (modelMatch[1] as ModelSection) : undefined;
  const showModel = !ask && !reports;

  return (
    <div className="flex h-full min-w-0 flex-1">
      {reports && <ReportsSidebar />}
      {showModel && <ModelSidebar active={section} />}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
