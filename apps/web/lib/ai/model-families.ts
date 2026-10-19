/**
 * Common AI model families and the usual ways a company reaches a model. One shared list for the
 * AI model record's Model family dropdown (with its name-based suggestion and vendor fill) and the
 * Accessed through picker's "Common ways to reach a model".
 */

export type ModelFamily = { label: string; vendor: string; pattern: RegExp };

export const MODEL_FAMILIES: readonly ModelFamily[] = [
  { label: "GPT", vendor: "OpenAI", pattern: /\b(gpt|chatgpt|davinci)|\bo[134](-mini|-pro)?\b/i },
  { label: "Claude", vendor: "Anthropic", pattern: /\b(claude|opus|sonnet|haiku)/i },
  { label: "Gemini", vendor: "Google", pattern: /\b(gemini|gemma|palm|bard)/i },
  { label: "Llama", vendor: "Meta", pattern: /\b(llama|code ?llama)/i },
  { label: "Mistral", vendor: "Mistral AI", pattern: /\b(mistral|mixtral|codestral|pixtral)/i },
  { label: "Grok", vendor: "xAI", pattern: /\bgrok/i },
  { label: "Command", vendor: "Cohere", pattern: /\b(command(-r)?|cohere)\b/i },
  { label: "Phi", vendor: "Microsoft", pattern: /\bphi-?\d/i },
  { label: "DeepSeek", vendor: "DeepSeek", pattern: /\bdeepseek/i },
  { label: "Qwen", vendor: "Alibaba", pattern: /\bqwen/i },
];

const fold = (value: string) => value.trim().toLowerCase();

/** A stored family that is one of the list (case-insensitive), so its vendor is known. */
export function knownFamily(value: string | null | undefined): ModelFamily | null {
  const key = fold(value ?? "");
  return key ? MODEL_FAMILIES.find((family) => fold(family.label) === key) ?? null : null;
}

/** The family a model's name gives away ("GPT-4o" → GPT), if any. */
export function suggestFamily(modelName: string | null | undefined): ModelFamily | null {
  const name = (modelName ?? "").trim();
  if (!name) return null;
  return MODEL_FAMILIES.find((family) => family.pattern.test(name)) ?? null;
}

/** Families matching what's typed in the dropdown's search box (label or vendor). */
export function filterFamilies(query: string): ModelFamily[] {
  const needle = fold(query);
  if (!needle) return [...MODEL_FAMILIES];
  return MODEL_FAMILIES.filter((family) => fold(family.label).includes(needle) || fold(family.vendor).includes(needle));
}

/** "+ Use 'X'" for a typed family that isn't in the list (exact match picks the listed one instead). */
export function customFamilyLabel(query: string): string | null {
  const typed = query.trim();
  if (!typed || knownFamily(typed)) return null;
  return typed;
}

export type ModelAccessProvider = {
  name: string;
  vendor: string | null;
  hosting: "saas" | "self_hosted";
  aliases: readonly string[];
};

export const MODEL_ACCESS_PROVIDERS: readonly ModelAccessProvider[] = [
  { name: "Azure OpenAI", vendor: "Microsoft", hosting: "saas", aliases: ["azure openai", "azure openai service", "azure ai foundry", "azure ai"] },
  { name: "Amazon Bedrock", vendor: "Amazon", hosting: "saas", aliases: ["amazon bedrock", "aws bedrock", "bedrock"] },
  { name: "Google Vertex AI", vendor: "Google", hosting: "saas", aliases: ["google vertex ai", "vertex ai", "vertex", "gcp vertex ai"] },
  { name: "OpenAI API", vendor: "OpenAI", hosting: "saas", aliases: ["openai api", "openai platform", "openai"] },
  { name: "Anthropic API", vendor: "Anthropic", hosting: "saas", aliases: ["anthropic api", "anthropic", "claude api"] },
  { name: "Our own server", vendor: null, hosting: "self_hosted", aliases: ["our own server", "self-hosted", "self hosted", "on our server"] },
];

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** An existing record that already is this provider, by name or a usual alias. */
export function matchingProvider<T extends { name: string; type: string }>(
  objects: readonly T[],
  provider: ModelAccessProvider,
  types: readonly string[] = ["cloud_service"]
): T | null {
  const names = new Set([provider.name, ...provider.aliases].map(squash));
  return objects.find((item) => types.includes(item.type) && names.has(squash(item.name))) ?? null;
}

/** Properties for a platform created from the Accessed through picker: an AI platform, with its vendor. */
export function aiPlatformProperties(provider: Pick<ModelAccessProvider, "vendor" | "hosting"> | null): Record<string, unknown> {
  const properties: Record<string, unknown> = { platform_type: "ai_platform", hosting_model: provider?.hosting ?? "saas" };
  if (provider?.vendor) properties.vendor = provider.vendor;
  return properties;
}

/** Record types an AI model can be accessed through: platforms and apps (e.g. ChatGPT Enterprise). */
export const MODEL_ACCESS_TARGETS = ["cloud_service", "application", "solution", "technical_capability"] as const;
