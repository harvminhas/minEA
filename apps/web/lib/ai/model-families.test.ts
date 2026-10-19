import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { relationshipLabelFor, ALLOWED_TRIPLES } from "@minea/types";
import {
  MODEL_ACCESS_PROVIDERS,
  MODEL_FAMILIES,
  aiPlatformProperties,
  customFamilyLabel,
  filterFamilies,
  knownFamily,
  matchingProvider,
  suggestFamily,
} from "./model-families.ts";
import { accessChoices, vendorToFill } from "./model-access.ts";
import { aiLandscape } from "./landscape.ts";
import { aiTableRows } from "./tables.ts";
import { REGISTRY } from "../fields/registry.ts";

const at = "2026-10-01T00:00:00Z";
const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}) =>
  ({ id, type, name, properties, tags: [], status: "active", created_at: at, updated_at: at, workspace_id: "w", org_id: "o" }) as any;
const rel = (id: string, type: string, from: any, to: any) =>
  ({ id, type, from_object_id: from.id, from_type: from.type, to_object_id: to.id, to_type: to.type, attributes: {}, workspace_id: "w", org_id: "o", created_at: at }) as any;

test("one shared list of common model families, each with its vendor", () => {
  assert.deepEqual(
    MODEL_FAMILIES.map((family) => `${family.label}:${family.vendor}`),
    ["GPT:OpenAI", "Claude:Anthropic", "Gemini:Google", "Llama:Meta", "Mistral:Mistral AI", "Grok:xAI", "Command:Cohere", "Phi:Microsoft", "DeepSeek:DeepSeek", "Qwen:Alibaba"]
  );
  assert.equal(knownFamily("gpt")?.vendor, "OpenAI");
  assert.equal(knownFamily("Claude 3"), null);
});

test("the model's name suggests its family", () => {
  for (const [name, family] of [
    ["GPT-4o", "GPT"], ["gpt-4.1-mini", "GPT"], ["o3", "GPT"], ["Claude 3.5 Sonnet", "Claude"], ["claude-opus-4", "Claude"],
    ["Gemini 1.5 Pro", "Gemini"], ["Llama 3.1 70B", "Llama"], ["Mixtral 8x7B", "Mistral"], ["Grok 4", "Grok"],
    ["Command R+", "Command"], ["Phi-3 mini", "Phi"], ["DeepSeek-V3", "DeepSeek"], ["Qwen2.5", "Qwen"],
  ]) {
    assert.equal(suggestFamily(name)?.label, family, name);
  }
  assert.equal(suggestFamily("New AI Model"), null);
  assert.equal(suggestFamily(""), null);
});

test("search filters by family or vendor; anything else offers + Use", () => {
  assert.deepEqual(filterFamilies("goo").map((f) => f.label), ["Gemini"]);
  assert.deepEqual(filterFamilies("").length, MODEL_FAMILIES.length);
  assert.equal(customFamilyLabel("Nova"), "Nova");
  assert.equal(customFamilyLabel("  claude "), null);
  assert.equal(customFamilyLabel(""), null);
});

test("Vendor is filled from the family only when the model has none", () => {
  const gpt = knownFamily("GPT");
  assert.equal(vendorToFill(gpt, false), "OpenAI");
  assert.equal(vendorToFill(gpt, true), null);
  assert.equal(vendorToFill(null, false), null);
});

test("Accessed through lists workspace platforms and apps, then the common providers not already there", () => {
  const model = obj("m", "ai_model", "GPT-4o");
  const azure = obj("az", "cloud_service", "Azure Tenant");
  const bedrock = obj("bd", "cloud_service", "AWS Bedrock");
  const chatgpt = obj("cg", "application", "ChatGPT Enterprise", { vendor: "OpenAI" });
  const agent = obj("ag", "agent", "Support Bot");
  const all = accessChoices([model, azure, bedrock, chatgpt, agent], "m", "");
  assert.deepEqual(all.workspace.map((item) => item.name), ["AWS Bedrock", "Azure Tenant", "ChatGPT Enterprise"]);
  assert.equal(all.workspace[2].sub, "Application · OpenAI");
  assert.deepEqual(all.providers.map((p) => p.name), ["Azure OpenAI", "Google Vertex AI", "OpenAI API", "Anthropic API", "Our own server"]);
  assert.equal(all.addLabel, null);
  const typed = accessChoices([model, azure], "m", "Groq");
  assert.deepEqual([typed.workspace.length, typed.providers.length, typed.addLabel], [0, 0, "Groq"]);
  assert.equal(accessChoices([model], "m", "azure openai").addLabel, null);
  assert.deepEqual(accessChoices([model], "m", "vertex").providers.map((p) => p.name), ["Google Vertex AI"]);
});

