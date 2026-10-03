"use client";

import { AddFlow } from "@/components/add/AddFlow";

export { SetupCard } from "@/components/mvp/setup-flow";

export function FirstRunAsk({ inline = false }: { inline?: boolean }) {
  return <AddFlow origin="setup" inline={inline} />;
}
