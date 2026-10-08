/**
 * Sample data and pure helpers for the home page Ask demo.
 *
 * Everything here is static: the demo never calls an API. Meridian Fasteners is a
 * fictional company, and all names and numbers are sample data.
 */

export type Criticality = "Critical" | "High" | "Medium" | "Low";

export interface DemoRecord {
  name: string;
  type: string;
  /** "" means "no owner" (shown as a gap); undefined means not applicable. */
  owner?: string;
  crit?: Criticality;
  cost?: string;
  vendor?: string;
  renew?: string;
  links?: string;
}

const RECORD_DATA = {
  m365: { name: "Microsoft 365", type: "Platform · Productivity suite", owner: "IT Ops · Priya Shah", crit: "Critical", cost: "$138,000/yr", vendor: "Microsoft", links: "Exchange Online, SharePoint, Teams · Sign-in for Salesforce, NetSuite" },
  exchange: { name: "Exchange Online", type: "Application · Email", owner: "IT Ops", crit: "Critical", vendor: "Microsoft" },
  salesforce: { name: "Salesforce", type: "Application · CRM", owner: "Sales Ops · Marco Ruiz", crit: "Critical", cost: "$96,000/yr", vendor: "Salesforce", renew: "Dec 18, 2026 · 60-day notice" },
  netsuite: { name: "NetSuite", type: "Application · ERP", owner: "Finance · Dana Lee", crit: "Critical", cost: "$118,000/yr", vendor: "Oracle", renew: "Mar 1, 2027" },
  zendesk: { name: "Zendesk", type: "Application · Customer service", owner: "Customer Service · Ana Costa", crit: "Medium", cost: "$18,200/yr", vendor: "Zendesk", renew: "Oct 31, 2026 · auto-renews" },
  invoice: { name: "Invoice Reader", type: "AI agent · Power Automate + Azure OpenAI", owner: "Finance · Dana Lee", crit: "Medium", cost: "$4,800/yr", links: "Reads the AP inbox, writes bills to NetSuite" },
  sharepoint: { name: "SharePoint", type: "Application · Files (part of Microsoft 365)", owner: "", crit: "Medium", vendor: "Microsoft" },
  shopify: { name: "Shopify Plus", type: "Application · B2B web store", owner: "E-commerce · Jess Park", crit: "High", cost: "$27,600/yr", vendor: "Shopify", renew: "Jan 2, 2027 · notice not recorded" },
  mulesoft: { name: "Mulesoft", type: "Platform · Integration", owner: "", crit: "Critical", cost: "$52,000/yr", vendor: "Salesforce", renew: "Dec 1, 2026 · 30-day notice" },
  edi: { name: "EDI Gateway", type: "Application · Partner orders", owner: "", crit: "Critical", vendor: "Built in-house", links: "Runs on AS400, sends orders through Mulesoft" },
  snowflake: { name: "Snowflake", type: "Platform · Data warehouse", owner: "", crit: "High", cost: "$64,000/yr", vendor: "Snowflake" },
  as400: { name: "AS400 (IBM i)", type: "Server · On-prem", owner: "Infrastructure · Tom Reyes", crit: "Critical", cost: "$41,000/yr support", vendor: "IBM" },
  salesasst: { name: "Sales Assistant", type: "AI agent · Copilot Studio · Live", owner: "", crit: "Medium", vendor: "Microsoft", links: "Reads Salesforce accounts and opportunities" },
  copilot: { name: "Microsoft 365 Copilot", type: "AI feature in Microsoft 365 · On", owner: "IT Ops", cost: "$54,000/yr · 150 seats", vendor: "Microsoft" },
  agentforce: { name: "Agentforce", type: "AI feature in Salesforce · On", owner: "Sales Ops", vendor: "Salesforce" },
  zendeskai: { name: "Zendesk AI agents", type: "AI feature in Zendesk · Piloting", owner: "Customer Service", vendor: "Zendesk" },
  prt01: { name: "PRT-01", type: "Server · Label printing", owner: "", crit: "Low" },
  q2o: { name: "Quote-to-order flow", type: "Integration · runs on Mulesoft", owner: "Sales Ops", crit: "Critical", links: "Salesforce → Mulesoft → NetSuite" },
  ibm: { name: "IBM", type: "Vendor · AS400 support", cost: "$41,000/yr" },
  others: { name: "10 other vendors", type: "Adobe, Atlassian, DocuSign and 7 more", cost: "$57,200/yr" },
} satisfies Record<string, DemoRecord>;

