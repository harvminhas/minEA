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
  row: CatalogRow;
};

export type AskAnswer = {
  handler: "impact" | "spend" | "renewals" | "ownership" | "lifecycle" | "criticality" | "unsupported";
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

const SUGGESTED = [
  "What renews in the next 90 days?",
  "Where is our money going?",
  "What has no owner?",
  "What goes end of life next year?",
];

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
    answerText: payload.answer_text,
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
    typeLabel: item.kind || item.type_label,
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
    return empty("unsupported", "Ask a question about the records in this workspace.", today);
  }
  if (/uptime|invoice|ticket|forecast|google workspace|opinion/.test(q) || /customer data|sensitive|personal data/.test(q)) {
    return {
      ...empty(
        "unsupported",
        "I can't answer that yet. This workspace doesn't record it, so nothing here is guessed. Try one of the questions below.",
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
        "Name the system you mean, for example “What breaks if the firewall goes down?” I won't guess which record.",
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
  if (/money|spend|cost|pay|vendor/.test(q)) return spendAnswer(input.rows, input.basePath, today);

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
  const rowFor = (hit: ImpactHit) => rows.find((row) => row.id === hit.id) ?? placeholderRow(hit.id, hit.name);
  const cited = hits.map((hit) => ({ hit, row: rowFor(hit) }));
  const citations: AskCitation[] = [
    { n: 1, recordId: target.id, relationship: "The record you asked about", row: target },
    ...cited.map((item, index) => ({
      n: index + 2,
      recordId: item.hit.id,
      relationship: item.hit.path.map((step) => step.label).join(", then "),
      badge: item.hit.indirect ? "indirect" : item.hit.severity === "direct" ? undefined : item.hit.severity,
      row: item.row,
    })),
  ];

  const sentence = (group: typeof cited, start: string) => {
    if (!group.length) return "";
    const text = group
      .map((item) => {
        const n = citations.find((citation) => citation.recordId === item.hit.id)?.n;
        return `${item.hit.name} [${n}]`;
      })
      .reduce((left, part, index, all) => {
        if (index === 0) return part;
        if (index === all.length - 1) return `${left}, and ${part}`;
        return `${left}, ${part}`;
      }, "");
    return ` ${start} ${text}.`;
  };

  const stops = cited.filter((item) => item.hit.severity === "direct" && !item.hit.indirect);
  const later = cited.filter((item) => item.hit.severity === "direct" && item.hit.indirect);
  const degraded = cited.filter((item) => item.hit.severity === "degraded");
  const support = cited.filter((item) => item.hit.severity === "loses_support");
  const critical = stops.filter((item) => item.row.criticality === "tier1" || item.row.criticalityLabel === "Critical");
  const answerText = hits.length
    ? `If ${target.name} [1] goes down,${sentence(stops, `**${stops.length} ${stops.length === 1 ? "record stops" : "records stop"} working**:`)}${critical.length ? ` **${critical.length} of them ${critical.length === 1 ? "is" : "are"} critical.**` : ""}${sentence(later, "Affected indirectly:")}${sentence(degraded, "Degraded:")}${sentence(support, "Loses support:")}`
    : `Nothing is recorded as affected if ${target.name} [1] fails.`;

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

function placeholderRow(id: string, name: string): CatalogRow {
  const missing: CatalogMissing = { owner: true, vendor: true, cost: true, renewal: true, lifecycle: true, criticality: true };
  return {
    id,
    object: { id, name, type: "application" } as MinEAObject,
    kind: "application",
    name,
    typeLabel: "Record",
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
  const topText = top.map((vendor, index) => `${vendor.vendor} [${index + 1}] (${moneyLabel(vendor.annual)})`).join(", ");
  const saving = retiring
    ? ` ${retiring.name} [${citations.find((citation) => citation.recordId === retiring.id)?.n}] costs ${retiring.annualCostLabel} a year and is marked Retiring, so it is the clearest saving.`
    : "";
  return {
    handler: "spend",
    answerText: total
      ? `You spend **${moneyLabel(total)} a year** across ${rollup.length} vendors.${top.length ? ` **${share}% goes to ${top.length === 1 ? "one" : top.length === 2 ? "two" : "three"}**: ${topText}.` : ""}${saving}`
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
  const listed = hits
    .slice(0, 4)
    .map((row, index) => `${row.name} [${index + 1}]${row.renewalLabel ? ` on ${row.renewalLabel}` : ""}`)
    .join(", ");
  return {
    handler: "renewals",
    answerText: hits.length
      ? `**${hits.length} ${hits.length === 1 ? "contract renews" : "contracts renew"} in the next 90 days**${sum ? `, worth **${moneyLabel(sum)} a year**` : ""}. ${listed}.`
      : "No renewal dates fall in the next 90 days. Records without a date are left out rather than guessed.",
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
        : `${named.name} [1] has no owner recorded.`,
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
      ? `**${hits.length} records have no owner**: ${hits.slice(0, 6).map((row, index) => `${row.name} [${index + 1}]`).join(", ")}.`
      : "Every application and infrastructure record has an owner.",
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
      ? `The most critical ${hits.length === 1 ? "record is" : "records are"} **${label}**: ${hits
          .slice(0, 6)
          .map((row, index) => `${row.name} [${index + 1}]`)
          .join(", ")}.`
      : "No application or infrastructure record has a criticality set, so nothing is ranked.",
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
      ? `**${hits.length} records are retiring or end of life**: ${hits.slice(0, 6).map((row, index) => `${row.name} [${index + 1}]`).join(", ")}.`
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
