"use client";

import { RoadmapDetailContent } from "@/components/strategy/RoadmapDetailContent";

interface Props {
  roadmapId: string;
}

export function RoadmapDetailPage({ roadmapId }: Props) {
  return <RoadmapDetailContent roadmapId={roadmapId} layout="page" />;
}
