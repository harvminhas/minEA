import { ACTS_AS_LABEL, type ActsAs } from "@minea/types";

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** A plain object that looks like an Acts as pick, valid or not. */
export function isActsAsShape(value: unknown): boolean {
  const item = record(value);
  return Boolean(item && "type" in item);
}

export function readActsAs(value: unknown): ActsAs | null {
  const item = record(value);
  if (!item) return null;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return null;
  if (item.type === "service_account") return { type: "service_account", name };
  if (item.type !== "contact" && item.type !== "team") return null;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (!id) return null;
  return { type: item.type, id, name };
}

export function actsAsLabel(value: unknown): string {
  const acts = readActsAs(value);
  if (!acts) return "";
  return `${acts.name} · ${ACTS_AS_LABEL[acts.type]}`;
}

export function actsAsFlag(value: unknown): string | null {
  return readActsAs(value)?.type === "contact" ? "Flagged: uses a person's account" : null;
}

export function sameActsAs(left: unknown, right: unknown): boolean {
  return JSON.stringify(readActsAs(left)) === JSON.stringify(readActsAs(right));
}
