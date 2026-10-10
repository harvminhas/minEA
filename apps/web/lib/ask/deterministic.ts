import { chartFromPayload, renewalBlocks, tableFromPayload, vendorBlocks, type AskChart, type AskTable } from "@/lib/ask/rich";
import type { MinEAObject, Relationship } from "@minea/types";
import type { AskModelPayload, AskStep } from "@/lib/api-client";
import {
  choiceLabel,
  classifyIntent,
  isAiDataQuestion,
  isAiQuestion,
  importanceVerdict,
  inferCriticality,
  resolveSubject,
} from "@/lib/ask/answerStrategies";
import { dollarsFromCents, formatDollars, lineAnnualCents, lineTitle, readCostLines } from "@/lib/cost/math";
import { presentImpact, type ImpactRecord } from "@/lib/impact/impact-answer";
import { impactOf, type ImpactEdge, type ImpactHit, type ImpactNode } from "@/lib/impact/relationship-impact";
import { OWN_LOGIN_LABEL, SIGN_IN_EDGE, isOwnLogin, isSignInCandidate } from "@/lib/sign-in";
import { moneyLabel, vendorRollup, type CatalogMissing, type CatalogRow } from "@/lib/model-catalog";
import { modelItemPath, modelPath, reportPath, sectionForKind } from "@/lib/mvp-paths";
import { aiLandscape, dataAccess, type AiLandscape, type LandscapeEdge, type LandscapeFlag, type LandscapeObject } from "@/lib/ai/landscape";
import { readRuntimeInfra } from "@/lib/infra/read";
import { agingSummary } from "@/lib/infra/status";

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
    | "aging"
    | "ai"
    | "sign_in"
    | "cancel"
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
  /** Step 3: the short line on top (server answers send it; others use the first sentence). */
  summary?: string;
  /** Step 3: a table from lookup results / catalogue rows; replaces the citations table when present. */
  table?: AskTable;
  chart?: AskChart;
  /** Model answers: the server's working steps (lookups and checks), shown under the answer. */
  steps?: AskStep[];
  /** A report that holds the full answer, shown under it. */
  link?: { href: string; label: string };
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
  aging: "aging",
  ai: "ai",
  sign_in: "sign_in",
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

export function answerFromModel(payload: AskModelPayload, rows: CatalogRow[], basePath: string, question?: string): AskAnswer | null {
  if (payload.source !== "llm" || !payload.answer_text) return null;
  const aiAnswer = payload.intent === "ai" || (payload.tools_used ?? []).includes("ai_landscape");
  // An AI answer to a question with no AI wording ("show me the model") is a misroute: keep the local answer.
  if (aiAnswer && question !== undefined && !isAiQuestion(question)) return null;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const richTable = tableFromPayload(payload);
  const richChart = chartFromPayload(payload);
  // Older APIs (step 2b) sent only vendor_table: keep turning it into vendor rows.
  const vendorRows = richTable ? null : vendorTableCitations(payload, rows);
  const citations: AskCitation[] = vendorRows ?? payload.citations.map((item) => ({
    n: item.n,
    recordId: item.record_id,
    relationship: item.relationship,
    row: rowForCitation(item, rows),
  }));
  const intent = payload.intent;
  const handler = payload.unsupported
    ? "unsupported"
    : vendorRows || richTable?.kind === "vendors"
      ? "vendors"
      : richTable?.kind === "renewals"
        ? "renewals" // not "impact": the impact table hides row 1 (the target), which dropped the top vendor
      : intent && intent in HANDLER_INTENTS
      ? HANDLER_INTENTS[intent]
      : "impact";
  return {
    handler: handler === "impact" && aiAnswer ? "ai" : handler,
    ...(aiAnswer && !payload.unsupported ? { link: aiReportLink(basePath) } : {}),
    // Vendor rows replace the model's own citations, so its [n] markers would point at the wrong rows.
    ...(richTable ? { table: richTable } : {}),
    ...(richChart ? { chart: richChart } : {}),
    ...(payload.summary ? { summary: payload.summary } : {}),
    answerText: vendorRows ? payload.answer_text.replace(/\s?\[\d+\]/g, "") : withoutDuplicateRoster(payload.answer_text, citations),
    citations,
    verdict: payload.verdict
      ? { text: payload.verdict.text, inferred: payload.verdict.inferred, basis: payload.verdict.basis ?? [] }
      : undefined,
    evidence: (payload.evidence ?? []).map((item) => ({ text: item.text, citationIds: item.citation_ids ?? [] })),
    // The model can repeat a fix (same item, same field): show it once.
    fixActions: (payload.fix_actions ?? []).filter((item, index, all) => all.findIndex((other) => other.record_id === item.record_id && other.field === item.field) === index).map((item) => ({
      recordId: item.record_id,
      field: item.field,
      suggestedValue: item.suggested_value,
    })),
    // The model can list the same gap twice (seen live: the same "no annual cost" line, which also
    // gave React a duplicate key). Show each gap once.
    gaps: payload.gaps.filter((gap, index, all) => all.findIndex((other) => other.message === gap.message) === index).map((gap) => {
      const row = citations.find((item) => item.recordId === gap.record_id)?.row ?? rows.find((item) => item.id === gap.record_id);
      return {
        text: gap.message,
        fillHref: modelItemPath(basePath, row ? sectionForKind(row.kind) : "applications", gap.record_id),
      };
    }),
    followUps: payload.follow_ups.slice(0, 3),
    caption: {
      generatedAt: today,
      recordCount: citations.length,
      gapCount: payload.gaps.length,
      extra: "checked against the lookup results",
    },
    ...(payload.steps?.length ? { steps: payload.steps } : {}),
  };
}

