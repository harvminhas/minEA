import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerStrategyArtifact, resolveSubject } from "./answerStrategies.ts";
import { answerFromRecords, type AskAnswer } from "./deterministic.ts";
import type { CatalogRow } from "../model-catalog.ts";
import type { ImpactEdge, ImpactNode } from "../impact/relationship-impact.ts";

const artifactPath = new URL("../../../api/app/ai/ask/answer_strategies.json", import.meta.url);

function row(input: {
  id: string;
  name: string;
  typeLabel?: string;
  vendor?: string;
  criticality?: string;
  criticalityLabel?: string;
  ownerTeam?: string;
  missingCriticality?: boolean;
}): CatalogRow {
  const criticality = input.criticality ?? "";
  const missing = {
    owner: !input.ownerTeam,
    vendor: !input.vendor,
    cost: true,
    renewal: true,
    lifecycle: true,
    criticality: input.missingCriticality ?? !criticality,
  };
  return {
    id: input.id,
    object: { id: input.id, name: input.name, type: "application", properties: {} } as CatalogRow["object"],
    kind: "application",
    name: input.name,
    typeLabel: input.typeLabel ?? "Application",
    subtitle: "",
    ownerTeam: input.ownerTeam ?? "",
    ownerPerson: "",
    vendor: input.vendor ?? "",
    vendorKey: "",
    annualCostLabel: "—",
    annualCostNumber: null,
    renewalLabel: "",
    renewalDate: null,
    renewalSoon: false,
    lifecycle: "",
    lifecycleLabel: "",
    criticality,
    criticalityLabel: input.criticalityLabel ?? "",
    costModelLabel: "",
    hostingLabel: "",
    slaLabel: "",
    suggestion: null,
    missing,
    missingCount: Object.values(missing).filter(Boolean).length,
  };
}

const salesforce = row({ id: "sf", name: "SalesForce CRM", vendor: "Salesforce" });
const customerService = row({ id: "cs", name: "Customer Service", typeLabel: "Component" });
const marketing = row({ id: "mkt", name: "Marketing", typeLabel: "Component" });
const salesModule = row({ id: "sm", name: "Sales Module", typeLabel: "Component" });
const my360 = row({ id: "m360", name: "My 360", typeLabel: "Application" });
const campaigns = row({ id: "mc", name: "Marketing Campaigns", typeLabel: "Capability" });

const nodes: ImpactNode[] = [
  { id: "sf", name: "SalesForce CRM", typeLabel: "Application" },
  { id: "cs", name: "Customer Service", typeLabel: "Component" },
  { id: "mkt", name: "Marketing", typeLabel: "Component" },
  { id: "sm", name: "Sales Module", typeLabel: "Component" },
  { id: "m360", name: "My 360", typeLabel: "Application" },
  { id: "mc", name: "Marketing Campaigns", typeLabel: "Capability" },
];

const edges: ImpactEdge[] = [
  { type: "part_of", fromId: "cs", toId: "sf" },
  { type: "part_of", fromId: "mkt", toId: "sf" },
  { type: "part_of", fromId: "sm", toId: "sf" },
  { type: "part_of", fromId: "m360", toId: "sf" },
  { type: "supported_by", fromId: "mc", toId: "sf" },
];

const estate = [salesforce, customerService, marketing, salesModule, my360, campaigns];

function ask(question: string, rows = estate, graphEdges = edges, graphNodes = nodes): AskAnswer {
  return answerFromRecords({ question, rows, graph: { nodes: graphNodes, edges: graphEdges }, basePath: "/orgs/acme/workspaces/default" });
}

function cited(answer: AskAnswer): string[] {
  return (answer.evidence ?? []).flatMap((item) => item.citationIds);
}

test("the strategy artifact matches answerStrategies.ts", () => {
  const onDisk = JSON.parse(readFileSync(artifactPath, "utf8"));
  assert.deepEqual(onDisk, answerStrategyArtifact());
});

test("blank criticality on SalesForce CRM is Likely high", () => {
  const answer = ask("why is Salesforce CRM important?");
  assert.equal(answer.handler, "importance");
  assert.equal(answer.verdict?.text, "Likely high");
  assert.equal(answer.verdict?.inferred, true);
  assert.ok(cited(answer).includes("m360"));
  assert.ok(cited(answer).includes("mc"));
  assert.ok(answer.gaps.some((gap) => /no integrations are recorded/i.test(gap.text) && /understated/i.test(gap.text)));
  assert.equal(answer.fixActions?.[0]?.recordId, "sf");
  assert.equal(answer.fixActions?.[0]?.field, "criticality");
  assert.equal(answer.fixActions?.[0]?.suggestedValue, "high");
});

test("CRM and salesforce resolve to SalesForce CRM", () => {
  assert.equal(ask("How important is CRM?").verdict?.text, "Likely high");
  assert.equal(resolveSubject("salesforce", [salesforce]).matches[0]?.id, "sf");
});

