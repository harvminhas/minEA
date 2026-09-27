import type { MinEAObject, Relationship } from "@minea/types";
import type { AskModelPayload } from "@/lib/api-client";
import { impactOf, type ImpactEdge, type ImpactHit, type ImpactNode } from "@/lib/impact/relationship-impact";
import { moneyLabel, vendorRollup, type CatalogMissing, type CatalogRow } from "@/lib/model-catalog";
import { modelItemPath } from "@/lib/mvp-paths";

/**
 * Fixed handlers. The Ask screen uses these when the model is off, times out,
 * or returns an answer that did not come from a lookup.
 */
export type AskCitation = {
  n: number;
  recordId: string;
  relationship: string;
  badge?: string;
  /** Shown in the table when the row is an example of a grouped answer, such as a vendor. */
  displayName?: string;
  displayType?: string;
  row: CatalogRow;
};

export type AskAnswer = {
  handler: "impact" | "spend" | "vendors" | "renewals" | "ownership" | "lifecycle" | "criticality" | "unsupported";
  answerText: string;
  citations: AskCitation[];
  gaps: { text: string; fillHref: string }[];
  followUps: string[];
  caption: { generatedAt: string; recordCount: number; gapCount: number; extra?: string };
  loading?: boolean;
};

export type AskGraph = {
  nodes: ImpactNode[];
  edges: ImpactEdge[];
};

