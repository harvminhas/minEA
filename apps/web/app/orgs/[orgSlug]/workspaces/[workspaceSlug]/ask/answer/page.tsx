"use client";

import { Suspense } from "react";
import { AskScreen } from "@/components/mvp/AskScreen";

export default function AskAnswerPage() {
  return (
    <Suspense fallback={<p className="px-8 py-10 text-[13px] text-[#8b90a0]">Loading…</p>}>
      <AskScreen mode="answer" />
    </Suspense>
  );
}