export type RecordId = keyof typeof RECORD_DATA;

export const RECORDS: Record<RecordId, DemoRecord> = RECORD_DATA;

export function record(id: RecordId): DemoRecord {
  return RECORDS[id];
}

export interface ImpactRow { id: RecordId; how: string; why: string; sev: Criticality }
export interface RenewalRow {
  id: RecordId; mon: string; day: string; sub: string; amt: string; note: string;
  warn?: boolean; soon?: boolean; gap?: boolean;
}
export interface SpendRow { id: RecordId; label: string; sub?: string; val: number; top?: boolean; other?: boolean }
export interface AiRow {
  id: RecordId; agent?: boolean; sub: string; sees: "yes" | "unk"; what: string;
  flags: Array<["high" | "check", string]>;
}

export type Visual =
  | { kind: "impact"; rows: ImpactRow[] }
  | { kind: "renewals"; rows: RenewalRow[]; total: string }
  | { kind: "spend"; max: number; rows: SpendRow[] }
  | { kind: "owners"; rows: RecordId[] }
  | { kind: "ai"; rows: AiRow[] };

/**
 * Answer text mini-format: **bold**, {id} = record link plus its source number,
 * {=id} = source number only, [label](#anchor) = in-page link.
 */
export interface DemoAnswer {
  q: string;
  cites: RecordId[];
  text: string;
  meta: string;
  vis: Visual;
  fix?: { id: RecordId; owner: string };
  ctx?: string;
  gaps: string[];
}

