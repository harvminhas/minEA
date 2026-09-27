"use client";

import { useParams } from "next/navigation";
import { ModelScreen } from "@/components/mvp/ModelScreen";
import { isModelSection } from "@/lib/mvp-paths";

export default function ModelItemPage() {
  const { section, id } = useParams<{ section: string; id: string }>();
  if (!isModelSection(section)) {
    return <p className="px-8 py-10 text-[13px] text-[#6b7289]">That section is not in the model.</p>;
  }
  return <ModelScreen section={section} selectedId={id} />;
}
