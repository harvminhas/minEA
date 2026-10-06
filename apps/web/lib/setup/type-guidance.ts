import { exactCatalogTool, normalizeTerm } from "@/lib/setup/match-tools";
import type { AddKind } from "@/lib/setup/add-plan";

export const APP_OR_PLATFORM =
  "Not sure? If people log into it to do their work, it's an Application (e.g. HubSpot, QuickBooks). If apps are built on it or run inside it, it's a Platform (e.g. Azure, Salesforce Platform, VMware).";

export type GuessKind = Extract<AddKind, "app" | "platform" | "server">;

export type TypeGuidance =
  | { mode: "none" }
  | { mode: "suggest"; kind: GuessKind; line: string }
  | { mode: "both"; options: { kind: "app" | "platform"; hint: string }[] };

const PLATFORMS = ["azure", "microsoft azure", "vmware", "salesforce platform", "aws", "amazon web services"];

const TWO_SIDED: { keys: string[]; options: { kind: "app" | "platform"; hint: string }[] }[] = [
  {
    keys: ["salesforce", "sfdc"],
    options: [
      { kind: "app", hint: "People log in to work with customers." },
      { kind: "platform", hint: "Apps are built on Salesforce Platform." },
    ],
  },
  {
    keys: ["microsoft 365", "m365", "office 365"],
    options: [
      { kind: "app", hint: "People log in to Outlook, Teams, and the other apps." },
      { kind: "platform", hint: "Apps run inside Microsoft 365." },
    ],
  },
  {
    keys: ["dynamics 365", "d365", "dynamics"],
    options: [
      { kind: "app", hint: "People log in to run finance, sales, or operations." },
      { kind: "platform", hint: "Apps are built on Dynamics 365." },
    ],
  },
];

function suggestLine(kind: GuessKind): string {
  if (kind === "app") return "We think this is an Application";
  if (kind === "platform") return "We think this is a Platform";
  return "We think this is a Server";
}

/** One typed name. A catalog match preselects a type. Two-sided products offer both. */
export function typeGuidance(text: string): TypeGuidance {
  const parts = text.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 1) return { mode: "none" };
  const key = normalizeTerm(parts[0] ?? "");
  if (!key) return { mode: "none" };
  if (PLATFORMS.includes(key)) return { mode: "suggest", kind: "platform", line: suggestLine("platform") };
  const both = TWO_SIDED.find((item) => item.keys.includes(key));
  if (both) return { mode: "both", options: both.options };
  const tool = exactCatalogTool(parts[0] ?? "");
  if (!tool) return { mode: "none" };
  if (tool.kind === "server") return { mode: "suggest", kind: "server", line: suggestLine("server") };
  if (tool.kind === "platform") return { mode: "suggest", kind: "platform", line: suggestLine("platform") };
  return { mode: "suggest", kind: "app", line: suggestLine("app") };
}

/** Guess only while the add flow is an app or a platform, and only between those two. */
export function nextPreset(current: AddKind, text: string, locked: boolean): AddKind {
  if (locked) return current;
  if (current !== "app" && current !== "platform") return current;
  const guidance = typeGuidance(text);
  if (guidance.mode !== "suggest") return current;
  if (guidance.kind !== "app" && guidance.kind !== "platform") return current;
  return guidance.kind;
}
