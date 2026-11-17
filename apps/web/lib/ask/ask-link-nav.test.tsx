/** Ask answer record links must be Next.js <Link> so a click stays in the org/workspace shell. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as { React?: typeof React }).React = React;
import { AskRecordsBlock, FollowPill } from "@/components/mvp/AskRecords";
import { LeanAnswer } from "@/components/mvp/AskScreen";
import { recordOpenPath } from "@/lib/record-href";
import { answerFromModel } from "./deterministic";
import { buildFacts } from "./record-filter";
import { rowFromObject, type CatalogRow } from "../model-catalog";
import type { AskModelPayload } from "@/lib/api-client";

const BASE = "/orgs/acme/workspaces/main";
const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}) =>
  ({ id, type, name, properties, tags: [] }) as never;
const OBJECTS = [
  obj("fin", "business_domain", "Finance"),
  obj("ap", "capability", "Accounts Payable", { domain_id: "fin" }),
  obj("inv", "capability", "Invoice capture", { domain_id: "fin", parent_id: "ap" }),
  obj("m365", "application", "Microsoft 365", { vendor: "Microsoft" }),
];
const ROWS = OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[];
const FACTS = buildFacts(ROWS, OBJECTS as never, []);
const item = (id: string, name: string, type: string, type_label: string) => ({
  id, name, type, type_label, vendor: "", product: "", owner_team: "", owner_person: "", annual_cost: null, hosting: "", renewal_date: "",
});
const payload = (extra: Partial<AskModelPayload>) =>
  ({ source: "llm", fallback_reason: null, answer_text: "", citations: [], gaps: [], follow_ups: [], tools_used: [], ...extra }) as AskModelPayload;
const rowHref = (row: CatalogRow) => recordOpenPath(BASE, row, OBJECTS) ?? "#";

test("Ask record name links are Next.js Link, not a raw <a> that remounts the shell", () => {
  const records = readFileSync(new URL("../../components/mvp/AskRecords.tsx", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(records, /import Link from "next\/link"/);
  assert.match(records, /<Link href=\{rowHref\(row\)\}/);
  assert.doesNotMatch(records, /<a href=\{rowHref\(row\)\}/);
  assert.match(records, /href \? <Link href=\{href\}/);
  assert.doesNotMatch(records, /href \? <a href=\{href\}/);
  assert.match(screen, /<Link href=\{rowHref\(row\)\}/);
  assert.doesNotMatch(screen, /<a href=\{rowHref\(row\)\}/);
});

test("capability (and other) name links keep the full org/workspace path", () => {
  const ai = answerFromModel(
    payload({
      headline: "27 capabilities",
      answer_text: "There are 27 capabilities on the map.",
      item_ids: ["ap", "inv", "m365"],
      items: [
        item("ap", "Accounts Payable", "capability", "Capability"),
        item("inv", "Invoice capture", "capability", "Activity"),
        item("m365", "Microsoft 365", "application", "Application"),
      ],
    }),
    ROWS,
    BASE,
    "list all capabilities",
  )!;
  const html = renderToStaticMarkup(
    <AskRecordsBlock answer={ai} facts={FACTS} onFilters={() => {}} onOpen={() => {}} rowHref={rowHref} />,
  );
  assert.match(html, /href="\/orgs\/acme\/workspaces\/main\/model\/capabilities\/ap"/);
  assert.match(html, /href="\/orgs\/acme\/workspaces\/main\/model\/capabilities\/ap\?activity=inv"/);
  assert.match(html, /href="\/orgs\/acme\/workspaces\/main\/model\/applications\/m365"/);
  assert.doesNotMatch(html, /href="\/model\//);

  const lean = renderToStaticMarkup(
    <LeanAnswer
      lean={{ headline: "Name matches", how: "Matched these names." }}
      basePath={BASE}
      footerExtra={null}
      onAdd={() => {}}
      onPick={() => {}}
      items={ai.records ? FACTS.filter((f) => ["ap", "m365"].includes(f.row.id)).map((f) => f.row) : []}
      rowHref={rowHref}
    />,
  );
  // Capabilities are not catalogue rows, so only the app appears here; still a full-path Link.
  assert.match(lean, /href="\/orgs\/acme\/workspaces\/main\/model\/applications\/m365"/);
  assert.doesNotMatch(lean, /href="\/model\//);

  const pillHref = recordOpenPath(BASE, { id: "ap", object: { type: "capability", properties: { domain_id: "fin" } } }, OBJECTS);
  const pill = renderToStaticMarkup(<FollowPill label="Open Accounts Payable" href={pillHref!} />);
  assert.match(pill, /href="\/orgs\/acme\/workspaces\/main\/model\/capabilities\/ap"/);
});