/** One table row per vendor: vendor name, spend, and the items it covers. Count = the stated vendor count. */
function vendorTableCitations(payload: AskModelPayload, rows: CatalogRow[]): AskCitation[] | null {
  const table = payload.vendor_table;
  if (!table || table.length === 0) return null;
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const out: AskCitation[] = [];
  table.forEach((vendor, index) => {
    const first = rows.find((row) => vendor.record_ids.includes(row.id));
    if (!first) return;
    const cost = vendor.annual_cost ? `${money(vendor.annual_cost)} a year` : "No annual cost recorded";
    out.push({
      n: index + 1,
      recordId: first.id,
      relationship: `${cost} · ${vendor.names.join(", ")}`,
      displayName: vendor.vendor,
      displayType: "Vendor",
      // The vendor isn't the item: don't show the first item's owner or criticality on the vendor's row.
      row: { ...first, ownerTeam: "", ownerPerson: "", criticality: "", criticalityLabel: "" },
    });
  });
  return out.length ? out : null;
}

function rowForCitation(item: AskModelPayload["citations"][number], rows: CatalogRow[]): CatalogRow {
  const found = rows.find((row) => row.id === item.record_id);
  if (found) return found;
  const application = item.type_label === "Application";
  const aiType = item.type_label === "AI Agent" ? "agent" : item.type_label === "AI Model" ? "ai_model" : null;
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
    object: { id: item.record_id, name: item.name, type: aiType ?? (application ? "application" : "cloud_service") } as MinEAObject,
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
  /** Catalog objects and relationships for the AI answer (agents and AI models aren't rows). */
  landscape?: { objects: readonly LandscapeObject[]; relationships: readonly LandscapeEdge[] };
}): AskAnswer {
  const question = input.question.trim();
  const q = question.toLowerCase();
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (!question) {
    return empty("unsupported", "Ask a question about your applications, capabilities, or infrastructure.", today);
  }
  if (input.landscape && classifyIntent(question) === "ai") {
    const result = aiLandscape(input.landscape);
    if (isAiDataQuestion(question)) return aiDataAnswer(result, input.landscape, input.rows, input.basePath, today);
    return aiAnswer(result, input.landscape.objects, input.rows, input.basePath, today);
  }
  if (/uptime|invoice|ticket|forecast|opinion/.test(q) || /customer data|sensitive|personal data/.test(q)) {
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
  if (intent === "sign_in") {
    if (input.loading) return { ...empty("sign_in", "Looking up sign-in links…", today), loading: true };
    return signInAnswer(question, input.rows, input.graph, input.basePath, today, input.focusId);
  }
  const wantsSubject = intent === "importance" || intent === "impact" || intent === "cost" || (intent === "ownership" && /who owns/.test(q));
  const resolution = wantsSubject ? resolveSubject(question, input.rows) : { status: "none" as const, matches: [] };
  const focused = input.focusId ? resolution.matches.find((row) => row.id === input.focusId) : undefined;
  if (resolution.status === "many" && !focused) return clarifyAnswer(intent, resolution.matches, today);
  const named = focused ?? (resolution.status === "one" ? resolution.matches[0] : null);

  if (CANCEL_QUESTION.test(q)) return cancelAnswer(input.rows, input.basePath, today);
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
  if (intent === "aging") return agingAnswer(input.rows, input.basePath, today);
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

function aiReportLink(basePath: string): { href: string; label: string } {
  return { href: reportPath(basePath, "ai-landscape"), label: "Open Reports › AI landscape" };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** §8 deterministic AI answer from aiLandscape(): counts per group, the top 3 flags with citations, spend, unreviewed. */
function aiAnswer(result: AiLandscape, objects: readonly LandscapeObject[], rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const link = aiReportLink(basePath);
  const activeAgents = result.agents.filter((agent) => agent.active);
  const platforms = result.platforms.filter((item) => item.counted);
  if (result.places === 0 && result.unreviewed.length === 0) {
    return {
      ...empty("ai", "I don't see any AI in your map yet.", today),
      gaps: [{ text: "Add an AI agent, or check the apps you own for AI features.", fillHref: link.href }],
      followUps: ["What has no owner?", "Where is our money going?", "What renews in the next 90 days?"],
      link,
    };
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const { itemRecord, citeRecord, citations } = aiCiter(result, objects, rows);
  const top: LandscapeFlag[] = result.flags.slice(0, 3);
  const evidence: AskEvidence[] = top.map((flag) => {
    const records = flag.itemIds.map(itemRecord);
    for (const record of records) citeRecord(record.recordId, `${flag.id} ${flag.title}`);
    const names = records.map((record) => record.label).join(", ");
    return { text: `${names}: ${flag.why}`, citationIds: [...new Set(records.map((record) => record.recordId))] };
  });
  for (const flag of result.flags.slice(3)) {
    if (citations.length >= 10) break;
    for (const id of flag.itemIds) citeRecord(itemRecord(id).recordId, `${flag.id} ${flag.title}`);
  }
  const groups = [
    result.features.length ? plural(result.features.length, "feature in your tools", "features in your tools") : "",
    activeAgents.length ? plural(activeAgents.length, "agent", "agents") : "",
    platforms.length ? plural(platforms.length, "AI platform or model", "AI platforms and models") : "",
  ].filter(Boolean);
  const head = result.places
    ? `You use AI in **${plural(result.places, "place", "places")}**: ${joinNames(groups)}.`
    : "No AI is confirmed on your map yet.";
  const flagLine = result.flags.length
    ? `**${plural(result.flags.length, "flag", "flags")}** (${result.highFlags} high)`
    : "No flags";
  const spend = result.spend.total > 0 ? `${formatDollars(result.spend.total)} / yr on AI` : "no AI spend recorded";
  const gaps: { text: string; fillHref: string }[] = [];
  if (result.unreviewed.length) {
    const apps = new Set(result.unreviewed.map((row) => row.hostId)).size;
    gaps.push({ text: `${plural(result.unreviewed.length, "AI feature", "AI features")} on ${plural(apps, "app", "apps")} nobody has confirmed yet.`, fillHref: link.href });
  }
  for (const agent of activeAgents.filter((item) => item.identityGap).slice(0, 3)) {
    gaps.push({ text: `Whose account does ${agent.name} use?`, fillHref: modelItemPath(basePath, "agents", agent.id) });
  }
  const outage = result.platforms.find((item) => item.counted && rowById.has(item.id) && item.usedBy.length > 0);
  return {
    handler: "ai",
    answerText: `${head} ${flagLine}, ${result.unreviewed.length} unreviewed, ${spend}.`,
    citations,
    evidence,
    gaps,
    followUps: [
      ...(outage ? [`What breaks if ${outage.name} goes down?`] : []),
      "Which agents have no owner?",
      "What do we spend on AI?",
    ].slice(0, 3),
    caption: { generatedAt: today, recordCount: citations.length, gapCount: gaps.length },
    link,
  };
}

/** Cites AI items: a feature is cited as the app it is on; agents and AI models get their own rows. */
function aiCiter(result: AiLandscape, objects: readonly LandscapeObject[], rows: CatalogRow[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const itemRecord = (itemId: string) => {
    const feature = result.features.find((item) => item.id === itemId);
    if (feature) return { recordId: feature.hostId, label: `${feature.feature.name} (${feature.hostName})` };
    return { recordId: itemId, label: byId.get(itemId)?.name ?? itemId };
  };
  const citations: AskCitation[] = [];
  const citeRecord = (recordId: string, relationship: string): number => {
    const existing = citations.find((item) => item.recordId === recordId);
    if (existing) {
      if (relationship && !existing.relationship.includes(relationship)) existing.relationship = `${existing.relationship} · ${relationship}`;
      return existing.n;
    }
    const object = byId.get(recordId);
    const agent = result.agents.find((item) => item.id === recordId);
    const row = rowById.get(recordId) ?? aiRow(recordId, object, agent?.owner ?? "");
    citations.push({ n: citations.length + 1, recordId, relationship, row });
    return citations.length;
  };
  return { itemRecord, citeRecord, citations };
}

/**
 * Customer, financial or personal data questions: the F1 rule only (each app's Holds data), so "can see
 * company data" or an agent reading an app is never called customer data. Those are a separate point.
 */
function aiDataAnswer(
  result: AiLandscape,
  landscape: { objects: readonly LandscapeObject[]; relationships: readonly LandscapeEdge[] },
  rows: CatalogRow[],
  basePath: string,
  today: string
): AskAnswer {
  const link = aiReportLink(basePath);
  const access = dataAccess(result, landscape.objects, landscape.relationships);
  const { itemRecord, citeRecord, citations } = aiCiter(result, landscape.objects, rows);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const byId = new Map(landscape.objects.map((object) => [object.id, object]));
  const f1Why = new Map(result.flags.filter((flag) => flag.id === "F1").flatMap((flag) => flag.itemIds.map((id) => [id, flag.why] as const)));
  const flaggedEvidence = (ids: string[], relationship: string): AskEvidence[] =>
    ids.map((id) => {
      const record = itemRecord(id);
      citeRecord(record.recordId, relationship);
      return { text: `${record.label}: ${f1Why.get(id) ?? ""}`.trim(), citationIds: [record.recordId] };
    });
  const evidence: AskEvidence[] = [
    ...flaggedEvidence(access.customer, "F1 Can see customer or financial data"),
    ...flaggedEvidence(access.check, "F1 May see customer or financial data"),
  ];
  let head: string;
  if (access.customer.length) {
    head = `**AI can see customer or financial data in ${plural(access.customer.length, "place", "places")}**, going by what each app's Holds data says.`;
  } else if (access.check.length) {
    head = `**No AI is confirmed to see customer or financial data.** In ${plural(access.check.length, "place", "places")}, AI is on an app that holds it and nobody has said if it can see it.`;
  } else {
    head = "**Nothing recorded holds customer or financial data**, so no AI is flagged as seeing it.";
  }
  if (access.companyOnly.length) {
    const records = access.companyOnly.map(itemRecord);
    for (const record of records) citeRecord(record.recordId, "Can see company data");
    evidence.push({
      text: `Separately, ${joinNames(records.map((record) => record.label))} can see company data. That is not the same as customer data.`,
      citationIds: [...new Set(records.map((record) => record.recordId))],
    });
  }
  const unknownNames = access.noHoldsData.map((id) => byId.get(id)?.name ?? id);
  if (unknownNames.length) {
    for (const id of access.noHoldsData) citeRecord(id, "No Holds data recorded");
    evidence.push({
      text: `${joinNames(unknownNames)} ${unknownNames.length === 1 ? "has" : "have"} no Holds data recorded, so we can't tell if ${unknownNames.length === 1 ? "it holds" : "they hold"} customer data.`,
      citationIds: [...access.noHoldsData],
    });
  }
  const gaps = access.noHoldsData.slice(0, 5).map((id) => {
    const row = rowById.get(id);
    return { text: `Add what ${byId.get(id)?.name ?? id} holds (Holds data).`, fillHref: modelItemPath(basePath, row ? sectionForKind(row.kind) : "applications", id) };
  });
  return {
    handler: "ai",
    answerText: head,
    citations,
    evidence,
    gaps,
    followUps: ["What AI do we use and what can it touch?", "Which agents have no owner?", "What do we spend on AI?"],
    caption: { generatedAt: today, recordCount: citations.length, gapCount: gaps.length },
    link,
  };
}

/** Agents and AI models aren't catalog rows; give them a row that links to their own page. */
function aiRow(recordId: string, object: LandscapeObject | undefined, owner: string): CatalogRow {
  const type = object?.type ?? "application";
  const label = type === "agent" ? "AI Agent" : type === "ai_model" ? "AI Model" : "Item";
  const row = placeholderRow(recordId, object?.name ?? recordId, label);
  return { ...row, object: { ...row.object, type } as MinEAObject, ownerTeam: owner, missing: { ...row.missing, owner: !owner } };
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
      fillHref: modelItemPath(basePath, sectionForKind(target.kind), target.id),
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
    signIn: { candidate: isSignInCandidate(row.object), ownLogin: isOwnLogin(row.object.properties) },
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

export const CANCEL_QUESTION = /\b(cancel|cut costs?|save money|savings?|get rid of|stop paying)\b/i;

/**
 * "What can we cancel?" from the records: items that cost money and have a reason to review —
 * marked retiring, no owner, or a second paid tool from the same vendor. Never a guess about usage.
 */
function cancelAnswer(rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const paid = rows.filter((row) => (row.annualCostNumber ?? 0) > 0);
  const byVendor = new Map<string, number>();
  for (const row of paid) if (row.vendorKey) byVendor.set(row.vendorKey, (byVendor.get(row.vendorKey) ?? 0) + 1);
  const hits = paid
    .map((row) => {
      const why: string[] = [];
      if (["retiring", "deprecated"].includes(row.lifecycle)) why.push("marked Retiring");
      if (!row.ownerTeam && !row.ownerPerson) why.push("no owner");
      if (row.vendorKey && (byVendor.get(row.vendorKey) ?? 0) > 1) why.push(`another paid ${row.vendor} tool`);
      return { row, why };
    })
    .filter((hit) => hit.why.length > 0)
    .sort((a, b) => b.why.length - a.why.length || (b.row.annualCostNumber ?? 0) - (a.row.annualCostNumber ?? 0));
  const total = hits.reduce((sum, hit) => sum + (hit.row.annualCostNumber ?? 0), 0);
  const followUps = ["What has no owner?", "Which vendors do we spend the most with?", "What renews in the next 90 days?"];
  if (!paid.length) {
    return { ...empty("cancel", "No annual costs are recorded yet, so there is nothing to weigh up for cancelling.", today), followUps };
  }
  if (!hits.length) {
    return {
      ...empty("cancel", `Nothing stands out to cancel: all ${paid.length} paid items have an owner, none is marked Retiring, and no vendor has two paid tools.`, today),
      followUps,
    };
  }
  return {
    handler: "cancel",
    answerText: `**${hits.length} paid ${hits.length === 1 ? "item is worth" : "items are worth"} reviewing, ${moneyLabel(total)} a year.** Each has a reason in the records: marked Retiring, no owner, or a second paid tool from the same vendor. Check usage with the owner before cancelling.`,
    citations: [],
    gaps: [],
    followUps,
    table: {
      kind: "cancel",
      columns: ["Item", "Annual cost", "Why review it"],
      rows: hits.map((hit) => ({ label: hit.row.name, value: `${moneyLabel(hit.row.annualCostNumber ?? 0)} a year`, detail: hit.why.join(" · "), recordId: hit.row.id })),
    },
    caption: { generatedAt: today, recordCount: hits.length, gapCount: 0 },
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
    ...vendorBlocks(rows),
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
  // Every vendor is a row (with or without a cost), so the stated vendor count equals the table.
  const everyVendor = vendorRollup(rows);
  const rollup = everyVendor.filter((vendor) => vendor.annual > 0);
  const total = rollup.reduce((sum, vendor) => sum + vendor.annual, 0);
  const top = rollup.slice(0, 3);
  const share = total ? Math.round((top.reduce((sum, vendor) => sum + vendor.annual, 0) / total) * 100) : 0;
  const retiring = rows.find((row) => row.annualCostNumber && ["retiring", "deprecated"].includes(row.lifecycle));
  const citations: AskCitation[] = everyVendor.map((vendor, index) => ({
    n: index + 1,
    recordId: vendor.items[0].id,
    relationship: vendor.annual > 0
      ? `${moneyLabel(vendor.annual)} a year · ${total ? Math.round((vendor.annual / total) * 100) : 0}% of spend · ${vendor.items.map((item) => item.name).join(", ")}`
      : `No annual cost recorded · ${vendor.items.map((item) => item.name).join(", ")}`,
    displayName: vendor.vendor,
    displayType: "Vendor",
    row: { ...vendor.items[0], ownerTeam: "", ownerPerson: "", criticality: "", criticalityLabel: "" },
  }));
  const noCost = everyVendor.length - rollup.length;
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
    ...vendorBlocks(rows),
    handler: "spend",
    answerText: total
      ? `You spend **${moneyLabel(total)} a year** across ${everyVendor.length} ${everyVendor.length === 1 ? "vendor" : "vendors"}${noCost ? ` (${noCost} with no cost recorded)` : ""}.${top.length ? ` **${share}% goes to ${top.length === 1 ? "one vendor" : top.length === 2 ? "two vendors" : "three vendors"}.**` : ""}${saving}`
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
    ...renewalBlocks(hits),
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

/** With nothing in scope there is nothing to check; saying "every item has X" would be false comfort. */
export function nothingRecordedLine(q: string, rows: CatalogRow[]): string {
  const applications = /\bapplications?\b|\bapps?\b/.test(q);
  const infrastructure = /infrastructure|\bservers?\b|\bplatforms?\b/.test(q);
  if (rows.length > 0 && applications && !infrastructure) return "No applications are recorded yet, so there's nothing to check.";
  if (rows.length > 0 && infrastructure && !applications) return "No infrastructure is recorded yet, so there's nothing to check.";
  return "No applications or infrastructure are recorded yet, so there's nothing to check.";
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
      : scope.length === 0
        ? nothingRecordedLine(q, rows)
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
      : rows.length === 0
        ? nothingRecordedLine("", rows)
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

function agingAnswer(rows: CatalogRow[], basePath: string, today: string): AskAnswer {
  const runtimes = rows.filter((row) => row.kind === "runtime");
  const summary = agingSummary(runtimes.map((row) => readRuntimeInfra(row.object)), new Date());
  const shown = summary.items.filter((item) => item.status.severity === "bad" || item.status.severity === "warn");
  const byId = new Map(runtimes.map((row) => [row.id, row]));
  const quiet = summary.outOfSupportOrOs === 0 && summary.endsSoon === 0;
  return {
    handler: "aging",
    answerText: quiet
      ? "Nothing is out of support or ending in the next 90 days."
      : `${summary.outOfSupportOrOs} servers and devices are out of support or on an unsupported operating system, and ${summary.endsSoon} end in the next 90 days.`,
    citations: shown.flatMap((item, index) => {
      const row = item.runtime.id ? byId.get(item.runtime.id) : undefined;
      if (!row) return [];
      return [{ n: index + 1, recordId: row.id, relationship: item.status.reason, row }];
    }),
    gaps: summary.unknown
      ? [{ text: `${summary.unknown} servers and devices have no support date`, fillHref: `${basePath}/model/servers?status=unknown` }]
      : [],
    followUps: ["What goes end of life next year?", "What breaks if the AS400 goes down?", "What has no owner?"],
    caption: { generatedAt: today, recordCount: shown.length, gapCount: summary.unknown },
  };
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
    const href = modelItemPath(basePath, sectionForKind(row.kind), row.id);
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
  if (intent === "sign_in") return `What signs in with ${name}?`;
  return name;
}

function importanceAnswer(target: CatalogRow, rows: CatalogRow[], graph: AskGraph, basePath: string, today: string): AskAnswer {
  const hits = impactOf(graph.nodes, graph.edges, target.id);
  const touching = graph.edges.filter((edge) => edge.fromId === target.id || edge.toId === target.id);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  // A sign-in provider counts its sign-in dependents like direct ones: losing it locks people out.
  const direct = hits.filter((hit) => (hit.severity === "direct" || hit.severity === "loses_sign_in") && !hit.indirect);
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
  const signIn = hits.filter((hit) => hit.severity === "loses_sign_in" && !hit.indirect);
  const capabilities = hits.filter((hit) => nodeById.get(hit.id)?.typeLabel === "Capability");
  const bullets: AskEvidence[] = [];
  if (direct.length) {
    bullets.push({
      text: `${joinNames(direct.map((hit) => hit.name))} ${direct.length === 1 ? "stops" : "stop"} working if ${target.name} goes down.`,
      citationIds: direct.map((hit) => hit.id),
    });
  }
  if (signIn.length) {
    bullets.push({
      text: `${joinNames(signIn.map((hit) => hit.name))} can't sign in if ${target.name} goes down.`,
      citationIds: signIn.map((hit) => hit.id),
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
  return modelItemPath(basePath, sectionForKind(row.kind), row.id);
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

/** Words that say "sign-in question" but never name the item. Stripped before the name lookup. */
const SIGN_IN_FILLER =
  /\b(?:sso|single sign[- ]?on|sign(?:s|ed)?[- ]?in|log(?:s|ged)?[- ]?in|logins?|own|through|via|uses?|using|doesn't|does|don't|do|not|without|no|people|staff|users|employees|we|to|recorded|apps?|platforms?|tools?|everything|anything|everyone)\b/gi;
const SIGN_IN_NOT_RECORDED =
  /\b(?:doesn't|does not|don't|do not|aren't|are not|isn't|is not|not|without|no|missing|lacks?)\b.{0,40}\b(?:sso|single sign|sign[- ]?in|log ?in)|\bown logins?\b|\bno sso\b/;
const SIGN_IN_USERS = /\b(?:what|which|who)\b(?: \w+){0,3} (?:signs?|logs?) ?in (?:with|through|via|using)\b|\buses? .+ for (?:sso|single sign|sign[- ]?in)\b|\bsign-in for\b/;
const SIGN_IN_OWN = /\b(?:what|how) (?:does|do) (?!people|staff|users|we|employees).+ (?:sign|log) ?in\b|\bhow do (?:people|staff|users|we|employees) (?:sign|log) ?in(?:to| to)\b/;

/**
 * Sign-in (single sign-on) answers from Signs in with links:
 * - a named provider: what signs in with it
 * - a named app: what it signs in with, its own login, or nothing recorded
 * - "What doesn't use SSO?": apps with no sign-in recorded, and own-login apps listed apart
 * - otherwise: every provider with what signs in with it
 */
function signInAnswer(question: string, rows: CatalogRow[], graph: AskGraph, basePath: string, today: string, focusId?: string): AskAnswer {
  const q = question.toLowerCase();
  const links = graph.edges.filter((edge) => edge.type === SIGN_IN_EDGE);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const usersOf = new Map<string, string[]>();
  const providersOf = new Map<string, string[]>();
  for (const edge of links) {
    usersOf.set(edge.toId, [...(usersOf.get(edge.toId) ?? []), edge.fromId]);
    providersOf.set(edge.fromId, [...(providersOf.get(edge.fromId) ?? []), edge.toId]);
  }
  const rowOf = (id: string) => rowById.get(id) ?? placeholderRow(id, graph.nodes.find((node) => node.id === id)?.name ?? "Item");
  const byName = (a: CatalogRow, b: CatalogRow) => a.name.localeCompare(b.name);
  const ownLogin = (row: CatalogRow) => isOwnLogin(row.object.properties) && !providersOf.has(row.id);
  const candidates = rows.filter((row) => isSignInCandidate(row.object));
  const ownRows = candidates.filter(ownLogin).sort(byName);
  // Part of a provider (Exchange Online in Microsoft 365) signs in with it by definition.
  const partOfProvider = new Set(graph.edges.filter((edge) => edge.type === "part_of" && usersOf.has(edge.toId)).map((edge) => edge.fromId));
  const notRecorded = candidates
    .filter((row) => !providersOf.has(row.id) && !usersOf.has(row.id) && !partOfProvider.has(row.id) && !ownLogin(row))
    .sort(byName);
  const providers = [...usersOf.keys()].map(rowOf).sort((a, b) => (usersOf.get(b.id)?.length ?? 0) - (usersOf.get(a.id)?.length ?? 0) || byName(a, b));
  const ownSection = (start: number): AskCitation[] =>
    ownRows.slice(0, 12).map((row, index) => ({ n: start + index, recordId: row.id, relationship: OWN_LOGIN_LABEL, section: OWN_LOGIN_LABEL, row }));
  const nothingRecorded = links.length === 0 && ownRows.length === 0;
  const startHere = {
    text: "Open an app, then set Signs in with in Details: pick the app or platform people sign in through, such as Microsoft 365, or Own login (no SSO).",
    fillHref: modelPath(basePath, "applications"),
  };

  if (SIGN_IN_NOT_RECORDED.test(q)) {
    if (nothingRecorded) {
      return {
        ...empty("sign_in", "No sign-in is recorded yet, so I can't tell which apps use single sign-on.", today),
        gaps: [{ ...startHere, fillHref: notRecorded[0] ? itemHref(basePath, notRecorded[0]) : startHere.fillHref }],
        followUps: ["What has no owner?", "What renews in the next 90 days?", "Where is our money going?"],
      };
    }
    const shown = notRecorded.slice(0, 12);
    const citations: AskCitation[] = [
      ...shown.map((row, index) => ({ n: index + 1, recordId: row.id, relationship: "No sign-in recorded", section: "No sign-in recorded", row })),
      ...ownSection(shown.length + 1),
    ];
    const head = notRecorded.length
      ? `**${describeTypes(typeLabels(notRecorded))} ${notRecorded.length === 1 ? "has" : "have"} no sign-in recorded**: ${joinNames(notRecorded.map((row) => row.name))}.`
      : "**Every app and platform in use has sign-in recorded.**";
    const own = ownRows.length
      ? ` ${joinNames(ownRows.map((row) => row.name))} ${ownRows.length === 1 ? "has its" : "have their"} own login (no SSO).`
      : "";
    return {
      handler: "sign_in",
      answerText: `${head}${own}`,
      citations,
      gaps: shown.slice(0, 6).map((row) => ({ text: `${row.name}: set Signs in with, or Own login (no SSO).`, fillHref: itemHref(basePath, row) })),
      followUps: providers[0]
        ? [`What signs in with ${providers[0].name}?`, `What breaks if ${providers[0].name} goes down?`, "What has no owner?"]
        : ["What has no owner?", "What renews in the next 90 days?", "Where is our money going?"],
      caption: { generatedAt: today, recordCount: citations.length, gapCount: notRecorded.length },
    };
  }

  const stripped = question.replace(SIGN_IN_FILLER, " ");
  const resolution = resolveSubject(stripped, rows);
  const providerMatches = resolution.matches.filter((row) => usersOf.has(row.id));
  const focused = focusId ? resolution.matches.find((row) => row.id === focusId) : undefined;
  const matches = focused ? [focused] : providerMatches.length === 1 ? providerMatches : resolution.matches;
  if (matches.length > 1) return clarifyAnswer("sign_in", matches, today);
  const named = matches[0];

  const wantsUsers = named ? !SIGN_IN_OWN.test(q) && (SIGN_IN_USERS.test(q) || usersOf.has(named.id)) : false;
  if (named && !wantsUsers) {
    const through = (providersOf.get(named.id) ?? []).map(rowOf).sort(byName);
    if (through.length) {
      return {
        handler: "sign_in",
        answerText: `${named.name} [1] signs in with **${joinNames(through.map((row) => row.name))}**.`,
        citations: [
          { n: 1, recordId: named.id, relationship: `Signs in with ${joinNames(through.map((row) => row.name))}`, row: named },
          ...through.map((row, index) => ({ n: index + 2, recordId: row.id, relationship: `Sign-in for ${named.name}`, row })),
        ],
        gaps: [],
        followUps: [`What breaks if ${through[0].name} goes down?`, `What signs in with ${through[0].name}?`, "What doesn't use single sign-on?"],
        caption: { generatedAt: today, recordCount: through.length + 1, gapCount: 0 },
      };
    }
    const own = ownLogin(named);
    return {
      handler: "sign_in",
      answerText: own
        ? `${named.name} [1] has its own login (no SSO).`
        : `No sign-in is recorded for ${named.name} [1].`,
      citations: [{ n: 1, recordId: named.id, relationship: own ? OWN_LOGIN_LABEL : "No sign-in recorded", row: named }],
      gaps: own ? [] : [{ text: `${named.name}: set Signs in with, or Own login (no SSO).`, fillHref: itemHref(basePath, named) }],
      followUps: ["What doesn't use single sign-on?", `What breaks if ${named.name} goes down?`, `Who owns ${named.name}?`],
      caption: { generatedAt: today, recordCount: 1, gapCount: own ? 0 : 1 },
    };
  }

  if (named) {
    const users = (usersOf.get(named.id) ?? []).map(rowOf).sort(byName);
    if (users.length === 0) {
      return {
        ...empty("sign_in", `Nothing in your model signs in with ${named.name} [1] yet.`, today),
        citations: [{ n: 1, recordId: named.id, relationship: "No sign-in links", row: named }],
        gaps: [{ ...startHere, text: `Open each app people sign in to with ${named.name}, then set Signs in with to ${named.name} in Details.` }],
        followUps: ["What doesn't use single sign-on?", `What breaks if ${named.name} goes down?`, `Who owns ${named.name}?`],
        caption: { generatedAt: today, recordCount: 1, gapCount: 1 },
      };
    }
    const citations: AskCitation[] = users.slice(0, 20).map((row, index) => ({
      n: index + 1,
      recordId: row.id,
      relationship: `Signs in with ${named.name}`,
      row,
    }));
    return {
      handler: "sign_in",
      answerText: `**${describeTypes(typeLabels(users))} ${users.length === 1 ? "signs" : "sign"} in with ${named.name}**: ${joinNames(users.map((row) => row.name))}.`,
      citations,
      gaps: notRecorded.length
        ? [{ text: `${notRecorded.length === 1 ? "1 app has" : `${notRecorded.length} apps have`} no sign-in recorded, so this list may be short.`, fillHref: itemHref(basePath, notRecorded[0]) }]
        : [],
      followUps: [`What breaks if ${named.name} goes down?`, "What doesn't use single sign-on?", `Who owns ${named.name}?`],
      caption: { generatedAt: today, recordCount: citations.length, gapCount: notRecorded.length ? 1 : 0 },
    };
  }

  if (nothingRecorded) {
    return {
      ...empty("sign_in", "No sign-in is recorded yet.", today),
      gaps: [startHere],
      followUps: ["What has no owner?", "What renews in the next 90 days?", "Where is our money going?"],
    };
  }
  const citations: AskCitation[] = [];
  for (const provider of providers) {
    for (const row of (usersOf.get(provider.id) ?? []).map(rowOf).sort(byName)) {
      citations.push({ n: citations.length + 1, recordId: row.id, relationship: `Signs in with ${provider.name}`, section: `Signs in with ${provider.name}`, row });
    }
  }
  citations.push(...ownSection(citations.length + 1));
  const signedIn = new Set(links.map((edge) => edge.fromId)).size;
  const byProvider = providers.map((provider) => `${usersOf.get(provider.id)?.length ?? 0} with ${provider.name}`);
  const head = signedIn
    ? `**${signedIn === 1 ? "1 app or platform signs" : `${signedIn} apps and platforms sign`} in through single sign-on**: ${joinNames(byProvider)}.`
    : "**No app signs in through single sign-on yet.**";
  const own = ownRows.length ? ` ${ownRows.length === 1 ? "1 has its" : `${ownRows.length} have their`} own login (no SSO).` : "";
  const unknown = notRecorded.length ? ` ${notRecorded.length === 1 ? "1 has" : `${notRecorded.length} have`} no sign-in recorded.` : "";
  return {
    handler: "sign_in",
    answerText: `${head}${own}${unknown}`,
    citations,
    gaps: notRecorded.length
      ? [{ text: `${notRecorded.length === 1 ? "1 app has" : `${notRecorded.length} apps have`} no sign-in recorded. Ask “What doesn't use single sign-on?” for the list.`, fillHref: itemHref(basePath, notRecorded[0]) }]
      : [],
    followUps: providers[0]
      ? [`What breaks if ${providers[0].name} goes down?`, "What doesn't use single sign-on?", `What signs in with ${providers[0].name}?`]
      : ["What doesn't use single sign-on?", "What has no owner?", "Where is our money going?"],
    caption: { generatedAt: today, recordCount: citations.length, gapCount: notRecorded.length ? 1 : 0 },
  };
}
