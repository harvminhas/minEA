"use client";

import { ViewShell } from "@/components/views/ViewShell";
import { getView } from "@/lib/views";

const view = getView("journeys");

export default function JourneysViewPage() {
  return <ViewShell view={view} isEmpty onEmptyAction={() => {}} />;
}
