/** Owner questions answered locally (owner names + People), lean "Nothing owned by X", AI reason codes. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromRecords } from "./deterministic";
import { matchOwner, ownerSlot, buildFacts } from "./record-filter";
import { localOnly, shouldAskModel } from "./route";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import { requestError } from "@/components/mvp/AskScreen";

const obj = (id: string, name: string, extra: Record<string, unknown>, properties: Record<string, unknown> = {}) => ({ id, type: "application", name, properties, tags: [], ...extra }) as never;
const OBJECTS = [
  obj("pay", "Payroll", { owner_team_name: "Finance", point_of_contact_name: "Christine Wong" }),
  obj("crm", "Salesforce", { owner: "Christine Wong" }),
  obj("wiki", "Confluence", { owner_team_name: "IT Ops" }, { business_owner: "Sam Lee" }),
  obj("ps", "Adobe Photoshop", {}),
];
const ask = (question: string, people: string[] = []) =>
  answerFromRecords({ question, people, rows: OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[], graph: { nodes: [], edges: [] }, basePath: "/w", landscape: { objects: OBJECTS as never, relationships: [] } });

test("owner phrasings find the person", () => {
  assert.equal(ownerSlot("what is owned by Christine?"), "Christine");
  assert.equal(ownerSlot("What does Christine own?"), "Christine");
  assert.equal(ownerSlot("Christine's apps"), "Christine");
  assert.equal(ownerSlot("What Microsoft products do we own?"), null);
  assert.equal(ownerSlot("Which apps do we own?"), null);
});

test("'what is owned by Christine?' lists her items by first name, locally, no AI", () => {
  const a = ask("what is owned by Christine?");
  assert.equal(a.handler, "records");
  assert.deepEqual(a.citations.map((c) => c.row.name).sort(), ["Payroll", "Salesforce"]);
  assert.ok(localOnly(a, "what is owned by Christine?"));
  assert.deepEqual(ask("what does Sam own?").citations.map((c) => c.row.name), ["Confluence"]); // *_owner property
  assert.deepEqual(ask("IT Ops's apps").citations.map((c) => c.row.name), ["Confluence"]);
});

test("nobody by that name: lean 'Nothing owned by X' with nearest names, and no AI call", () => {
  const a = ask("what is owned by Christina?");
  assert.equal(a.lean?.headline, "Nothing owned by Christina");
  assert.match(a.lean!.sub!, /Closest names: Christine Wong/);
  assert.deepEqual(a.lean!.suggest, ["What is owned by Christine Wong?"]);
  assert.equal(shouldAskModel({ mode: "answer", question: "what is owned by Christina?", showingAdd: false, ambiguous: false, hasWorkspace: true, catalogSettled: true, local: a }), false);
  const none = ask("what is owned by Zebulon?");
  assert.match(none.lean!.sub!, /No owner, team or person called Zebulon/);
});

test("someone on the People list who owns nothing is named", () => {
  const a = ask("what does Priya own?", ["Priya Shah"]);
  assert.match(a.lean!.sub!, /Priya Shah is in People but not set as the owner of anything/);
  assert.deepEqual(matchOwner(buildFacts(OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[], OBJECTS as never, []), "Christine").owners, ["Christine Wong"]);
});

test("AI fallback is a lean card with a reason code, and no 'Ask next' box", () => {
  const src = readFileSync("components/mvp/AskScreen.tsx", "utf8");
  assert.match(src, /const fallbackLean/);
  assert.match(src, /!leanCard && answer\.handler !== "clarify" && followUpsFor/);
  assert.match(src, /\[reason: request_failed\]/);
  assert.doesNotMatch(src, /This question needs an AI answer/);
  assert.equal(requestError(Object.assign(new Error("Gateway Timeout"), { status: 504 })), "HTTP 504 Gateway Timeout");
});
