/**
 * Name matching for Ask, as a helper only (never decides what a question means).
 *
 * Words in the question are matched to names that exist in this workspace: exact names, first names
 * ("Christine" -> "Christine Wong") and typos ("Adboe" -> "Adobe"). The AI path gets the same hints
 * from the server; the browser uses them for the fallback "name matches" list when the AI can't run.
 * Mirrors apps/api/app/ai/ask/names.py.
 */
import { ownerNames, type RecordFacts } from "@/lib/ask/record-filter";

const STOP = new Set(
  `a about all an and any app apps application applications are as at be by can cost costs do does
  for from has have how i in is it its list me much my no not of on or our own owned owns platform platforms
  product products service services show software system systems that the their them there these they
  this those to tool tools under us use used uses using vendor vendors we what when where which who whom
  whose why will with you your yes many most more less any every each items item things thing stuff
  run runs running pay paying team teams people person owner owners`.split(/\s+/)
);

export type NameKind = "vendor" | "person" | "team" | "tenant" | "item";
export type NameHint = { text: string; name: string; kind: NameKind; how: "exact" | "partial" | "typo" };

export function normName(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/['’]s\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Edit distance with a swap of neighbouring letters counted as one edit (Adboe -> Adobe = 1). */
export function nameDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

type Entry = { name: string; kind: NameKind; ids: Set<string> };

function vocabulary(all: RecordFacts[], people: string[]): Entry[] {
  const map = new Map<string, Entry>();
  const add = (name: string, kind: NameKind, id?: string) => {
    if (!normName(name)) return;
    const key = `${kind}:${normName(name)}`;
    const entry = map.get(key) ?? { name, kind, ids: new Set<string>() };
    if (id) entry.ids.add(id);
    map.set(key, entry);
  };
  for (const facts of all) {
    const row = facts.row;
    add(row.name, row.object?.type === "cloud_service" ? "tenant" : "item", row.id);
    facts.vendors.forEach((vendor) => add(vendor, "vendor", row.id));
    if (row.ownerTeam) add(row.ownerTeam, "team", row.id);
    ownerNames(row).filter((name) => name !== row.ownerTeam).forEach((name) => add(name, "person", row.id));
  }
  people.forEach((name) => add(name, "person"));
  return [...map.values()];
}

const HOW_ORDER = { exact: 0, typo: 1, partial: 2 } as const;
const KIND_ORDER: Record<NameKind, number> = { vendor: 0, person: 1, team: 2, tenant: 3, item: 4 };

function matchEntries(question: string, all: RecordFacts[], people: string[]): { hint: NameHint; ids: Set<string> }[] {
  const q = ` ${normName(question)} `;
  const words = q.split(" ").filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  const out: { hint: NameHint; ids: Set<string> }[] = [];
  for (const entry of vocabulary(all, people)) {
    const key = normName(entry.name);
    const nameWords = key.split(" ").filter((w) => w.length >= 3);
    if (q.includes(` ${key} `)) {
      if (key.length >= 3 && !STOP.has(key)) out.push({ hint: { text: entry.name, name: entry.name, kind: entry.kind, how: "exact" }, ids: entry.ids });
      continue;
    }
    for (const word of words) {
      if (word.length >= 4 && nameWords.includes(word)) {
        out.push({ hint: { text: word, name: entry.name, kind: entry.kind, how: "partial" }, ids: entry.ids });
        break;
      }
      const limit = word.length <= 6 ? 1 : 2;
      if (word.length >= 4 && nameWords.some((w) => !STOP.has(w) && Math.abs(w.length - word.length) <= limit && nameDistance(word, w) <= limit)) {
        out.push({ hint: { text: word, name: entry.name, kind: entry.kind, how: "typo" }, ids: entry.ids });
        break;
      }
    }
  }
  return out.sort((a, b) => HOW_ORDER[a.hint.how] - HOW_ORDER[b.hint.how] || KIND_ORDER[a.hint.kind] - KIND_ORDER[b.hint.kind] || a.hint.name.localeCompare(b.hint.name));
}

/** Workspace names that match words in the question (at most 8). */
export function nameHints(question: string, all: RecordFacts[], people: string[] = []): NameHint[] {
  return matchEntries(question, all, people).slice(0, 8).map((item) => item.hint);
}

/** Items whose name, vendor or owner matched a word in the question: the fallback list when the AI can't run. */
export function nameSearch(question: string, all: RecordFacts[], people: string[] = []): { items: RecordFacts[]; hints: NameHint[] } {
  const matched = matchEntries(question, all, people);
  const ids = new Set(matched.flatMap((item) => [...item.ids]));
  return { items: all.filter((facts) => ids.has(facts.row.id)), hints: matched.slice(0, 8).map((item) => item.hint) };
}
