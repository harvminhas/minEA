"use client";

import type { AddResultItem } from "@/components/add/AddResult";
import type { PlanInput } from "@/lib/setup/add-plan";
import type { EstateItem } from "@/lib/setup/add-plan";

export function planToResultItems(
  rows: PlanInput[],
  typedTexts: Map<string, string>
): { items: AddResultItem[]; texts: Map<string, string> } {
  const items: AddResultItem[] = rows.map((row) => {
    const isExisting = Boolean(row.existing);
    const needsHosting =
      !isExisting &&
      (row.kind === "app" || row.kind === "platform") &&
      row.choice !== "saas" &&
      (row.status === "matched" ? row.tool?.hosting !== "saas" : true);

    return {
      key: row.key,
      name: row.name,
      isExisting,
      typeLabel: row.kind === "app" ? "Application" : row.kind === "platform" ? "Platform" : row.kind,
      kind: row.kind,
      vendor: row.existing?.vendor || row.tool?.vendor || "",
      category: row.existing?.category || row.tool?.category || "",
      owner: row.existing?.owner,
      cost: row.existing?.cost,
      renewal: row.existing?.renewal,
      dependsOnIt: undefined, // TODO: compute from relationships
      firstGap: row.existing && !row.existing.owner ? { field: "owner", message: "No owner" } : null,
      catalogLogo: null, // TODO: add logo support to catalog
      brandColor: null,
      typicalCost: row.tool?.typicalAnnual || undefined,
      isSaas: row.choice === "saas" || row.tool?.hosting === "saas",
      hostingChoice: row.choice,
      serverName: row.serverName,
      needsHostingQuestion: needsHosting,
      isFuzzy: row.status === "weak",
      fuzzySuggestion: row.status === "weak" ? row.tool?.name : undefined,
    };
  });

  return { items, texts: typedTexts };
}

export function resultItemsToRows(items: AddResultItem[], originalRows: PlanInput[]): PlanInput[] {
  const byKey = new Map(originalRows.map((row) => [row.key, row]));
  return items
    .map((item) => byKey.get(item.key))
    .filter((row): row is PlanInput => Boolean(row));
}