export function describeTypes(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const label = raw.trim() || "Item";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `${count} ${count === 1 ? label : pluralType(label)}`);
  if (parts.length === 0) return "nothing";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function pluralType(label: string): string {
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(s|x|ch|sh)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

function typeLabels(rows: { typeLabel: string }[]): string[] {
  return rows.map((row) => row.typeLabel);
}

const SUGGESTED = [
  "What renews in the next 90 days?",
  "Where is our money going?",
  "What has no owner?",
  "What goes end of life next year?",
];

function withoutDuplicateRoster(text: string, citations: AskCitation[]): string {
  const cleaned = text.replace(/\s*\((?:applications?|capabilities|capability|solutions?|infrastructure|on-prem servers?|saas platforms?|cloud|network|flows?|apis?|events?|components?)\)/gi, "");
  if (citations.length < 2 || !cleaned.includes(":")) return cleaned.trim();
  const head = cleaned.slice(0, cleaned.indexOf(":")).trim();
  let remainder = cleaned.slice(cleaned.indexOf(":") + 1);
  for (const citation of [...citations].sort((a, b) => b.row.name.length - a.row.name.length)) {
    remainder = remainder.replace(new RegExp(citation.row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "");
  }
  remainder = remainder.replace(/\[\d+\]/g, "").replace(/[\s*•\-,.;:]+/g, "");
  if (remainder.length > 0) return cleaned.trim();
  if (/^the following have no owner$/i.test(head)) {
    return `**${describeTypes(citations.map((item) => item.row.typeLabel))} have no owner.**`;
  }
  return head.endsWith(".") ? head : `${head}.`;
}

export function answerFromModel(payload: AskModelPayload, rows: CatalogRow[], basePath: string): AskAnswer | null {
  if (payload.source !== "llm" || !payload.answer_text) return null;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const citations: AskCitation[] = payload.citations.map((item) => ({
    n: item.n,
    recordId: item.record_id,
    relationship: item.relationship,
    row: rowForCitation(item, rows),
  }));
  return {
    handler: payload.unsupported ? "unsupported" : "impact",
    answerText: withoutDuplicateRoster(payload.answer_text, citations),
    citations,
    gaps: payload.gaps.map((gap) => {
      const row = citations.find((item) => item.recordId === gap.record_id)?.row ?? rows.find((item) => item.id === gap.record_id);
      return {
        text: gap.message,
        fillHref: modelItemPath(basePath, row?.kind === "application" ? "applications" : "infrastructure", gap.record_id),
      };
    }),
    followUps: payload.follow_ups.slice(0, 3),
    caption: {
      generatedAt: today,
      recordCount: citations.length,
      gapCount: payload.gaps.length,
      extra: "checked against the lookup results",
    },
  };
}

function rowForCitation(item: AskModelPayload["citations"][number], rows: CatalogRow[]): CatalogRow {
  const found = rows.find((row) => row.id === item.record_id);
  if (found) return found;
  const application = item.type_label === "Application";
  const missing: CatalogMissing = {
    owner: !item.owner,
    vendor: true,
    cost: true,
    renewal: true,
    lifecycle: true,
    criticality: !item.criticality,
  };
  return {
    id: item.record_id,
    object: { id: item.record_id, name: item.name, type: application ? "application" : "cloud_service" } as MinEAObject,
    kind: application ? "application" : "platform",
    name: item.name,
    typeLabel: item.type_label || item.kind || "Item",
    subtitle: "",
    ownerTeam: item.owner,
    ownerPerson: "",
    vendor: "",
    vendorKey: "",
    annualCostLabel: "—",
    annualCostNumber: null,
    renewalLabel: "",
    renewalDate: null,
    renewalSoon: false,
    lifecycle: "",
    lifecycleLabel: "",
    criticality: "",
    criticalityLabel: item.criticality,
    costModelLabel: "",
    hostingLabel: "",
    slaLabel: "",
    suggestion: null,
    missing,
    missingCount: Object.values(missing).filter(Boolean).length,
  };
}

export function answerFromRecords(input: {
  question: string;
  rows: CatalogRow[];
  graph: AskGraph;
  basePath: string;
  loading?: boolean;
}): AskAnswer {
  const question = input.question.trim();
  const q = question.toLowerCase();
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (!question) {
    return empty("unsupported", "Ask a question about your applications, capabilities, or infrastructure.", today);
  }
  if (/uptime|invoice|ticket|forecast|google workspace|opinion/.test(q) || /customer data|sensitive|personal data/.test(q)) {
    return {
      ...empty(
        "unsupported",
        "I can't answer that yet. This workspace doesn't have that, so nothing here is guessed. Try one of the questions below.",
        today
      ),
      followUps: SUGGESTED.slice(0, 3),
    };
  }

  const named = matchRecord(question, input.rows);
  if (/break|fail|goes down|outage|depend|impact/.test(q)) {
    if (!named) {
      return empty(
        "unsupported",
        "Name the application or infrastructure you mean, for example “What breaks if the firewall goes down?” I won't guess which one.",
        today
      );
    }
    if (input.loading) {
      return { ...empty("impact", `Looking up what depends on ${named.name}…`, today), loading: true };
    }
    return impactAnswer(named, input.rows, input.graph, input.basePath, today);
  }
  if (/renew|contract|expire|90 day/.test(q)) return renewalsAnswer(input.rows, input.basePath, today);
  if (/no owner|unowned|without an owner|who owns/.test(q)) return ownershipAnswer(named, input.rows, input.basePath, today);
  if (/end of life|retiring|eol/.test(q)) return lifecycleAnswer(input.rows, input.basePath, today);
  if (/critical|most important|tier 1|tier1/.test(q)) return criticalityAnswer(input.rows, input.basePath, today);
  if (/money|spend|cost|pay/.test(q)) return spendAnswer(input.rows, input.basePath, today);
  if (/vendor/.test(q)) return vendorsAnswer(input.rows, today);

  return {
    ...empty(
      "unsupported",
      "I can't answer that yet. Try renewals, spend, owners, end of life, or what breaks if a named system goes down.",
      today
    ),
    followUps: SUGGESTED.slice(0, 3),
  };
}

export function graphFrom(nodes: ImpactNode[], relationships: Relationship[]): AskGraph {
  return {
    nodes,
    edges: relationships.map((rel) => ({
      type: rel.type,
      fromId: rel.from_object_id,
      toId: rel.to_object_id,
    })),
  };
}

function impactAnswer(target: CatalogRow, rows: CatalogRow[], graph: AskGraph, basePath: string, today: string): AskAnswer {
  const hits = impactOf(graph.nodes, graph.edges, target.id);
  const typeOf = new Map(graph.nodes.map((node) => [node.id, node.typeLabel]));
  const rowFor = (hit: ImpactHit) => rows.find((row) => row.id === hit.id) ?? placeholderRow(hit.id, hit.name, typeOf.get(hit.id));
  const cited = hits.map((hit) => ({ hit, row: rowFor(hit) }));
  const citations: AskCitation[] = [
    { n: 1, recordId: target.id, relationship: `The ${target.typeLabel} you asked about`, row: target },
    ...cited.map((item, index) => ({
      n: index + 2,
      recordId: item.hit.id,
      relationship: item.hit.path.map((step) => step.label).join(", then "),
      badge: item.hit.indirect ? "indirect" : item.hit.severity === "direct" ? undefined : item.hit.severity,
      row: item.row,
    })),
  ];

  const sentence = (group: typeof cited, ending: string) => {
    if (!group.length) return "";
    return ` **${describeTypes(typeLabels(group.map((item) => item.row)))}** ${ending}.`;
  };

  const stops = cited.filter((item) => item.hit.severity === "direct" && !item.hit.indirect);
  const later = cited.filter((item) => item.hit.severity === "direct" && item.hit.indirect);
  const degraded = cited.filter((item) => item.hit.severity === "degraded");
  const support = cited.filter((item) => item.hit.severity === "loses_support");
  const critical = stops.filter((item) => item.row.criticality === "tier1" || item.row.criticalityLabel === "Critical");
  const answerText = hits.length
    ? `If ${target.name} [1] goes down,${sentence(stops, stops.length === 1 ? "stops working" : "stop working")}${critical.length ? ` **${critical.length} of them ${critical.length === 1 ? "is" : "are"} critical.**` : ""}${sentence(later, later.length === 1 ? "is affected indirectly" : "are affected indirectly")}${sentence(degraded, degraded.length === 1 ? "is degraded" : "are degraded")}${sentence(support, support.length === 1 ? "loses support" : "lose support")}`
    : `Nothing linked to ${target.name} [1] is affected if it fails.`;

  return {
    handler: "impact",
    answerText,
    citations,
    gaps: gapsFor([target, ...cited.map((item) => item.row)].filter((row) => row.kind === "application" || row.kind === "platform" || row.kind === "runtime"), basePath),
    followUps: [
      `Who can fix ${target.name} if it fails?`,
      `What would it cost to move off ${target.name}?`,
      "What else has no backup?",
    ],
    caption: {
      generatedAt: today,
      recordCount: citations.length,
      gapCount: 0,
      extra: "How this was worked out",
    },
  };
}

function placeholderRow(id: string, name: string, typeLabel = "Item"): CatalogRow {
  const missing: CatalogMissing = { owner: true, vendor: true, cost: true, renewal: true, lifecycle: true, criticality: true };
  return {
    id,
    object: { id, name, type: "application" } as MinEAObject,
    kind: "application",
    name,
    typeLabel,
    subtitle: "",
    ownerTeam: "",
    ownerPerson: "",
    vendor: "",
    vendorKey: "",
    annualCostLabel: "—",
    annualCostNumber: null,
    renewalLabel: "",
    renewalDate: null,
    renewalSoon: false,
    lifecycle: "",
    lifecycleLabel: "",
    criticality: "",
    criticalityLabel: "",
    costModelLabel: "",
    hostingLabel: "",
    slaLabel: "",
    suggestion: null,
    missing,
    missingCount: 6,
  };
}

function vendorsAnswer(rows: CatalogRow[], today: string): AskAnswer {
  const vendors = vendorRollup(rows);
  const citations: AskCitation[] = vendors.slice(0, 12).map((vendor, index) => ({
    n: index + 1,
    recordId: vendor.items[0].id,
    relationship: describeTypes(typeLabels(vendor.items)),
    displayName: vendor.vendor,
    displayType: "Vendor",
    row: vendor.items[0],
  }));
  return {
    handler: "vendors",
    answerText: vendors.length
      ? `**${vendors.length === 1 ? "1 vendor is" : `${vendors.length} vendors are`}** named on applications and infrastructure.`
      : "No vendor is named on an application or infrastructure item.",
    citations,
    gaps: [],
    followUps: ["Where is our money going?", "What renews in the next 90 days?", "What has no owner?"],
    caption: { generatedAt: today, recordCount: citations.length, gapCount: 0 },
  };
}

function spendAnswer(rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const rollup = vendorRollup(rows).filter((vendor) => vendor.annual > 0);
  const total = rollup.reduce((sum, vendor) => sum + vendor.annual, 0);
  const top = rollup.slice(0, 3);
  const share = total ? Math.round((top.reduce((sum, vendor) => sum + vendor.annual, 0) / total) * 100) : 0;
  const retiring = rows.find((row) => row.annualCostNumber && ["retiring", "deprecated"].includes(row.lifecycle));
  const citations: AskCitation[] = top.map((vendor, index) => ({
    n: index + 1,
    recordId: vendor.items[0].id,
    relationship: `${moneyLabel(vendor.annual)} a year · ${total ? Math.round((vendor.annual / total) * 100) : 0}% of spend`,
    row: vendor.items[0],
  }));
  if (retiring && !citations.some((citation) => citation.recordId === retiring.id)) {
    citations.push({
      n: citations.length + 1,
      recordId: retiring.id,
      relationship: `${retiring.annualCostLabel} a year · Retiring`,
      row: retiring,
    });
  }
  const saving = retiring
    ? ` ${retiring.name} [${citations.find((citation) => citation.recordId === retiring.id)?.n}] costs ${retiring.annualCostLabel} a year and is marked Retiring, so it is the clearest saving.`
    : "";
  return {
    handler: "spend",
    answerText: total
      ? `You spend **${moneyLabel(total)} a year** across ${rollup.length} vendors.${top.length ? ` **${share}% goes to ${top.length === 1 ? "one vendor" : top.length === 2 ? "two vendors" : "three vendors"}.**` : ""}${saving}`
      : "No annual costs are recorded yet, so spend cannot be totaled.",
    citations,
    gaps: gapsFor(rows.filter((row) => row.missing.cost || row.missing.vendor).slice(0, 4), basePath),
    followUps: ["What can we cancel?", "Which costs went up this year?", "What renews in the next 90 days?"],
    caption: {
      generatedAt: today,
      recordCount: citations.length,
      gapCount: gapsFor(rows.filter((row) => row.missing.cost || row.missing.vendor).slice(0, 4), basePath).length,
      extra: "Open full spend report",
    },
  };
}

function renewalsAnswer(rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const hits = rows.filter((row) => row.renewalSoon).sort((a, b) => (a.renewalDate?.getTime() ?? 0) - (b.renewalDate?.getTime() ?? 0));
  const sum = hits.reduce((total, row) => total + (row.annualCostNumber ?? 0), 0);
  const citations: AskCitation[] = hits.slice(0, 8).map((row, index) => ({
    n: index + 1,
    recordId: row.id,
    relationship: `Renews ${row.renewalLabel}${row.annualCostNumber ? ` · ${row.annualCostLabel}` : ""}`,
    row,
  }));
  return {
    handler: "renewals",
    answerText: hits.length
      ? `**${hits.length} ${hits.length === 1 ? "contract renews" : "contracts renew"} in the next 90 days**${sum ? `, worth **${moneyLabel(sum)} a year**` : ""}.`
      : "No renewal dates fall in the next 90 days. Missing dates are left out rather than guessed.",
    citations,
    gaps: gapsFor(hits.filter((row) => row.missing.owner || row.missing.vendor), basePath),
    followUps: ["What can we cancel?", "Who approves the largest renewal?", "What renews in the next 12 months?"],
    caption: { generatedAt: today, recordCount: citations.length, gapCount: 0, extra: "Next 90 days" },
  };
}

function ownershipAnswer(named: CatalogRow | null, rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  if (named && !/no owner|unowned/.test(named.name.toLowerCase())) {
    const owner = [named.ownerTeam, named.ownerPerson].filter(Boolean).join(" · ");
    return {
      handler: "ownership",
      answerText: owner
        ? `${named.name} [1] is owned by **${owner}**.`
        : `${named.name} [1] has no owner.`,
      citations: [{ n: 1, recordId: named.id, relationship: owner || "No owner", row: named }],
      gaps: owner ? [] : gapsFor([named], basePath),
      followUps: ["What else has no owner?", "What breaks if it goes down?", "What renews in the next 90 days?"],
      caption: { generatedAt: today, recordCount: 1, gapCount: owner ? 0 : 1 },
    };
  }
  const hits = rows.filter((row) => row.missing.owner);
  return {
    handler: "ownership",
    answerText: hits.length
      ? `**${describeTypes(typeLabels(hits))} ${hits.length === 1 ? "has" : "have"} no owner.**`
      : "Every application and infrastructure item has an owner.",
    citations: hits.slice(0, 8).map((row, index) => ({ n: index + 1, recordId: row.id, relationship: "No owner", row })),
    gaps: gapsFor(hits.slice(0, 6), basePath),
    followUps: ["Are any critical systems unowned?", "Where is our money going?", "What renews in the next 90 days?"],
    caption: { generatedAt: today, recordCount: hits.length, gapCount: hits.length },
  };
}

function criticalityAnswer(rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const ranked = rows
    .filter((row) => criticalityRank(row.criticality) > 0)
    .sort((a, b) => criticalityRank(b.criticality) - criticalityRank(a.criticality) || a.name.localeCompare(b.name));
  const topRank = ranked.length ? criticalityRank(ranked[0].criticality) : 0;
  const hits = ranked.filter((row) => criticalityRank(row.criticality) === topRank);
  const label = hits[0]?.criticalityLabel || "Critical";
  return {
    handler: "criticality",
    answerText: hits.length
      ? `The most critical ${describeTypes(typeLabels(hits))} ${hits.length === 1 ? "is" : "are"} **${label}**.`
      : "No application or infrastructure item has a criticality set, so nothing is ranked.",
    citations: hits.slice(0, 8).map((row, index) => ({
      n: index + 1,
      recordId: row.id,
      relationship: row.criticalityLabel,
      row,
    })),
    gaps: gapsFor(hits.filter((row) => row.missing.owner).slice(0, 4), basePath),
    followUps: ["What breaks if the top one goes down?", "What has no owner?", "Where is our money going?"],
    caption: { generatedAt: today, recordCount: hits.length, gapCount: 0 },
  };
}

function criticalityRank(value: string): number {
  if (value === "tier1" || value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function lifecycleAnswer(rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const hits = rows.filter((row) => ["retiring", "deprecated", "end_of_life", "retired"].includes(row.lifecycle));
  return {
    handler: "lifecycle",
    answerText: hits.length
      ? `**${describeTypes(typeLabels(hits))} ${hits.length === 1 ? "is" : "are"} retiring or end of life.**`
      : "Nothing is marked retiring or end of life.",
    citations: hits.slice(0, 8).map((row, index) => ({
      n: index + 1,
      recordId: row.id,
      relationship: row.lifecycleLabel,
      row,
    })),
    gaps: gapsFor(hits.filter((row) => row.missing.renewal || row.missing.owner).slice(0, 4), basePath),
    followUps: ["What renews in the next 90 days?", "Where is our money going?", "What has no owner?"],
    caption: { generatedAt: today, recordCount: hits.length, gapCount: 0 },
  };
}

function gapsFor(rows: CatalogRow[], basePath: string): { text: string; fillHref: string }[] {
  const gaps: { text: string; fillHref: string }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const href = `${basePath}/model/${row.kind === "application" ? "applications" : "infrastructure"}/${row.id}`;
    const bits = [
      row.missing.vendor ? "no vendor" : "",
      row.missing.renewal ? "no renewal date" : "",
      row.missing.owner ? "no owner" : "",
      row.missing.cost ? "no annual cost" : "",
    ].filter(Boolean);
    if (!bits.length || seen.has(row.id)) continue;
    seen.add(row.id);
    const suggestion = row.suggestion && row.missing.vendor ? ` ${row.suggestion} is suggested, not confirmed.` : "";
    gaps.push({ text: `${row.name} has ${bits.join(" and ")}.${suggestion}`, fillHref: href });
  }
  return gaps.slice(0, 4);
}

function matchRecord(question: string, rows: CatalogRow[]): CatalogRow | null {
  const folded = question.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const ranked = rows
    .map((row) => {
      const name = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const idx = name.length > 2 ? folded.indexOf(name) : -1;
      return { row, idx, length: name.length };
    })
    .filter((item) => item.idx >= 0)
    .sort((a, b) => b.length - a.length);
  return ranked[0]?.row ?? null;
}

function empty(handler: AskAnswer["handler"], answerText: string, today: string): AskAnswer {
  return {
    handler,
    answerText,
    citations: [],
    gaps: [],
    followUps: [],
    caption: { generatedAt: today, recordCount: 0, gapCount: 0 },
  };
}