test("two items named My 360 are told apart by type", () => {
  const app = row({ id: "app", name: "My 360", typeLabel: "Application" });
  const component = row({ id: "cmp", name: "My 360", typeLabel: "Component" });
  const answer = ask("What breaks if the My 360 goes down?", [app, component], [], [
    { id: "app", name: "My 360", typeLabel: "Application" },
    { id: "cmp", name: "My 360", typeLabel: "Component" },
  ]);
  assert.equal(answer.handler, "clarify");
  assert.match(answer.answerText, /My 360 \(Application\)/);
  assert.match(answer.answerText, /My 360 \(Component\)/);
  const chosen = answerFromRecords({
    question: "What breaks if the My 360 goes down?",
    rows: [app, component],
    graph: {
      nodes: [
        { id: "app", name: "My 360", typeLabel: "Application" },
        { id: "cmp", name: "My 360", typeLabel: "Component" },
      ],
      edges: [],
    },
    basePath: "/orgs/acme/workspaces/default",
    focusId: "cmp",
  });
  assert.equal(chosen.handler, "impact");
  assert.match(chosen.answerText, /Nothing in your model depends on My 360/);
});

test("two salesforce names ask which one instead of guessing", () => {
  const other = row({ id: "bill", name: "SalesForce Billing", vendor: "Salesforce" });
  const answer = ask("How important is salesforce?", [...estate, other]);
  assert.equal(answer.handler, "clarify");
  assert.match(answer.answerText, /^Did you mean /);
  assert.ok(answer.followUps.some((item) => item.includes("SalesForce CRM")));
  assert.ok(answer.followUps.some((item) => item.includes("SalesForce Billing")));
});

test("stored medium keeps the stored value and does not offer a fix", () => {
  const stored = row({ id: "sf", name: "SalesForce CRM", vendor: "Salesforce", criticality: "medium", criticalityLabel: "Medium", missingCriticality: false });
  const answer = ask("How important is Salesforce CRM?", [stored, customerService, marketing, salesModule, my360, campaigns]);
  assert.equal(answer.verdict?.text, "Medium (set in your model)");
  assert.equal(answer.verdict?.inferred, false);
  assert.match(answer.answerText, /Dependencies suggest it may be higher/);
  assert.equal(answer.fixActions?.length, 0);
});

test("no relationships stays Unknown", () => {
  const alone = row({ id: "alone", name: "Quoting Tool" });
  const answer = ask("How important is Quoting Tool?", [alone], [], [{ id: "alone", name: "Quoting Tool", typeLabel: "Application" }]);
  assert.equal(answer.verdict?.text, "Unknown");
  assert.equal(answer.verdict?.inferred, false);
  assert.equal(answer.fixActions?.length, 0);
  assert.ok(answer.gaps.some((gap) => /no relationships recorded/i.test(gap.text)));
});

test("three indirect-only dependents are Likely medium", () => {
  const source = row({ id: "hub", name: "Hub" });
  const deps = ["a", "b", "c"].map((id) => row({ id, name: id.toUpperCase() }));
  const answer = ask(
    "How important is Hub?",
    [source, ...deps],
    deps.map((item) => ({ type: "supports", fromId: "hub", toId: item.id })),
    [{ id: "hub", name: "Hub", typeLabel: "Application" }, ...deps.map((item) => ({ id: item.id, name: item.name, typeLabel: "Application" }))]
  );
  assert.equal(answer.verdict?.text, "Likely medium");
  assert.equal(answer.verdict?.inferred, true);
});

test("what is most important stays on the criticality list", () => {
  const answer = ask("What is most important?");
  assert.equal(answer.handler, "criticality");
});

test("out of support is the aging intent, end of life stays lifecycle", () => {
  const answer = ask("What's out of support?");
  assert.equal(answer.handler, "aging");
  const retiring = ask("What goes end of life next year?");
  assert.equal(retiring.handler, "lifecycle");
});

test("what has no criticality stays on the list handler", () => {
  const answer = ask("What has no criticality?");
  assert.equal(answer.handler, "gaps");
  assert.match(answer.answerText, /no criticality/i);
  assert.equal(answer.fixActions, undefined);
});

test("a blank owner is inferred from a related item", () => {
  const owned = row({ id: "m360", name: "My 360", ownerTeam: "SF Tech Team", missingCriticality: false });
  const answer = answerFromRecords({
    question: "Who owns SalesForce CRM?",
    rows: [salesforce, owned],
    graph: { nodes, edges },
    basePath: "/orgs/acme/workspaces/default",
  });
  assert.equal(answer.verdict?.text, "Likely SF Tech Team");
  assert.equal(answer.verdict?.inferred, true);
  assert.ok(cited(answer).includes("m360"));
  assert.equal(answer.fixActions?.[0]?.field, "owner");
});
