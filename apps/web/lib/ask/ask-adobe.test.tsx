/** Ask: "do we use Adobe?" with no vendor property (catalogue vendor + name word), and no old generic text. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answerFromRecords } from "./deterministic";
import { yesNoSlot } from "./record-filter";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import { aiFallbackNote } from "@/components/mvp/AskScreen";

const obj = (id: string, name: string, properties: Record<string, unknown>) => ({ id, type: "application", name, properties, tags: [] }) as never;
const OBJECTS = [
  obj("ps", "Adobe Photoshop", { hosting_model: "desktop", is_custom_built: false, governance_status: "sanctioned" }),
  obj("acme", "Acme Ledger", { hosting_model: "saas" }),
  obj("m365", "Microsoft 365", { vendor: "Microsoft" }),
];
const ask = (question: string, objects = OBJECTS) =>
  answerFromRecords({ question, rows: objects.map(rowFromObject).filter(Boolean) as CatalogRow[], graph: { nodes: [], edges: [] }, basePath: "/w", landscape: { objects: objects as never, relationships: [] } });

test("'do we use Adobe?' says yes from the catalogue vendor when the vendor property is empty", () => {
  for (const q of ["do we use Adobe?", "Do we have Adobe", "do we use adobe products?"]) {
    const a = ask(q);
    assert.equal(a.handler, "records", q);
    assert.match(a.answerText, /^Yes/, q);
    assert.match(a.answerText, /Adobe Photoshop/, q);
    assert.deepEqual(a.citations.map((c) => c.row.name), ["Adobe Photoshop"]);
  }
});

test("a word in an app name matches when no catalogue vendor exists", () => {
  const a = ask("do we use Acme?");
  assert.match(a.answerText, /^Yes/);
  assert.deepEqual(a.citations.map((c) => c.row.name), ["Acme Ledger"]);
  assert.equal(ask("do we use Acm?").handler, "unsupported"); // whole word or word prefix of 3+, not a stem guess
});

test("'do we use X' with nothing matching is a clear no, not the old generic text", () => {
  const a = ask("do we use Figma?");
  assert.equal(a.handler, "unsupported");
  assert.match(a.answerText, /^Not that I can see/);
  assert.equal(yesNoSlot("what does Adobe cost?"), null);
});

test("no code path emits the old generic \"I can't answer that yet\"", () => {
  for (const f of ["lib/ask/deterministic.ts", "lib/ask/stream.ts", "components/mvp/AskScreen.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /I can't answer that yet/, f);
  }
  for (const q of ["Tell me a joke", "what's our uptime?", "do we use Figma?"]) assert.doesNotMatch(ask(q).answerText, /I can't answer that yet/);
});

test("every AI fallback reason maps to a specific note", () => {
  assert.equal(aiFallbackNote("model_unavailable", false)?.blocked, true);
  assert.match(aiFallbackNote("timeout", false)!.title, /unavailable right now/);
  assert.match(aiFallbackNote("round_budget", false)!.title, /couldn't finish/);
  assert.match(aiFallbackNote("something_new", false)!.title, /unavailable/);
  assert.match(aiFallbackNote(null, true)!.title, /looked too/);
  assert.equal(aiFallbackNote("limit", false), null);
});
