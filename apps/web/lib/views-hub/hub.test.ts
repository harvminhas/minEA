import test from "node:test";
import assert from "node:assert/strict";
import { viewsHub, attentionCount } from "./hub.ts";
import { legacyImpactRedirect } from "./routes.ts";
import { hubFixture, emptyFixture } from "./fixture.ts";
import { rowFromObject, catalogStats, type CatalogRow } from "../model-catalog.ts";
import { hostingMap, singlePoints } from "../reports/home.ts";
import { aiLandscape } from "../ai/landscape.ts";
import { isEstateViewsPath } from "../views.ts";
import { activeTopNavTab } from "../org-access.ts";
import { orgShellFor } from "../app-shell.ts";

function build(f: ReturnType<typeof hubFixture>) {
  const rows = f.objects.map((o) => rowFromObject(o as never)).filter(Boolean) as CatalogRow[];
  const edges = f.relationships.map((r) => ({ type: r.type, fromId: r.from_object_id, toId: r.to_object_id }));
  return { rows, edges, objects: f.objects as never, relationships: f.relationships as never };
}
const card = (cards: ReturnType<typeof viewsHub>, id: string) => cards.find((c) => c.id === id)!;

test("every hub count equals what its report shows", () => {
  const input = build(hubFixture());
  const cards = viewsHub(input);
  const ai = aiLandscape({ objects: input.objects, relationships: input.relationships });
  assert.ok(ai.flags.length > 0);
  assert.equal(card(cards, "ai").big, String(ai.flags.length));
  assert.equal(card(cards, "ai").pill, `${ai.highFlags} high`);
  const flagSum = (card(cards, "ai") as any).preview.flags.reduce((s: number, f: { count: number }) => s + f.count, 0);
  assert.equal(flagSum, ai.flags.length);
  const spof = singlePoints(input.rows, input.edges);
  assert.ok(spof.length >= 2);
  assert.equal(card(cards, "spof").big, String(spof.length));
  assert.equal(card(cards, "owners").big, String(catalogStats(input.rows).noOwner.length));
  const map = hostingMap(input.rows, input.edges);
  assert.equal(card(cards, "hosting").pill, `${map.unlinked} unknown`);
  const apps = input.rows.filter((r) => r.kind === "application").length;
  assert.ok(apps >= 40);
  assert.equal(card(cards, "hosting").big, String(apps - map.unlinked));
  const split = (card(cards, "hosting") as any).preview;
  assert.equal(split.cloud + split.servers + split.desktop + split.unknown, apps);
  assert.equal(card(cards, "renewals").big, String(input.rows.filter((r) => r.renewalSoon).length));
  assert.equal(card(cards, "renewals").open.kind === "report" && card(cards, "renewals").open.reportId, "renewals");
});

test("attention cards come first: red, then amber, then the rest", () => {
  const cards = viewsHub(build(hubFixture()));
  const rank = { red: 0, amber: 1, ok: 2, empty: 3 } as const;
  const tones = cards.map((c) => rank[c.tone]);
  assert.deepEqual(tones, [...tones].sort((a, b) => a - b));
  assert.equal(cards[0]!.tone, "red");
  assert.ok(attentionCount(cards) >= 3);
});

test("a new workspace gets empty states, not zeros dressed as alerts", () => {
  const cards = viewsHub(build(emptyFixture()));
  assert.equal(attentionCount(cards), 0);
  assert.equal(card(cards, "ai").line, "No AI agents yet. Add one, or check your apps for built-in AI like Copilot.");
  assert.deepEqual(card(cards, "ai").open, { kind: "model", section: "agents", label: "Add an AI agent" });
  assert.equal(card(cards, "renewals").big, "No dates yet");
  assert.ok(cards.every((c) => c.tone === "empty"));
});

test("Open goes to the existing report or route", () => {
  const cards = viewsHub(build(hubFixture()));
  const opens = Object.fromEntries(cards.map((c) => [c.id, c.open.kind === "report" ? c.open.reportId : c.open.kind]));
  assert.deepEqual(opens, { ai: "ai-landscape", spof: "single-points", owners: "ownership-gaps", hosting: "hosting", impact: "impact", renewals: "renewals" });
});

test("old /views impact links redirect to /views/impact with their params", () => {
  const p = (q: string) => new URLSearchParams(q);
  assert.equal(legacyImpactRedirect("/b", p("tab=impact&sel=as400")), "/b/views/impact?tab=impact&sel=as400");
  assert.equal(legacyImpactRedirect("/b", p("ready=1")), "/b/views/impact?ready=1");
  assert.equal(legacyImpactRedirect("/b", p("tab=hosting")), "/b/views/impact?tab=hosting");
  assert.equal(legacyImpactRedirect("/b", p("")), null);
});

test("Views highlights on the hub and sub-routes; legacy view pages keep their shell", () => {
  const ws = "/orgs/o/workspaces/w";
  for (const path of [`${ws}/views`, `${ws}/views/impact`, `${ws}/views/tech-debt`]) assert.equal(activeTopNavTab(path), "views", path);
  assert.ok(isEstateViewsPath(`${ws}/views`) && isEstateViewsPath(`${ws}/views/impact`));
  assert.equal(orgShellFor(`${ws}/views/impact`, "views"), "mvp");
  assert.equal(orgShellFor(`${ws}/views/tech-debt`, "views"), "legacy");
  assert.equal(isEstateViewsPath(`${ws}/views/tech-debt`), false);
});
