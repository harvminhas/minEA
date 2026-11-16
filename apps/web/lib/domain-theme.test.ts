import assert from "node:assert/strict";
import { test } from "node:test";
import { decorateDomain, pickDomainTheme } from "./domain-theme.ts";

test("pickDomainTheme maps homebuilder and common names, with a generic fallback", () => {
  const cases: [string, string, string][] = [
    ["Strategic Planning & Governance", "strategy", "compass"],
    ["Land Acquisition & Development", "land", "land-plot"],
    ["Home Design & Construction", "construction", "hard-hat"],
    ["Sales & Marketing", "sales", "megaphone"],
    ["Customer Experience & Warranty", "customer", "heart-handshake"],
    ["Finance", "finance", "circle-dollar-sign"],
    ["People & Workforce", "people", "users"],
    ["Technology & Platforms", "technology", "layers"],
    ["Financial Management", "finance", "circle-dollar-sign"],
    ["Information Technology", "technology", "layers"],
    ["Quality & Compliance", "strategy", "compass"],
    ["Mystery Division", "generic", "layout-grid"],
  ];
  for (const [name, color, icon] of cases) {
    assert.deepEqual(pickDomainTheme(name), { color, icon }, name);
  }
});

test("decorateDomain fills missing icon and color but does not overwrite", () => {
  const filled = decorateDomain({ name: "Finance", capabilities: [] });
  assert.equal(filled.color, "finance");
  assert.equal(filled.icon, "circle-dollar-sign");
  const kept = decorateDomain({ name: "Finance", icon: "wallet", color: "generic", capabilities: [] });
  assert.equal(kept.icon, "wallet");
  assert.equal(kept.color, "generic");
});

test("pickDomainTheme prefers the name over a conflicting description", () => {
  assert.deepEqual(
    pickDomainTheme("Technology & Platforms", "Systems for building, sales, finance, and IT"),
    { color: "technology", icon: "layers" },
  );
  assert.deepEqual(
    pickDomainTheme("Mystery Division", "Finding and entitling land"),
    { color: "land", icon: "land-plot" },
  );
});
