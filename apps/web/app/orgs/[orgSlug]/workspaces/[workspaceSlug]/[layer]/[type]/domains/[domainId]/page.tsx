"use client";

import { use } from "react";
import { DomainDetailPage } from "@/components/capability-map/DomainDetailPage";

export default function DomainDetailRoutePage({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = use(params);
  return <DomainDetailPage domainId={domainId} />;
}
