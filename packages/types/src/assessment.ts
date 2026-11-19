/**
 * Assessment score shapes, 1–5 descriptors, derivation, and roll-up.
 *
 * Functional scores live on supported_by.attributes.functional_assessment.
 * Non-functional scores live on application (or cloud_service) properties.nonfunctional_assessment.
 * No migration: both are JSON. Evidence is notes and links only.
 *
 * Descriptors: ./assessment-descriptors.json (API keeps a byte-for-byte copy).
 */
import descriptors from "./assessment-descriptors.json";

export const FUNCTIONAL_DIMENSIONS = [
  "coverage",
  "effectiveness",
  "user_sentiment",
  "automation",
  "data_reporting",
  "regional_fit",
] as const;
export type FunctionalDimension = (typeof FUNCTIONAL_DIMENSIONS)[number];

export const NONFUNCTIONAL_DIMENSIONS = [
  "resilience",
  "performance_usability",
  "security",
  "integration",
  "maintainability",
  "vendor_lifecycle",
  "cost",
  "strategic_fit",
] as const;
export type NonfunctionalDimension = (typeof NONFUNCTIONAL_DIMENSIONS)[number];

export const CONFIDENCES = ["H", "M", "L"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const REGIONAL_SCOPES = ["us", "canada", "both"] as const;
export type RegionalScope = (typeof REGIONAL_SCOPES)[number];

export const EVIDENCE_KINDS = ["note", "link"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ASSESSMENT_SCORES = [1, 2, 3, 4, 5] as const;
export type AssessmentScore = (typeof ASSESSMENT_SCORES)[number];

export type DerivedFitness = "strong" | "adequate" | "weak";

export type AssessmentEvidence = {
  kind: EvidenceKind;
  text?: string;
  url?: string;
};

export type DimensionScore = {
  score: AssessmentScore;
  confidence: Confidence;
  evidence: AssessmentEvidence[];
};

export type FunctionalAssessment = {
  scores: Partial<Record<FunctionalDimension, DimensionScore>>;
  gaps: string[];
  regional_scope: RegionalScope | null;
};

export type NonfunctionalAssessment = {
  scores: Partial<Record<NonfunctionalDimension, DimensionScore>>;
};

export type CoverageComputed = {
  supported: number;
  total: number;
  percent: number;
  score: AssessmentScore;
};

export type DimensionDescriptor = {
  key: string;
  label: string;
  short: string;
  anchors: Record<AssessmentScore, string>;
};

const TEXT_MAX = 4000;
const GAP_MAX = 2000;
const GAP_LIMIT = 50;
const EVIDENCE_LIMIT = 20;
const URL_MAX = 2000;

type RawDim = { label: string; short: string; anchors: Record<string, string>; coverage_bands?: { min: number; max: number; score: number }[] };
const FUNCTIONAL_RAW = descriptors.functional as Record<FunctionalDimension, RawDim>;
const NONFUNCTIONAL_RAW = descriptors.nonfunctional as Record<NonfunctionalDimension, RawDim>;

export const ASSESSMENT_DESCRIPTORS = descriptors;

export function functionalDescriptor(key: FunctionalDimension): DimensionDescriptor {
  return toDescriptor(key, FUNCTIONAL_RAW[key]);
}

export function nonfunctionalDescriptor(key: NonfunctionalDimension): DimensionDescriptor {
  return toDescriptor(key, NONFUNCTIONAL_RAW[key]);
}

export function functionalDescriptors(): DimensionDescriptor[] {
  return FUNCTIONAL_DIMENSIONS.map(functionalDescriptor);
}

export function nonfunctionalDescriptors(): DimensionDescriptor[] {
  return NONFUNCTIONAL_DIMENSIONS.map(nonfunctionalDescriptor);
}

function toDescriptor(key: string, raw: RawDim): DimensionDescriptor {
  return {
    key,
    label: raw.label,
    short: raw.short,
    anchors: {
      1: raw.anchors["1"],
      2: raw.anchors["2"],
      3: raw.anchors["3"],
      4: raw.anchors["4"],
      5: raw.anchors["5"],
    },
  };
}

export function parseAssessmentScore(raw: unknown): AssessmentScore | null {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  return value as AssessmentScore;
}

export function parseConfidence(raw: unknown): Confidence | null {
  const value = String(raw ?? "").trim().toUpperCase();
  return (CONFIDENCES as readonly string[]).includes(value) ? (value as Confidence) : null;
}

export function parseRegionalScope(raw: unknown): RegionalScope | null {
  const value = String(raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (value === "united states" || value === "usa" || value === "u.s." || value === "u.s") return "us";
  if (value === "ca") return "canada";
  return (REGIONAL_SCOPES as readonly string[]).includes(value) ? (value as RegionalScope) : null;
}

export function confidenceLabel(value: Confidence): string {
  return value === "H" ? "High" : value === "M" ? "Medium" : "Low";
}

export function regionalScopeLabel(value: RegionalScope | null): string {
  if (value === "us") return "US";
  if (value === "canada") return "Canada";
  if (value === "both") return "Both";
  return "";
}

export function coverageScoreFromPercent(percent: number): AssessmentScore {
  const bands = FUNCTIONAL_RAW.coverage.coverage_bands ?? [];
  const clamped = Math.max(0, Math.min(100, percent));
  for (const band of bands) {
    if (clamped >= band.min && clamped <= band.max) return band.score as AssessmentScore;
  }
  return 1;
}

export function computeCoverage(supported: number, total: number): CoverageComputed | null {
  if (!Number.isFinite(supported) || !Number.isFinite(total) || total <= 0) return null;
  const safeSupported = Math.max(0, Math.min(total, Math.floor(supported)));
  const percent = Math.round((100 * safeSupported) / total);
  return { supported: safeSupported, total, percent, score: coverageScoreFromPercent(percent) };
}

/**
 * Linked process steps = every stage of a process that mentions `activityId`
 * in at least one stage. A stage is supported by an app when any of its
 * capability_ids has a supported_by link to that app.
 */
export function computeAppProcessCoverage(
  appId: string,
  activityId: string,
  processes: readonly { stages?: readonly { capability_ids?: readonly string[] }[] }[],
  edges: readonly { type?: string; from_object_id?: string; to_object_id?: string }[],
): CoverageComputed | null {
  const supportedCaps = new Set<string>();
  for (const edge of edges) {
    if (edge.type !== "supported_by") continue;
    if (edge.to_object_id === appId && edge.from_object_id) supportedCaps.add(edge.from_object_id);
  }
  const stages: { capability_ids?: readonly string[] }[] = [];
  for (const process of processes) {
    const list = process.stages ?? [];
    if (!list.some((stage) => (stage.capability_ids ?? []).includes(activityId))) continue;
    for (const stage of list) {
      if ((stage.capability_ids ?? []).length) stages.push(stage);
    }
  }
  if (!stages.length) return null;
  let supported = 0;
  for (const stage of stages) {
    if ((stage.capability_ids ?? []).some((id) => supportedCaps.has(id))) supported += 1;
  }
  return computeCoverage(supported, stages.length);
}

export function weakestScore(values: readonly (number | null | undefined)[]): AssessmentScore | null {
  const scored = values.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5);
  if (!scored.length) return null;
  return Math.min(...scored) as AssessmentScore;
}

export function fitnessFromScores(values: readonly (number | null | undefined)[]): DerivedFitness | null {
  const weakest = weakestScore(values);
  if (weakest == null) return null;
  if (weakest <= 2) return "weak";
  if (weakest === 3) return "adequate";
  return "strong";
}

export function dimensionScoresOf(
  assessment: FunctionalAssessment | NonfunctionalAssessment | null | undefined,
): AssessmentScore[] {
  if (!assessment) return [];
  const values: AssessmentScore[] = [];
  for (const item of Object.values(assessment.scores)) {
    if (item?.score) values.push(item.score);
  }
  return values;
}

export function displayFitness(
  attributes?: Record<string, unknown> | null,
  extraScores: readonly (number | null | undefined)[] = [],
): DerivedFitness | null {
  const assessment = parseFunctionalAssessment(attributes?.functional_assessment);
  const derived = fitnessFromScores([...dimensionScoresOf(assessment), ...extraScores]);
  if (derived) return derived;
  const raw = String(attributes?.fitness ?? "").trim().toLowerCase();
  return raw === "strong" || raw === "adequate" || raw === "weak" ? raw : null;
}

export function emptyFunctionalAssessment(): FunctionalAssessment {
  return { scores: {}, gaps: [], regional_scope: null };
}

export function emptyNonfunctionalAssessment(): NonfunctionalAssessment {
  return { scores: {} };
}

export function parseFunctionalAssessment(raw: unknown): FunctionalAssessment | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const scoresSource = isPlain(record.scores) ? (record.scores as Record<string, unknown>) : record;
  const scores: FunctionalAssessment["scores"] = {};
  for (const key of FUNCTIONAL_DIMENSIONS) {
    const parsed = parseDimensionScore(scoresSource[key]);
    if (parsed) scores[key] = parsed;
  }
  const gaps = parseGaps(record.gaps);
  const regional_scope = parseRegionalScope(record.regional_scope);
  if (!Object.keys(scores).length && !gaps.length && !regional_scope) {
    // Empty object is a valid blank assessment only if it was clearly the blob.
    if (record.scores != null || record.gaps != null || record.regional_scope != null) {
      return { scores, gaps, regional_scope };
    }
    return null;
  }
  return { scores, gaps, regional_scope };
}

export function parseNonfunctionalAssessment(raw: unknown): NonfunctionalAssessment | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const scoresSource = isPlain(record.scores) ? (record.scores as Record<string, unknown>) : record;
  const scores: NonfunctionalAssessment["scores"] = {};
  for (const key of NONFUNCTIONAL_DIMENSIONS) {
    const parsed = parseDimensionScore(scoresSource[key]);
    if (parsed) scores[key] = parsed;
  }
  if (!Object.keys(scores).length) {
    if (record.scores != null) return { scores };
    return null;
  }
  return { scores };
}