test("a common provider reuses a matching record; a new one is an AI platform with its vendor", () => {
  const bedrock = MODEL_ACCESS_PROVIDERS.find((p) => p.name === "Amazon Bedrock")!;
  assert.equal(matchingProvider([obj("x", "cloud_service", "aws-bedrock")], bedrock)?.id, "x");
  assert.equal(matchingProvider([obj("x", "application", "Bedrock")], bedrock), null);
  assert.equal(matchingProvider([obj("x", "application", "Bedrock")], bedrock, ["application"])?.id, "x");
  assert.deepEqual(aiPlatformProperties(bedrock), { platform_type: "ai_platform", hosting_model: "saas", vendor: "Amazon" });
  assert.deepEqual(aiPlatformProperties(MODEL_ACCESS_PROVIDERS.find((p) => p.vendor === null)!), { platform_type: "ai_platform", hosting_model: "self_hosted" });
  assert.deepEqual(aiPlatformProperties(null), { platform_type: "ai_platform", hosting_model: "saas" });
});

test("an AI model can be accessed through an app, worded both ways", () => {
  for (const to of ["cloud_service", "application", "solution", "technical_capability"]) {
    assert.ok(ALLOWED_TRIPLES.some(([t, f, x]) => t === "runs_on" && f === "ai_model" && x === to), to);
    const words = relationshipLabelFor("runs_on", "ai_model", to);
    assert.equal(words.forward, "Accessed through");
    assert.equal(words.reverse, "Provides access to");
  }
  // Apps still can't run on apps.
  assert.equal(ALLOWED_TRIPLES.some(([t, f, x]) => t === "runs_on" && f === "application" && x === "application"), false);
  assert.equal(relationshipLabelFor("runs_on", "application", "cloud_service").forward, "Runs on");
  const def = REGISTRY.ai_model.find((field) => field.key === "runs_on")!;
  assert.deepEqual(def.source.kind === "rel" && def.source.target, ["cloud_service", "application", "solution", "technical_capability"]);
});

test("an app a model is accessed through shows in the AI landscape and the AI models table", () => {
  const model = obj("m", "ai_model", "GPT-4o");
  const chatgpt = obj("cg", "application", "ChatGPT Enterprise", { vendor: "OpenAI" });
  const azure = obj("az", "cloud_service", "Azure OpenAI", { platform_type: "ai_platform", vendor: "Microsoft" });
  const other = obj("x", "application", "Payroll");
  const objects = [model, chatgpt, azure, other];
  const relationships = [rel("r1", "runs_on", model, chatgpt)];
  const result = aiLandscape({ objects, relationships });
  const app = result.platforms.find((item) => item.id === "cg")!;
  assert.equal(app.kindLabel, "Model access");
  assert.equal(app.counted, false);
  assert.deepEqual(app.usedBy.map((item) => item.name), ["GPT-4o"]);
  assert.equal(result.platforms.find((item) => item.id === "az")?.kindLabel, "AI platform");
  assert.equal(result.platforms.some((item) => item.id === "x"), false);
  const row = aiTableRows("ai_model", objects, relationships)[0] as any;
  assert.match(JSON.stringify(row), /ChatGPT Enterprise/);
});

test("the AI model panel uses the family dropdown and the access picker", () => {
  const editors = readFileSync(new URL("../../components/mvp/InfraEditors.tsx", import.meta.url), "utf8");
  assert.match(editors, /editing && def\.key === "model_family"\) \{\s*editor = \(\s*<ModelFamilyPopover/);
  assert.match(editors, /editing && def\.key === "runs_on" && object\.type === "ai_model"\) \{\s*editor = \(\s*<ModelAccessPopover/);
  assert.match(editors, /const vendor = vendorToFill\(family, hasVendor\);/);
  const pickers = readFileSync(new URL("../../components/mvp/ModelFieldPickers.tsx", import.meta.url), "utf8");
  // New platform and its link go in one batch call.
  assert.match(pickers, /creates: \[\{ key: "access", type: "cloud_service", name, properties: aiPlatformProperties\(provider\) \}\],\s*updates: \[\],\s*relationships: \[\{ type: "runs_on", from_id: selfId, from_type: selfType, to_key: "access", to_type: "cloud_service" \}\]/);
});
