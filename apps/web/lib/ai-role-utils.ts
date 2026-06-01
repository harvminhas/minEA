import type { AiRole } from "@minea/types";

export const AI_ROLES: {
  value: AiRole;
  label: string;
  hint: string;
}[] = [
  { value: "none", label: "None", hint: "Not AI-related (default)" },
  { value: "model", label: "Model", hint: "The AI/ML model itself — e.g. GPT-4, custom fraud classifier" },
  {
    value: "ai_powered",
    label: "AI-powered",
    hint: "Uses AI as a core feature — e.g. support chatbot, smart routing",
  },
  {
    value: "ai_infrastructure",
    label: "AI infrastructure",
    hint: "Supports AI workloads — e.g. vector DB, embedding service, MLOps platform",
  },
  {
    value: "ai_adjacent",
    label: "AI-adjacent",
    hint: "Touches AI without being AI — e.g. data pipeline feeding training, eval framework",
  },
];

export const AI_ROLE_LABEL: Record<AiRole, string> = Object.fromEntries(
  AI_ROLES.map((r) => [r.value, r.label])
) as Record<AiRole, string>;

export const SYSTEM_OBJECT_TYPES = new Set(["application", "solution", "technical_capability"]);

/** Persist only when explicitly set to a non-default role. */
export function aiRoleForProperties(value: string | undefined): AiRole | undefined {
  if (!value || value === "none") return undefined;
  return value as AiRole;
}

export function aiRoleFromProperties(value: AiRole | undefined | null): AiRole {
  return value ?? "none";
}

export function aiRoleLabel(value: AiRole | undefined | null): string {
  return AI_ROLE_LABEL[aiRoleFromProperties(value)];
}