export function parseDimensionScore(raw: unknown): DimensionScore | null {
  if (!isPlain(raw)) return null;
  const record = raw as Record<string, unknown>;
  const score = parseAssessmentScore(record.score);
  const confidence = parseConfidence(record.confidence) ?? "M";
  if (score == null) return null;
  return { score, confidence, evidence: parseEvidenceList(record.evidence) };
}

export function serializeFunctionalAssessment(assessment: FunctionalAssessment): Record<string, unknown> {
  const scores: Record<string, unknown> = {};
  for (const key of FUNCTIONAL_DIMENSIONS) {
    const item = assessment.scores[key];
    if (item) scores[key] = serializeDimensionScore(item);
  }
  const blob: Record<string, unknown> = { scores };
  if (assessment.gaps.length) blob.gaps = assessment.gaps;
  if (assessment.regional_scope) blob.regional_scope = assessment.regional_scope;
  return blob;
}

export function serializeNonfunctionalAssessment(assessment: NonfunctionalAssessment): Record<string, unknown> {
  const scores: Record<string, unknown> = {};
  for (const key of NONFUNCTIONAL_DIMENSIONS) {
    const item = assessment.scores[key];
    if (item) scores[key] = serializeDimensionScore(item);
  }
  return { scores };
}

function serializeDimensionScore(item: DimensionScore): Record<string, unknown> {
  const blob: Record<string, unknown> = { score: item.score, confidence: item.confidence };
  if (item.evidence.length) blob.evidence = item.evidence.map((entry) => ({ ...entry }));
  return blob;
}

