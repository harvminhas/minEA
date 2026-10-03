import { describe, it, assert } from "vitest";
import { planToResultItems } from "./add-result-adapter";
import type { PlanInput } from "./add-plan";

describe("AddResult adapter", () => {
  const createPlanInput = (overrides: Partial<PlanInput>): PlanInput => ({
    key: "test-key",
    input: "Test Item",
    name: "Test Item",
    status: "matched",
    tool: null,
    options: [],
    customBuilt: false,
    kind: "app",
    choice: "saas",
    existing: null,
    hint: null,
    keep: false,
    serverName: "",
    where: "",
    ownerTeam: "",
    ownerName: "",
    renewal: "",
    yearly: "",
    ...overrides,
  });

  it("converts existing item to RecordCard format", () => {
    const existing = {
      id: "existing-1",
      type: "application",
      name: "Microsoft 365",
      owner: "Infrastructure Team",
      cost: "$51,840",
      lifecycle: "",
      category: "Productivity",
      catalogTool: "Microsoft 365",
      vendor: "Microsoft",
      renewal: "2027-01-14",
    };

    const row = createPlanInput({ existing, name: "M365" });
    const { items } = planToResultItems([row], new Map([["test-key", "M365"]]));

    assert.equal(items.length, 1);
    assert.equal(items[0].isExisting, true);
    assert.equal(items[0].name, "M365"); // Uses input name
    assert.equal(items[0].owner, "Infrastructure Team");
    assert.equal(items[0].cost, "$51,840");
  });

  it("converts new SaaS item without hosting question", () => {
    const tool = { name: "Zoom Workplace", vendor: "Zoom", category: "Meetings", hosting: "saas", kind: "app", typicalAnnual: 1800, aliases: [], unit: "year" };
    const row = createPlanInput({ tool, choice: "saas" });
    const { items } = planToResultItems([row], new Map());

    assert.equal(items.length, 1);
    assert.equal(items[0].isExisting, false);
    assert.equal(items[0].isSaas, true);
    assert.equal(items[0].needsHostingQuestion, false);
  });

  it("converts new custom item with hosting question", () => {
    const row = createPlanInput({ status: "custom", choice: "unknown" });
    const { items } = planToResultItems([row], new Map());

    assert.equal(items.length, 1);
    assert.equal(items[0].needsHostingQuestion, true);
    assert.equal(items[0].hostingChoice, "unknown");
  });

  it("converts fuzzy match with suggestion", () => {
    const tool = { name: "BarTender", vendor: "Seagull", category: "Operations", hosting: "either", kind: "app", typicalAnnual: 1200, aliases: [], unit: "year" };
    const row = createPlanInput({ status: "weak", tool, name: "label printing" });
    const { items } = planToResultItems([row], new Map());

    assert.equal(items.length, 1);
    assert.equal(items[0].isFuzzy, true);
    assert.equal(items[0].fuzzySuggestion, "BarTender");
  });

  it("preserves typed texts map", () => {
    const texts = new Map([
      ["key1", "ms 365"],
      ["key2", "hubspot"],
    ]);
    const rows = [
      createPlanInput({ key: "key1" }),
      createPlanInput({ key: "key2" }),
    ];
    const result = planToResultItems(rows, texts);

    assert.equal(result.texts.get("key1"), "ms 365");
    assert.equal(result.texts.get("key2"), "hubspot");
  });
});
