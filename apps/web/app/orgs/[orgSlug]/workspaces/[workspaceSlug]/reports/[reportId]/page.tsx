"use client";

import { useParams } from "next/navigation";
import { ReportDetailScreen } from "@/components/mvp/ReportDetailScreen";

export default function ReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  return <ReportDetailScreen reportId={reportId} />;
}
