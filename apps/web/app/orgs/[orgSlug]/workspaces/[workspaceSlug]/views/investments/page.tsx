"use client";

import { ViewShell } from "@/components/views/ViewShell";
import { getView } from "@/lib/views";

const view = getView("investments");

export default function InvestmentsViewPage() {
  return <ViewShell view={view} isEmpty onEmptyAction={() => {}} />;
}
