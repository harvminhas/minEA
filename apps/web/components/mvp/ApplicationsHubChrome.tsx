"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AiTable } from "@/components/mvp/AiTables";
import { useTenancy } from "@/lib/tenancy";
import { applicationsPath } from "@/lib/model-legacy-paths";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { cn } from "@/lib/utils";
import type { AiTableType } from "@/lib/ai/tables";

export function ApplicationsTabs({
  applicationsCount,
  active,
}: {
  applicationsCount: number;
  active: "applications" | "ai";
}) {
  const { basePath } = useTenancy();
  const router = useRouter();
  const catalog = useModelCatalog();
  const objects = catalog.data?.objects ?? [];
  const aiCount = objects.filter((object) => object.type === "agent" || object.type === "ai_model").length;
  return (
    <nav className="mb-4 flex gap-5 border-b border-[#e6e8ee] text-[13px]" aria-label="Applications">
      <button
        type="button"
        data-testid="applications-tab-apps"
        onClick={() => router.replace(applicationsPath(basePath))}
        className={cn(
          "mb-[-1px] border-b-2 pb-2 font-medium",
          active === "applications" ? "border-[#5b4ce6] text-[#1c2230]" : "border-transparent text-[#8b90a0]",
        )}
      >
        Applications ({applicationsCount})
      </button>
      <button
        type="button"
        data-testid="applications-tab-ai"
        onClick={() => router.replace(applicationsPath(basePath, { tab: "ai" }))}
        className={cn(
          "mb-[-1px] border-b-2 pb-2 font-medium",
          active === "ai" ? "border-[#5b4ce6] text-[#1c2230]" : "border-transparent text-[#8b90a0]",
        )}
      >
        AI ({aiCount})
      </button>
    </nav>
  );
}

export function ApplicationsAiPanel({ selectedId }: { selectedId?: string }) {
  const { basePath } = useTenancy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const catalog = useModelCatalog();
  const objects = catalog.data?.objects ?? [];
  const agents = objects.filter((object) => object.type === "agent").length;
  const models = objects.filter((object) => object.type === "ai_model").length;
  const filter = searchParams.get("ai") === "models" ? "ai_model" : searchParams.get("ai") === "agents" ? "agent" : "all";
  const setFilter = (next: "all" | "agents" | "models") =>
    router.replace(applicationsPath(basePath, { tab: "ai", aiType: next === "all" ? undefined : next }));
  const selectedType: AiTableType | undefined = selectedId
    ? objects.find((object) => object.id === selectedId)?.type === "ai_model"
      ? "ai_model"
      : objects.find((object) => object.id === selectedId)?.type === "agent"
        ? "agent"
        : undefined
    : undefined;
  const showAgents = filter === "all" || filter === "agent" || selectedType === "agent";
  const showModels = filter === "all" || filter === "ai_model" || selectedType === "ai_model";

  return (
    <div data-testid="applications-ai-panel">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Pill label={`All ${agents + models}`} on={filter === "all" && !selectedType} onClick={() => setFilter("all")} />
        <Pill label={`AI agents ${agents}`} on={filter === "agent" || selectedType === "agent"} onClick={() => setFilter("agents")} />
        <Pill label={`AI models ${models}`} on={filter === "ai_model" || selectedType === "ai_model"} onClick={() => setFilter("models")} />
      </div>
      {showAgents && <AiTable type="agent" selectedId={selectedId} hideHeader={filter === "all"} />}
      {showModels && <AiTable type="ai_model" selectedId={selectedId} hideHeader={filter === "all"} />}
    </div>
  );
}

function Pill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[12px]",
        on ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]",
      )}
    >
      {label}
    </button>
  );
}