/** Throws an Error with a user-facing message when the blob is present but invalid. */
export function validateFunctionalAssessment(raw: unknown): FunctionalAssessment | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("functional_assessment must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const scoresSource = record.scores;
  if (scoresSource != null && (!isPlain(scoresSource) || Array.isArray(scoresSource))) {
    throw new Error("functional_assessment.scores must be an object.");
  }
  const source = isPlain(scoresSource) ? (scoresSource as Record<string, unknown>) : withoutMeta(record);
  const scores: FunctionalAssessment["scores"] = {};
  for (const [key, value] of Object.entries(source)) {
    if (!(FUNCTIONAL_DIMENSIONS as readonly string[]).includes(key)) {
      throw new Error(`Unknown functional dimension '${key}'.`);
    }
    if (value == null) continue;
    scores[key as FunctionalDimension] = validateDimensionScore(key, value);
  }
  const gaps = record.gaps == null ? [] : validateGaps(record.gaps);
  let regional_scope: RegionalScope | null = null;
  if (record.regional_scope != null && record.regional_scope !== "") {
    regional_scope = parseRegionalScope(record.regional_scope);
    if (!regional_scope) throw new Error("regional_scope must be us, canada, or both.");
  }
  return { scores, gaps, regional_scope };
}

export function validateNonfunctionalAssessment(raw: unknown): NonfunctionalAssessment | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("nonfunctional_assessment must be an object.");
  }
  const record = raw as Record<string, unknown>;
  const scoresSource = record.scores;
  if (scoresSource != null && (!isPlain(scoresSource) || Array.isArray(scoresSource))) {
    throw new Error("nonfunctional_assessment.scores must be an object.");
  }
  const source = isPlain(scoresSource) ? (scoresSource as Record<string, unknown>) : withoutNfMeta(record);
  const scores: NonfunctionalAssessment["scores"] = {};
  for (const [key, value] of Object.entries(source)) {
    if (!(NONFUNCTIONAL_DIMENSIONS as readonly string[]).includes(key)) {
      throw new Error(`Unknown non-functional dimension '${key}'.`);
    }
    if (value == null) continue;
    scores[key as NonfunctionalDimension] = validateDimensionScore(key, value);
  }
  return { scores };
}

