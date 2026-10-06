import { ALLOWED_TRIPLES, type Relationship, type RelationshipType } from "@minea/types";
import { formatRelationshipTriple } from "@/lib/relationship-display";

const ALLOWED = new Set(ALLOWED_TRIPLES.map(([type, from, to]) => `${type}|${from}|${to}`));
const APPISH = new Set(["application", "solution", "technical_capability"]);
const HOST = new Set(["built_on", "runs_on"]);

export type TypeSwitchInvalid = { id: string; line: string };

export type TypeSwitchPlan = {
  objectId: string;
  kept: Relationship[];
  remapped: Relationship[];
  invalid: TypeSwitchInvalid[];
  merged: TypeSwitchInvalid[];
};

function allowed(type: string, from: string, to: string): boolean {
  return ALLOWED.has(`${type}|${from}|${to}`);
}

function fit(relType: string, fromType: string, toType: string): string | null {
  if (allowed(relType, fromType, toType)) return relType;
  if (!HOST.has(relType)) return null;
  const other = relType === "built_on" ? "runs_on" : "built_on";
  return allowed(other, fromType, toType) ? other : null;
}

export function planTypeSwitch(input: {
  objectId: string;
  objectName: string;
  currentType: string;
  nextType: string;
  relationships: Relationship[];
  nameOf: (id: string) => string;
}): TypeSwitchPlan {
  if (input.currentType === "cloud_service" && input.nextType !== "application") {
    throw new Error("a platform becomes an application");
  }
  if (APPISH.has(input.currentType) && input.nextType !== "cloud_service") {
    throw new Error("an application becomes a platform");
  }
  const kept: Relationship[] = [];
  const remapped: Relationship[] = [];
  const invalid: TypeSwitchInvalid[] = [];
  const merged: TypeSwitchInvalid[] = [];
  type Fitted = { rel: Relationship; next: string; fromType: string; toType: string; otherName: string };
  const groups = new Map<string, Fitted[]>();
  for (const rel of input.relationships) {
    if (rel.from_object_id !== input.objectId && rel.to_object_id !== input.objectId) continue;
    const fromType = rel.from_object_id === input.objectId ? input.nextType : rel.from_type;
    const toType = rel.to_object_id === input.objectId ? input.nextType : rel.to_type;
    const next = fit(rel.type, fromType, toType);
    const otherId = rel.from_object_id === input.objectId ? rel.to_object_id : rel.from_object_id;
    const otherName = input.nameOf(otherId);
    if (!next) {
      invalid.push({
        id: rel.id,
        line: formatRelationshipTriple(rel, input.objectId, input.objectName, otherName).nameLine,
      });
      continue;
    }
    const key = `${next}|${rel.from_object_id}|${rel.to_object_id}`;
    const group = groups.get(key) ?? [];
    group.push({ rel, next, fromType, toType, otherName });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const keeper = group.find((item) => item.rel.type === item.next) ?? group[0]!;
    for (const item of group) {
      const updated: Relationship = {
        ...item.rel,
        type: item.next as RelationshipType,
        from_type: item.fromType as Relationship["from_type"],
        to_type: item.toType as Relationship["to_type"],
      };
      if (item !== keeper) {
        const line = formatRelationshipTriple(updated, input.objectId, input.objectName, item.otherName).nameLine;
        merged.push({ id: item.rel.id, line: `merged into ${line}` });
        continue;
      }
      if (item.next === item.rel.type) kept.push(updated);
      else remapped.push(updated);
    }
  }
  return { objectId: input.objectId, kept, remapped, invalid, merged };
}

export type TypeConflict = { message: string; ids: string[] };

/** A 409 from the switch endpoint, as the lines a person can read and the ids to drop. */
export function readableTypeConflict(message: string): TypeConflict | null {
  if (!message.startsWith("409")) return null;
  const fallback = "These links changed. Review them and confirm again.";
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start < 0 || end <= start) return { message: fallback, ids: [] };
  try {
    const body = JSON.parse(message.slice(start, end + 1)) as { invalid?: { id?: string; line?: string }[] };
    const items = body.invalid ?? [];
    const lines = items.map((item) => item.line).filter((line): line is string => Boolean(line));
    const ids = items.map((item) => item.id).filter((id): id is string => Boolean(id));
    return { message: lines.length ? lines.join(". ") : fallback, ids };
  } catch {
    return { message: fallback, ids: [] };
  }
}