export const ANSWERS = {
  m365: {
    q: "What breaks if Microsoft 365 goes down?",
    cites: ["m365", "exchange", "salesforce", "netsuite", "zendesk", "invoice"],
    text: "If {m365} goes down, **5 things stop or slow down, 3 of them critical**: email{=exchange} stops, {salesforce} and {netsuite} can’t sign in (they sign in with Microsoft 365), and {zendesk} and the {invoice} agent stop getting mail.",
    meta: "6 records · 2 gaps",
    vis: {
      kind: "impact",
      rows: [
        { id: "exchange", how: "Stops", why: "part of Microsoft 365", sev: "Critical" },
        { id: "salesforce", how: "Can’t sign in", why: "signs in with Microsoft 365", sev: "Critical" },
        { id: "netsuite", how: "Can’t sign in", why: "signs in with Microsoft 365", sev: "Critical" },
        { id: "zendesk", how: "New tickets stop", why: "gets support@ mail from Exchange", sev: "Medium" },
        { id: "invoice", how: "Stops", why: "reads the AP inbox in Outlook", sev: "Medium" },
      ],
    },
    gaps: [
      "SharePoint has no owner, so nobody is on point if shared files go down.",
      "Shopify Plus: we don’t know how staff sign in, so it may be affected too.",
    ],
  },
  renewals: {
    q: "What renews in the next 90 days?",
    cites: ["salesforce", "zendesk", "mulesoft", "shopify"],
    text: "**4 contracts renew in the next 90 days, worth $193,800 a year.** The first notice deadline is {salesforce}, in 12 days.",
    meta: "4 records · 2 gaps",
    vis: {
      kind: "renewals",
      rows: [
        { id: "zendesk", mon: "OCT", day: "31", sub: "Customer Service · auto-renews", amt: "$18,200", note: "No notice needed" },
        { id: "mulesoft", mon: "DEC", day: "1", sub: "No owner", amt: "$52,000", note: "Notice by Nov 1" },
        { id: "salesforce", mon: "DEC", day: "18", sub: "Sales Ops · 60-day notice", amt: "$96,000", note: "Notice by Oct 19 · 12 days", warn: true, soon: true },
        { id: "shopify", mon: "JAN", day: "2", sub: "E-commerce · 2027", amt: "$27,600", note: "Notice period missing", gap: true },
      ],
      total: "$193,800",
    },
    gaps: [
      "Shopify Plus has no notice period recorded.",
      "Mulesoft has no owner, so nobody is on point for the renewal.",
    ],
  },
  spend: {
    q: "Where is our money going?",
    cites: ["m365", "netsuite", "salesforce", "snowflake", "mulesoft", "ibm", "shopify", "zendesk"],
    text: "**You track $612,000 a year across 18 vendors.** Three of them, {m365}, {netsuite} and {salesforce}, take 58% of it.",
    meta: "8 records · 1 gap",
    vis: {
      kind: "spend",
      max: 138000,
      rows: [
        { id: "m365", label: "Microsoft 365", sub: "incl. Copilot", val: 138000, top: true },
        { id: "netsuite", label: "NetSuite", val: 118000, top: true },
        { id: "salesforce", label: "Salesforce", val: 96000, top: true },
        { id: "snowflake", label: "Snowflake", val: 64000 },
        { id: "mulesoft", label: "Mulesoft", val: 52000 },
        { id: "ibm", label: "IBM", sub: "AS400", val: 41000 },
        { id: "shopify", label: "Shopify Plus", val: 27600 },
        { id: "zendesk", label: "Zendesk", val: 18200 },
        { id: "others", label: "10 others", val: 57200, other: true },
      ],
    },
    gaps: ["3 apps have no yearly cost yet, so the real total is higher."],
  },
  owners: {
    q: "What has no owner?",
    cites: ["edi", "mulesoft", "snowflake", "salesasst", "sharepoint", "prt01"],
    text: "**6 things have no owner, and 2 are critical**: {edi} and {mulesoft}. Both sit on the order path from customers to NetSuite.",
    meta: "6 records",
    vis: { kind: "owners", rows: ["edi", "mulesoft", "snowflake", "salesasst", "sharepoint", "prt01"] },
    fix: { id: "edi", owner: "Integration Team" },
    ctx: "Sales Assistant can see customer data, so it’s also a high flag in AI landscape.",
    gaps: [],
  },
  ai: {
    q: "Which AI can see customer data?",
    cites: ["salesasst", "copilot", "agentforce", "zendeskai", "invoice"],
    text: "**3 AI tools can see customer data, and 1 more might.** Start with {salesasst}: it reads Salesforce and has no owner.",
    meta: "5 records · 1 gap",
    vis: {
      kind: "ai",
      rows: [
        { id: "salesasst", agent: true, sub: "Agent · Copilot Studio · Live", sees: "yes", what: "Salesforce accounts, opportunities", flags: [["high", "Can see customer data"], ["high", "Agent has no owner"]] },
        { id: "copilot", sub: "AI feature in Microsoft 365 · 150 seats", sees: "yes", what: "Outlook, SharePoint, Teams", flags: [["high", "Can see customer data"]] },
        { id: "agentforce", sub: "AI feature in Salesforce", sees: "yes", what: "accounts, cases, quotes", flags: [["high", "Can see customer data"]] },
        { id: "zendeskai", sub: "AI feature in Zendesk · Piloting", sees: "unk", what: "support tickets", flags: [["check", "Check: can see customer data"], ["check", "Vendor may train on your data"]] },
      ],
    },
    ctx: "{invoice} sees supplier invoices, which is financial data, not customer data. It’s listed in [AI landscape](#reports).",
    gaps: ["Zendesk AI agents: nobody has confirmed whether it can read tickets."],
  },
  salesforce: {
    q: "What breaks if Salesforce goes down?",
    cites: ["salesforce", "q2o", "shopify", "salesasst", "snowflake"],
    text: "If {salesforce} goes down, **4 things stop or slow down, 1 of them critical**: won quotes stop reaching NetSuite through the {q2o}, {shopify} prices go stale, and the {salesasst} agent stops.",
    meta: "5 records · 1 gap",
    vis: {
      kind: "impact",
      rows: [
        { id: "q2o", how: "Stops", why: "sends won quotes to NetSuite", sev: "Critical" },
        { id: "shopify", how: "Prices go stale", why: "price lists sync nightly from Salesforce", sev: "High" },
        { id: "salesasst", how: "Stops", why: "reads accounts and opportunities", sev: "Medium" },
        { id: "snowflake", how: "Dashboards go stale", why: "nightly sales load", sev: "Low" },
      ],
    },
    gaps: ["Salesforce has no workaround recorded for taking orders by hand."],
  },
} satisfies Record<string, DemoAnswer>;