function validateDimensionScore(label: string, raw: unknown): DimensionScore {
  if (!isPlain(raw)) throw new Error(`${label} must be an object with score, confidence, and evidence.`);
  const record = raw as Record<string, unknown>;
  const score = parseAssessmentScore(record.score);
  if (score == null) throw new Error(`${label}.score must be an integer from 1 to 5.`);
  const confidence = parseConfidence(record.confidence);
  if (!confidence) throw new Error(`${label}.confidence must be H, M, or L.`);
  return { score, confidence, evidence: validateEvidenceList(label, record.evidence) };
}

function parseGaps(raw: unknown): string[] {
  try {
    return raw == null ? [] : validateGaps(raw);
  } catch {
    return [];
  }
}

function validateGaps(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error("gaps must be a list of text items.");
  if (raw.length > GAP_LIMIT) throw new Error(`gaps cannot have more than ${GAP_LIMIT} items.`);
  const gaps: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") throw new Error("Each gap must be text.");
    const text = item.trim();
    if (!text) continue;
    if (text.length > GAP_MAX) throw new Error(`Each gap must be at most ${GAP_MAX} characters.`);
    gaps.push(text);
  }
  return gaps;
}

function parseEvidenceList(raw: unknown): AssessmentEvidence[] {
  try {
    return raw == null ? [] : validateEvidenceList("evidence", raw);
  } catch {
    return [];
  }
}

function validateEvidenceList(label: string, raw: unknown): AssessmentEvidence[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error(`${label}.evidence must be a list.`);
  if (raw.length > EVIDENCE_LIMIT) throw new Error(`${label}.evidence cannot have more than ${EVIDENCE_LIMIT} items.`);
  return raw.map((item, index) => validateEvidence(`${label}.evidence[${index}]`, item));
}

function validateEvidence(label: string, raw: unknown): AssessmentEvidence {
  if (!isPlain(raw)) throw new Error(`${label} must be an object.`);
  const record = raw as Record<string, unknown>;
  const kind = String(record.kind ?? "").trim().toLowerCase();
  if (kind === "file") throw new Error(`${label}: file attachments are not supported; use a note or a link.`);
  if (kind !== "note" && kind !== "link") throw new Error(`${label}.kind must be note or link.`);
  const text = record.text == null ? undefined : String(record.text).trim();
  const url = record.url == null ? undefined : String(record.url).trim();
  if (text && text.length > TEXT_MAX) throw new Error(`${label}.text must be at most ${TEXT_MAX} characters.`);
  if (url && url.length > URL_MAX) throw new Error(`${label}.url must be at most ${URL_MAX} characters.`);
  if (kind === "note") {
    if (!text) throw new Error(`${label}: a note needs text.`);
    return { kind: "note", text, ...(url ? { url } : {}) };
  }
  if (!url || !isHttpUrl(url)) throw new Error(`${label}: a link needs an http(s) URL.`);
  return { kind: "link", url, ...(text ? { text } : {}) };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withoutMeta(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  delete next.scores;
  delete next.gaps;
  delete next.regional_scope;
  delete next.coverage_computed;
  return next;
}

function withoutNfMeta(record: Record<string, unknown>): Record<string, unknown> {
  const next = { ...record };
  delete next.scores;
  return next;
}

export function scoreMap(
  assessment: FunctionalAssessment | NonfunctionalAssessment | null | undefined,
): Record<string, AssessmentScore> {
  const out: Record<string, AssessmentScore> = {};
  if (!assessment) return out;
  for (const [key, item] of Object.entries(assessment.scores)) {
    if (item?.score) out[key] = item.score;
  }
  return out;
}

export const NF_APP_TYPES = new Set(["application", "cloud_service"]);
