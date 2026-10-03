import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TOOL_CATALOG } from "./match-tools.ts";
import { classifyAddIntent } from "./add-intent.ts";
import { normalizeTerm } from "./match-tools.ts";

function known(term: string): boolean {
  const key = normalizeTerm(term);
  return TOOL_CATALOG.some((tool) => normalizeTerm(tool.name) === key || tool.aliases.some((alias) => normalizeTerm(alias) === key));
}

describe("classifyAddIntent", () => {
  it("treats an add instruction as an add", () => {
    assert.equal(classifyAddIntent("add Zoom, HubSpot and NetSuite", known), "add");
    assert.equal(classifyAddIntent("+ Gusto", known), "add");
    assert.equal(classifyAddIntent("new server SQL02", known), "add");
  });

  it("treats a mostly known list as an add", () => {
    assert.equal(classifyAddIntent("Zoom, Slack, Dropbox", known), "add");
  });

  it("asks when only some names are known", () => {
    assert.equal(classifyAddIntent("Zoom, Contoso widget, Fabrikam", known), "ambiguous");
  });

  it("leaves questions on the question path", () => {
    assert.equal(classifyAddIntent("What breaks if the AS400 goes down?", known), "question");
    assert.equal(classifyAddIntent("Who owns Salesforce?", known), "question");
    assert.equal(classifyAddIntent("Salesforce", known), "question");
    assert.equal(classifyAddIntent("Slack and Teams?", known), "question");
  });
});
