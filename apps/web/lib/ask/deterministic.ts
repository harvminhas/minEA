import type { MinEAObject, Relationship } from "@minea/types";
import type { AskModelPayload } from "@/lib/api-client";
import {
  choiceLabel,
  classifyIntent,
  importanceVerdict,
  inferCriticality,
  resolveSubject,
} from "@/lib/ask/answerStrategies";
import { dollarsFromCents, lineAnnualCents, lineTitle, readCostLines } from "@/lib/cost/math";
import { presentImpact, type ImpactRecord } from "@/lib/impact/impact-answer";
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
  /** Set on impact rows so the table can group them. The source citation has none. */
  section?: string;
  /** Shown in the table when the row is an example of a grouped answer, such as a vendor. */
  displayName?: string;
  displayType?: string;
  row: CatalogRow;
};

export type AskVerdict = {
  text: string;
  inferred: boolean;
  basis: string[];
};

export type AskEvidence = {
  text: string;
  citationIds: string[];
};

export type AskFixAction = {
  recordId: string;
  field: "criticality" | "owner";
  suggestedValue: string;
};

export type AskAnswer = {
  handler:
    | "impact"
    | "importance"
    | "cost"
    | "spend"
    | "vendors"
    | "renewals"
    | "ownership"
    | "lifecycle"
    | "criticality"
    | "gaps"
    | "clarify"
    | "unsupported";
  answerText: string;
  citations: AskCitation[];
  gaps: { text: string; fillHref: string }[];
  followUps: string[];
  verdict?: AskVerdict;
  evidence?: AskEvidence[];
  fixActions?: AskFixAction[];
  /** Extra sentence after the verdict, such as a stored value that the evidence outranks. */
  note?: string;
  /** Shown under an impact sentence. Omitted when the handler has nothing to add. */
  context?: string;
  /** Blank cells for this field use the amber Add. Other blanks stay a grey dash. */
  focusBlank?: keyof CatalogMissing;
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

const HANDLER_INTENTS: Record<string, AskAnswer["handler"]> = {
  importance: "importance",
  impact: "impact",
  cost: "cost",
  ownership: "ownership",
  gaps: "gaps",
  spend: "spend",
  vendors: "vendors",
  renewals: "renewals",
  lifecycle: "lifecycle",
  criticality: "criticality",
};

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
  const intent = payload.intent;
  const handler = payload.unsupported
    ? "unsupported"
    : intent && intent in HANDLER_INTENTS
      ? HANDLER_INTENTS[intent]
      : "impact";
  return {
    handler,
    answerText: withoutDuplicateRoster(payload.answer_text, citations),
    citations,
    verdict: payload.verdict
      ? { text: payload.verdict.text, inferred: payload.verdict.inferred, basis: payload.verdict.basis ?? [] }
      : undefined,
    evidence: (payload.evidence ?? []).map((item) => ({ text: item.text, citationIds: item.citation_ids ?? [] })),
    fixActions: (payload.fix_actions ?? []).map((item) => ({
      recordId: item.record_id,
      field: item.field,
      suggestedValue: item.suggested_value,
    })),
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
  /** Set when the person picked one of several items that share a name. */
  focusId?: string;
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

  const intent = classifyIntent(question);
  const wantsSubject = intent === "importance" || intent === "impact" || intent === "cost" || (intent === "ownership" && /who owns/.test(q));
  const resolution = wantsSubject ? resolveSubject(question, input.rows) : { status: "none" as const, matches: [] };
  const focused = input.focusId ? resolution.matches.find((row) => row.id === input.focusId) : undefined;
  if (resolution.status === "many" && !focused) return clarifyAnswer(intent, resolution.matches, today);
  const named = focused ?? (resolution.status === "one" ? resolution.matches[0] : null);

  if (intent === "importance" || intent === "impact" || intent === "cost") {
    if (!named) {
      return empty(
        "unsupported",
        "Name the application or infrastructure you mean, for example “What breaks if the firewall goes down?” I won't guess which one.",
        today
      );
    }
    if (input.loading && intent !== "cost") {
      return { ...empty(intent, `Looking up what depends on ${named.name}…`, today), loading: true };
    }
    if (intent === "impact") return impactAnswer(named, input.rows, input.graph, input.basePath, today);
    if (intent === "cost") return costAnswer(named, input.basePath, today);
    return importanceAnswer(named, input.rows, input.graph, input.basePath, today);
  }
  if (intent === "gaps") {
    const missing = missingFieldQuestion(q);
    if (missing) return missingFieldAnswer(missing, q, input.rows, input.basePath, today);
  }
  if (intent === "renewals") return renewalsAnswer(input.rows, input.basePath, today);
  if (intent === "ownership") {
    if (named && input.loading) {
      return { ...empty("ownership", `Looking up what depends on ${named.name}…`, today), loading: true };
    }
    if (named) return ownershipStrategy(named, input.rows, input.graph, input.basePath, today);
    return ownershipAnswer(null, input.rows, input.basePath, today);
  }
  if (intent === "lifecycle") return lifecycleAnswer(input.rows, input.basePath, today);
  if (intent === "criticality") return criticalityAnswer(input.rows, input.basePath, today);
  if (intent === "spend") return spendAnswer(input.rows, input.basePath, today);
  if (intent === "vendors") return vendorsAnswer(input.rows, today);

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
  const presented = presentImpact({
    source: impactRecord(target),
    records: rows.map(impactRecord),
    nodes: graph.nodes,
    edges: graph.edges,
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const citations: AskCitation[] = [
    { n: 1, recordId: target.id, relationship: "", row: target },
    ...presented.rows.map((item) => ({
      n: item.n,
      recordId: item.record.id,
      relationship: item.connection,
      section: item.section,
      row: rowById.get(item.record.id) ?? placeholderRow(item.record.id, item.record.name, item.record.typeLabel),
    })),
  ];
  return {
    handler: "impact",
    answerText: presented.sentence,
    context: presented.context,
    citations,
    gaps: presented.gaps.map((text) => ({
      text,
      fillHref: modelItemPath(basePath, target.kind === "application" ? "applications" : "infrastructure", target.id),
    })),
    followUps: presented.followUps,
    caption: { generatedAt: today, recordCount: presented.rows.length, gapCount: presented.gaps.length },
  };
}

function impactRecord(row: CatalogRow): ImpactRecord {
  const owner = [row.ownerTeam, row.ownerPerson].filter(Boolean).join(" · ");
  const renewal = row.renewalDate
    ? row.renewalDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : row.renewalLabel || null;
  const hosting = row.object.properties && typeof row.object.properties === "object" ? (row.object.properties as { hosting_model?: unknown }).hosting_model : "";
  return {
    id: row.id,
    name: row.name,
    typeLabel: row.typeLabel,
    owner,
    criticality: row.criticalityLabel,
    annualCost: row.annualCostNumber != null ? `${moneyLabel(row.annualCostNumber)}/yr` : null,
    renewal,
    missingOwner: row.missing.owner,
    missingCriticality: row.missing.criticality,
    hostingModel: typeof hosting === "string" ? hosting.trim() : "",
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

const MISSING_FIELDS: { field: keyof CatalogMissing; test: RegExp; phrase: string; filled: string; label: string }[] = [
  { field: "vendor", test: /vendor/, phrase: "no vendor", filled: "a vendor", label: "No vendor" },
  { field: "owner", test: /owner/, phrase: "no owner", filled: "an owner", label: "No owner" },
  { field: "cost", test: /\bcost\b|\bspend\b|\bprice\b/, phrase: "no annual cost", filled: "an annual cost", label: "No annual cost" },
  { field: "renewal", test: /renew|contract/, phrase: "no renewal date", filled: "a renewal date", label: "No renewal date" },
  { field: "criticality", test: /critical/, phrase: "no criticality", filled: "a criticality", label: "No criticality" },
  { field: "lifecycle", test: /lifecycle|end of life|\beol\b/, phrase: "no lifecycle", filled: "a lifecycle", label: "No lifecycle" },
];

function missingFieldQuestion(q: string): (typeof MISSING_FIELDS)[number] | null {
  if (!/without|missing|lack|blank|unset|\bno\b|not (set|named|assigned|recorded)|does not have|doesn't have|do not have|don't have|has no|have no/.test(q)) {
    return null;
  }
  return MISSING_FIELDS.find((item) => item.test.test(q)) ?? null;
}

function scopedRows(q: string, rows: CatalogRow[]): CatalogRow[] {
  const applications = /\bapplications?\b|\bapps?\b/.test(q);
  const infrastructure = /infrastructure|\bservers?\b|\bplatforms?\b/.test(q);
  if (applications && !infrastructure) return rows.filter((row) => row.kind === "application");
  if (infrastructure && !applications) return rows.filter((row) => row.kind !== "application");
  return rows;
}

function missingFieldAnswer(
  missing: (typeof MISSING_FIELDS)[number],
  q: string,
  rows: CatalogRow[],
  basePath: string,
  today: string
): AskAnswer {
  const scope = scopedRows(q, rows);
  const hits = scope.filter((row) => row.missing[missing.field]);
  const who = scope.length > 0 && scope.every((row) => row.kind === "application") ? "application" : "item";
  return {
    handler: "gaps",
    focusBlank: missing.field,
    answerText: hits.length
      ? `**${describeTypes(typeLabels(hits))} ${hits.length === 1 ? "has" : "have"} ${missing.phrase}.**`
      : `Every ${who} here has ${missing.filled}.`,
    citations: hits.slice(0, 12).map((row, index) => ({
      n: index + 1,
      recordId: row.id,
      relationship: missing.label,
      row,
    })),
    gaps: gapsFor(hits.slice(0, 6), basePath),
    followUps: ["What has no owner?", "Where is our money going?", "What renews in the next 90 days?"],
    caption: { generatedAt: today, recordCount: hits.length, gapCount: hits.length },
  };
}

function ownershipAnswer(named: CatalogRow | null, rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  if (named && !/no owner|unowned/.test(named.name.toLowerCase())) {
    const owner = [named.ownerTeam, named.ownerPerson].filter(Boolean).join(" · ");
    return {
      handler: "ownership",
      focusBlank: "owner",
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
    focusBlank: "owner",
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

function clarifyAnswer(intent: string, matches: CatalogRow[], today: string): AskAnswer {
  const shown = matches.slice(0, 5);
  const labels = shown.map((row) => choiceLabel(row, shown));
  const choice = labels.length === 2 ? `${labels[0]} or ${labels[1]}` : labels.join(", ");
  return {
    ...empty("clarify", `Did you mean ${choice}?`, today),
    citations: shown.map((row, index) => ({
      n: index + 1,
      recordId: row.id,
      relationship: labels[index],
      displayName: labels[index],
      row,
    })),
    followUps: shown.map((row, index) => clarifyQuestion(intent, labels[index])),
    caption: { generatedAt: today, recordCount: shown.length, gapCount: 0 },
  };
}

function clarifyQuestion(intent: string, name: string): string {
  if (intent === "importance") return `How important is ${name}?`;
  if (intent === "impact") return `What breaks if ${name} goes down?`;
  if (intent === "cost") return `What does ${name} cost?`;
  if (intent === "ownership") return `Who owns ${name}?`;
  return name;
}

function importanceAnswer(target: CatalogRow, rows: CatalogRow[], graph: AskGraph, basePath: string, today: string): AskAnswer {
  const hits = impactOf(graph.nodes, graph.edges, target.id);
  const touching = graph.edges.filter((edge) => edge.fromId === target.id || edge.toId === target.id);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const direct = hits.filter((hit) => hit.severity === "direct" && !hit.indirect);
  const supportsCapability = hits.some((hit) => nodeById.get(hit.id)?.typeLabel === "Capability") || touching.some((edge) => {
    if (edge.type !== "supported_by" && edge.type !== "supports") return false;
    const other = edge.fromId === target.id ? edge.toId : edge.fromId;
    return nodeById.get(other)?.typeLabel === "Capability";
  });
  const dependentIsHigh = hits.some((hit) => ["high", "critical", "tier1"].includes(rowById.get(hit.id)?.criticality ?? ""));
  const inferred = inferCriticality({
    relationshipCount: touching.length,
    directDependents: direct.length,
    dependentCount: hits.length,
    supportsCapability,
    dependentIsHigh,
  });
  const verdict = importanceVerdict(target.criticality, inferred);
  const evidence = importanceEvidence(target, hits, nodeById);
  if (verdict.inferred && evidence.length === 0) {
    evidence.push({ text: `Nothing in the model depends on ${target.name}.`, citationIds: [target.id] });
  }
  const seats = seatCount(target);
  if (target.annualCostNumber != null && evidence.length < 4) {
    evidence.push({ text: `${target.name} costs ${moneyLabel(target.annualCostNumber)} a year.`, citationIds: [target.id] });
  }
  if (seats && evidence.length < 4) {
    evidence.push({ text: `${target.name} has ${seats} seats on a per-user cost line.`, citationIds: [target.id] });
  }
  const citations = cite(target, evidence, rows);
  const fixActions: AskFixAction[] = verdict.suggestedValue
    ? [{ recordId: target.id, field: "criticality", suggestedValue: verdict.suggestedValue }]
    : [];
  return {
    handler: "importance",
    answerText: verdict.note ? `${verdict.text} ${verdict.note}` : verdict.text,
    verdict: { text: verdict.text, inferred: verdict.inferred, basis: verdict.basis },
    evidence: evidence.slice(0, 4),
    fixActions,
    note: verdict.note ?? undefined,
    citations,
    gaps: subjectGaps(target, touching, basePath),
    followUps: [`What breaks if ${target.name} goes down?`, `Who owns ${target.name}?`, `What does ${target.name} cost?`],
    caption: { generatedAt: today, recordCount: citations.length, gapCount: 0 },
  };
}

function importanceEvidence(target: CatalogRow, hits: ImpactHit[], nodeById: Map<string, ImpactNode>): AskEvidence[] {
  const direct = hits.filter((hit) => hit.severity === "direct" && !hit.indirect);
  const capabilities = hits.filter((hit) => nodeById.get(hit.id)?.typeLabel === "Capability");
  const bullets: AskEvidence[] = [];
  if (direct.length) {
    bullets.push({
      text: `${joinNames(direct.map((hit) => hit.name))} ${direct.length === 1 ? "stops" : "stop"} working if ${target.name} goes down.`,
      citationIds: direct.map((hit) => hit.id),
    });
  }
  if (capabilities.length) {
    bullets.push({
      text: `${joinNames(capabilities.map((hit) => hit.name))} ${capabilities.length === 1 ? "is" : "are"} supported by ${target.name}.`,
      citationIds: capabilities.map((hit) => hit.id),
    });
  }
  const covered = new Set(bullets.flatMap((bullet) => bullet.citationIds));
  const rest = hits.filter((hit) => !covered.has(hit.id));
  if (rest.length) {
    const shown = rest.slice(0, 3);
    bullets.push({
      text: `${joinNames(shown.map((hit) => hit.name))} ${shown.length === 1 ? "is" : "are"} affected if ${target.name} goes down.`,
      citationIds: shown.map((hit) => hit.id),
    });
  }
  return bullets.slice(0, 4);
}

function costAnswer(target: CatalogRow, basePath: string, today: string): AskAnswer {
  const lines = readCostLines(target.object.properties as Record<string, unknown> | null) ?? [];
  const evidence: AskEvidence[] = lines.slice(0, 4).map((line) => ({
    text: `${lineTitle(line)} · ${moneyLabel(dollarsFromCents(lineAnnualCents(line)))} a year.`,
    citationIds: [target.id],
  }));
  if (!evidence.length && target.annualCostNumber != null) {
    evidence.push({ text: `${target.name} costs ${moneyLabel(target.annualCostNumber)} a year.`, citationIds: [target.id] });
  }
  const total = target.annualCostNumber != null ? `${moneyLabel(target.annualCostNumber)} a year` : "No annual cost is recorded";
  return {
    handler: "cost",
    answerText: total,
    verdict: { text: total, inferred: false, basis: evidence.length ? ["cost lines"] : ["no cost recorded"] },
    evidence,
    fixActions: [],
    citations: [{ n: 1, recordId: target.id, relationship: total, row: target }],
    gaps: target.missing.cost ? [{ text: `${target.name} has no annual cost.`, fillHref: itemHref(basePath, target) }] : [],
    followUps: [`How important is ${target.name}?`, `What breaks if ${target.name} goes down?`, `Who owns ${target.name}?`],
    caption: { generatedAt: today, recordCount: 1, gapCount: target.missing.cost ? 1 : 0 },
  };
}

function ownershipStrategy(target: CatalogRow, rows: CatalogRow[], graph: AskGraph, basePath: string, today: string): AskAnswer {
  const owner = [target.ownerTeam, target.ownerPerson].filter(Boolean).join(" · ");
  if (owner) {
    return {
      handler: "ownership",
      answerText: `${target.name} is owned by ${owner}.`,
      verdict: { text: `${target.name} is owned by ${owner}.`, inferred: false, basis: ["owner column"] },
      evidence: [{ text: `Owner ${owner} is set on ${target.name}.`, citationIds: [target.id] }],
      fixActions: [],
      citations: [{ n: 1, recordId: target.id, relationship: owner, row: target }],
      gaps: [],
      followUps: [`How important is ${target.name}?`, `What breaks if ${target.name} goes down?`, `What does ${target.name} cost?`],
      caption: { generatedAt: today, recordCount: 1, gapCount: 0 },
    };
  }
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.fromId === target.id) neighborIds.add(edge.toId);
    else if (edge.toId === target.id) neighborIds.add(edge.fromId);
  }
  const candidates = [...neighborIds]
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is CatalogRow => Boolean(row))
    .map((row) => ({ row, owner: [row.ownerTeam, row.ownerPerson].filter(Boolean).join(" · ") }))
    .filter((item) => item.owner);
  if (!candidates.length) {
    return {
      handler: "ownership",
      answerText: "Unknown",
      verdict: { text: "Unknown", inferred: false, basis: ["no related owner"] },
      evidence: [],
      fixActions: [],
      citations: [{ n: 1, recordId: target.id, relationship: "No owner", row: target }],
      gaps: [{ text: `${target.name} has no owner, and no related item has an owner to infer from.`, fillHref: itemHref(basePath, target) }],
      followUps: [`How important is ${target.name}?`, `What breaks if ${target.name} goes down?`],
      caption: { generatedAt: today, recordCount: 1, gapCount: 1 },
    };
  }
  const counts = new Map<string, { owner: string; rows: CatalogRow[] }>();
  for (const candidate of candidates) {
    const key = candidate.owner.toLowerCase();
    const group = counts.get(key) ?? { owner: candidate.owner, rows: [] };
    group.rows.push(candidate.row);
    counts.set(key, group);
  }
  const best = [...counts.values()].sort((a, b) => b.rows.length - a.rows.length || a.owner.localeCompare(b.owner))[0];
  const evidence = best.rows.slice(0, 4).map((row) => ({
    text: `Inferred from ${row.name}, which is owned by ${best.owner}.`,
    citationIds: [row.id],
  }));
  return {
    handler: "ownership",
    answerText: `Likely ${best.owner}`,
    verdict: { text: `Likely ${best.owner}`, inferred: true, basis: [`owners of ${best.rows.length} related ${best.rows.length === 1 ? "item" : "items"}`] },
    evidence,
    fixActions: [{ recordId: target.id, field: "owner", suggestedValue: best.owner }],
    citations: cite(target, evidence, rows),
    gaps: [{ text: `${target.name} has no owner.`, fillHref: itemHref(basePath, target) }],
    followUps: [`How important is ${target.name}?`, `What breaks if ${target.name} goes down?`, `What does ${target.name} cost?`],
    caption: { generatedAt: today, recordCount: evidence.length + 1, gapCount: 1 },
  };
}

function subjectGaps(target: CatalogRow, touching: ImpactEdge[], basePath: string): { text: string; fillHref: string }[] {
  const href = itemHref(basePath, target);
  const gaps: { text: string; fillHref: string }[] = [];
  if (target.missing.criticality) gaps.push({ text: `${target.name} has no criticality.`, fillHref: href });
  if (target.missing.owner) gaps.push({ text: `${target.name} has no owner.`, fillHref: href });
  if (touching.length === 0) {
    gaps.push({ text: `${target.name} has no relationships recorded.`, fillHref: href });
  } else if (!touching.some((edge) => edge.type === "calls")) {
    gaps.push({ text: `No integrations are recorded for ${target.name}, so this may be understated.`, fillHref: href });
  }
  return gaps;
}

function cite(target: CatalogRow, evidence: AskEvidence[], rows: CatalogRow[]): AskCitation[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const ids = [target.id, ...evidence.flatMap((item) => item.citationIds)];
  const seen = new Set<string>();
  const citations: AskCitation[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = rowById.get(id) ?? placeholderRow(id, id);
    citations.push({ n: citations.length + 1, recordId: id, relationship: id === target.id ? "" : "Evidence", row });
  }
  return citations;
}

function seatCount(row: CatalogRow): number | null {
  const lines = readCostLines(row.object.properties as Record<string, unknown> | null);
  if (!lines) return null;
  const seats = lines.reduce((sum, line) => (line.calculation.kind === "per_user" ? sum + line.calculation.seats : sum), 0);
  return seats > 0 ? seats : null;
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 8) return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${names.slice(0, 5).join(", ")}, and ${names.length - 5} more`;
}

function itemHref(basePath: string, row: CatalogRow): string {
  return modelItemPath(basePath, row.kind === "application" ? "applications" : "infrastructure", row.id);
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
