"use client";

import { use } from "react";
import { RoadmapDetailPage } from "@/components/strategy/RoadmapDetailPage";

export default function RoadmapDetailRoutePage({
  params,
}: {
  params: Promise<{ roadmapId: string }>;
}) {
  const { roadmapId } = use(params);
  return <RoadmapDetailPage roadmapId={roadmapId} />;
}
