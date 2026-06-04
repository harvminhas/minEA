"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ViewShell } from "@/components/views/ViewShell";
import { TechDebtView } from "@/components/views/TechDebtView";
import { getView } from "@/lib/views";

const view = getView("tech-debt");

export default function TechDebtViewPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <ViewShell
      view={view}
      subtitle="All open debt items across systems, components, and platforms."
      headerAction={
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add debt item
        </button>
      }
    >
      <TechDebtView createOpen={showCreate} onCreateOpenChange={setShowCreate} />
    </ViewShell>
  );
}