export type AnswerKey = keyof typeof ANSWERS;

export const ANSWER_KEYS = Object.keys(ANSWERS) as AnswerKey[];

/** The question the hero animates on load. */
export const FIRST_QUESTION: AnswerKey = "m365";

export function answer(key: AnswerKey): DemoAnswer {
  return ANSWERS[key];
}

export function isAnswerKey(value: unknown): value is AnswerKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ANSWERS, value);
}

/** The five "Try a question" chips under the hero, in display order. */
export const TRY_CHIPS: AnswerKey[] = ["renewals", "spend", "owners", "ai", "salesforce"];

export const THINK_STEPS = [
  "Reading your question",
  "Looking up applications, capabilities, and infrastructure",
  "Checking the answer against those results",
] as const;

export const DEMO_NOTES = {
  save: "Saved to Reports › Saved from Ask (demo)",
  export: "Exported the answer and its sources to CSV (demo)",
  share: "Share link copied (demo)",
  yes: "Thanks for the feedback",
  no: "Thanks. Tell us what was wrong.",
  fill: "In BuboMap this opens the field to fill in.",
  how: "Every number and name above comes from records in this workspace. The AI picks the lookups; the math is done in code.",
  addowner: "In BuboMap you can type an owner right here.",
  openfull: "In BuboMap this opens the full record.",
  setowner: "Owner set to Integration Team (demo)",
} as const;

export type DemoAction = keyof typeof DEMO_NOTES;

/** Route a free-typed question to one of the sample answers, or null if the demo can't answer it. */
export function routeQuestion(question: string): AnswerKey | null {
  const s = question.toLowerCase();
  if (/renew|contract|expir|notice/.test(s)) return "renewals";
  if (/spend|cost|money|budget|pay|vendor/.test(s)) return "spend";
  if (/\bai\b|copilot|agent|gpt|llm|customer data/.test(s)) return "ai";
  if (/owner|\bown\b|nobody/.test(s)) return "owners";
  if (/salesforce|crm/.test(s)) return "salesforce";
  if (/365|m365|microsoft|outlook|email|entra/.test(s)) return "m365";
  return null;
}

/** Source number for a record in an answer (1-based), or 0 if it isn't cited. */
export function citeNumber(a: DemoAnswer, id: RecordId): number {
  return a.cites.indexOf(id) + 1;
}

export type Segment =
  | { t: "text"; v: string }
  | { t: "strong"; children: Segment[] }
  | { t: "rec"; id: RecordId; n: number }
  | { t: "cite"; id: RecordId; n: number }
  | { t: "link"; href: string; label: string };

