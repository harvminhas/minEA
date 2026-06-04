"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { useParams } from "next/navigation";

const VIEW_PAGES: Record<string, React.ComponentType> = {
  "views/products": dynamic(() => import("../../views/products/page")),
  "views/journeys": dynamic(() => import("../../views/journeys/page")),
  "views/processes": dynamic(() => import("../../views/processes/page")),
  "views/capability-heatmap": dynamic(() => import("../../views/capability-heatmap/page")),
  "views/investments": dynamic(() => import("../../views/investments/page")),
  "views/tech-debt": dynamic(() => import("../../views/tech-debt/page")),
};

export default function EmbedViewPage() {
  const params = useParams<{ segments: string[] }>();
  const path = params.segments.join("/");
  const ViewPage = VIEW_PAGES[path];

  if (!ViewPage) notFound();

  return <ViewPage />;
}