function inlineSegments(a: DemoAnswer, s: string): Segment[] {
  const out: Segment[] = [];
  const re = /\{(=?)(\w+)\}|\[([^\]]+)\]\((#[\w-]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[2] !== undefined) {
      const id = m[2] as RecordId;
      if (!(id in RECORDS)) throw new Error(`Unknown demo record: ${id}`);
      out.push({ t: m[1] ? "cite" : "rec", id, n: citeNumber(a, id) });
    } else {
      out.push({ t: "link", label: m[3]!, href: m[4]! });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

/** Parse the answer mini-format into render segments. */
export function parseRich(a: DemoAnswer, s: string): Segment[] {
  const parts = s.split("**");
  const out: Segment[] = [];
  parts.forEach((part, i) => {
    if (!part) return;
    const segs = inlineSegments(a, part);
    if (i % 2 === 1) out.push({ t: "strong", children: segs });
    else out.push(...segs);
  });
  return out;
}

/** Plain text of an answer's prose, e.g. for tests and accessible summaries. */
export function plainText(a: DemoAnswer, s: string): string {
  const flat = (segs: Segment[]): string =>
    segs
      .map((x) =>
        x.t === "text" ? x.v
        : x.t === "strong" ? flat(x.children)
        : x.t === "rec" ? RECORDS[x.id].name
        : x.t === "cite" ? ""
        : x.label,
      )
      .join("");
  return flat(parseRich(a, s));
}

export function spendPercent(val: number, max: number): number {
  return Math.max(3, Math.round((val / max) * 100));
}

export function spendLabel(val: number): string {
  return `$${(val / 1000).toFixed(val % 1000 ? 1 : 0)}K`;
}

/**
 * Reveal plan: the order the answer builds up in when animated. Each entry is one
 * step; "row" steps are table rows that fade in faster than whole blocks. The answer
 * renderer numbers its elements in exactly this order.
 */
export type RevealStep = "block" | "row";

export function revealPlan(a: DemoAnswer): RevealStep[] {
  const steps: RevealStep[] = ["block", "block"]; // text, meta
  const v = a.vis;
  if (v.kind === "impact" || v.kind === "owners") {
    steps.push("block", ...v.rows.map(() => "row" as const));
    if (v.kind === "owners") steps.push("block"); // fix
  } else if (v.kind === "renewals") {
    steps.push(...v.rows.map(() => "block" as const), "block"); // rows, total
  } else if (v.kind === "spend") {
    steps.push("block", "block"); // bars, legend
  } else {
    steps.push(...v.rows.map(() => "block" as const));
  }
  if (a.ctx) steps.push("block");
  steps.push("block"); // sources
  if (a.gaps.length) steps.push("block");
  steps.push("block"); // footer
  return steps;
}

/** Delay after revealing step i, matching the mockup's timings. */
export function revealDelay(step: RevealStep, index: number, slow: boolean): number {
  if (step === "row") return slow ? 170 : 70;
  if (slow) return index === 0 ? 650 : 300;
  return 110;
}

/* ---------------- demo state (pure, so it can be unit-tested) ---------------- */

export type DemoPhase = "intro" | "typing" | "thinking" | "reveal" | "static" | "note";

export interface DemoState {
  /** Answer currently in the panel; null while showing the "demo only knows a few questions" note. */
  key: AnswerKey | null;
  phase: DemoPhase;
  typed: string;
  think: number;
  revealed: number;
  status: string;
  pressed: boolean;
}

/** Server-rendered state: the first answer is laid out (so nothing shifts) but hidden until it animates. */
export const INITIAL_DEMO_STATE: DemoState = {
  key: FIRST_QUESTION,
  phase: "intro",
  typed: "",
  think: 0,
  revealed: 0,
  status: "",
  pressed: false,
};

export type DemoEvent =
  | { type: "show"; key: AnswerKey }
  | { type: "start"; key: AnswerKey }
  | { type: "type"; text: string }
  | { type: "press"; on: boolean }
  | { type: "think"; step: number }
  | { type: "reveal"; count: number }
  | { type: "finish" }
  | { type: "note"; question: string }
  | { type: "edit"; text: string };

export function demoReducer(state: DemoState, ev: DemoEvent): DemoState {
  switch (ev.type) {
    case "show":
      return { key: ev.key, phase: "static", typed: ANSWERS[ev.key].q, think: 0, revealed: 0, status: "", pressed: false };
    case "start":
      return { key: ev.key, phase: "typing", typed: "", think: 0, revealed: 0, status: "", pressed: false };
    case "type":
      return { ...state, typed: ev.text };
    case "press":
      return { ...state, pressed: ev.on };
    case "think":
      return state.key
        ? { ...state, phase: "thinking", think: ev.step, status: `Working on “${ANSWERS[state.key].q}”`, pressed: false }
        : state;
    case "reveal":
      return { ...state, phase: "reveal", revealed: ev.count, status: "" };
    case "finish":
      return state.key ? { ...state, phase: "static", status: "", pressed: false } : state;
    case "note":
      return { key: null, phase: "note", typed: ev.question, think: 0, revealed: 0, status: "", pressed: false };
    case "edit":
      // Typing over a running demo stops it and shows the full current answer.
      if (state.phase === "static" || state.phase === "note") return { ...state, typed: ev.text };
      return { ...state, typed: ev.text, phase: state.key ? "static" : "note", status: "", pressed: false };
  }
}

/** Whether the panel is mid-animation (answer parts hidden until revealed). */
export function isAnimating(state: DemoState): boolean {
  return state.phase === "intro" || state.phase === "typing" || state.phase === "thinking" || state.phase === "reveal";
}

/** Whether the thinking overlay covers the answer area. */
export function showsThinking(state: DemoState): boolean {
  return state.phase === "intro" || state.phase === "typing" || state.phase === "thinking";
}

/** Event other sections dispatch on window to run a question in the hero demo. */
export const ASK_EVENT = "bubomap:ask-demo";
