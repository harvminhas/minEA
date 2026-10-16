"""Name hints for Ask: words in the question matched to names that exist in this workspace.

Not intent parsing. It only says "this word looks like that workspace name" (typos such as Adboe ->
Adobe, a first name such as Christine -> Christine Wong) so the model uses the exact spelling in its
lookups. The model still decides what the question means and which lookups to run.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ai.ask.graph import WorkspaceGraph

# Words too common to be a name on their own (never matched as a typo or a partial name).
STOP = set(
    """a about all an and any app apps application applications are as at be by can cost costs do does
    for from has have how i in is it its list me much my no not of on or our own owned owns platform platforms
    product products service services show software system systems that the their them there these they
    this those to tool tools under us use used uses using vendor vendors we what when where which who whom
    whose why will with you your yes many most more less any every each items item things thing stuff
    run runs running pay paying team teams people person owner owners""".split()
)
KIND_ORDER = {"vendor": 0, "person": 1, "team": 2, "tenant": 3, "item": 4}
MAX_HINTS = 8


@dataclass(frozen=True)
class Hint:
    text: str  # the word(s) in the question
    name: str  # the workspace name
    kind: str  # vendor | person | team | tenant | item
    how: str  # exact | partial | typo

    def as_dict(self) -> dict:
        return {"text": self.text, "name": self.name, "kind": self.kind, "how": self.how}


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", re.sub(r"['’]s\b", "", (value or "").lower())).strip()


def distance(a: str, b: str) -> int:
    """Edit distance counting a swap of two neighbouring letters as one edit (Adboe -> Adobe = 1)."""
    rows = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        rows[i][0] = i
    for j in range(len(b) + 1):
        rows[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            rows[i][j] = min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                rows[i][j] = min(rows[i][j], rows[i - 2][j - 2] + 1)
    return rows[len(a)][len(b)]


def vocabulary(graph: WorkspaceGraph) -> list[tuple[str, str]]:
    """(name, kind) for every vendor, owner, team, tenant and item name in the workspace."""
    out: dict[tuple[str, str], None] = {}
    raw = {str(obj.get("id")): obj for obj in graph.objects}
    for rec in graph.records.values():
        out[(rec.name, "tenant" if raw.get(rec.id, {}).get("type") == "cloud_service" else "item")] = None
        for vendor in [*rec.vendor_names, rec.catalog_vendor or ""]:
            if vendor:
                out[(vendor, "vendor")] = None
        if rec.owner_team:
            out[(rec.owner_team, "team")] = None
        obj = raw.get(rec.id, {})
        props = obj.get("properties") or {}
        people = [rec.owner_person, obj.get("owner"), obj.get("point_of_contact_name")]
        people += [v for k, v in props.items() if isinstance(v, str) and re.search(r"(^|_)owner(_name)?$", k)]
        for person in people:
            if isinstance(person, str) and person.strip() and person.strip() != rec.owner_team:
                out[(person.strip(), "person")] = None
    return [key for key in out if norm(key[0])]


def name_hints(question: str, graph: WorkspaceGraph, extra_people: list[str] | None = None) -> list[Hint]:
    q = f" {norm(question)} "
    words = [w for w in q.split() if len(w) >= 3 and w not in STOP and not w.isdigit()]
    vocab = vocabulary(graph) + [(name, "person") for name in (extra_people or []) if norm(name)]
    hints: dict[tuple[str, str], Hint] = {}
    for name, kind in vocab:
        key = norm(name)
        name_words = [w for w in key.split() if len(w) >= 3]
        if f" {key} " in q:
            if len(key) >= 3 and key not in STOP:
                hints.setdefault((name, kind), Hint(name, name, kind, "exact"))
            continue
        for word in words:
            if word in name_words and len(word) >= 4:
                hints.setdefault((name, kind), Hint(word, name, kind, "partial"))
                break
            limit = 1 if len(word) <= 6 else 2
            if len(word) >= 4 and any(abs(len(word) - len(w)) <= limit and distance(word, w) <= limit and w not in STOP for w in name_words):
                hints.setdefault((name, kind), Hint(word, name, kind, "typo"))
                break
    # An exact owner-team name ("CRM") is the team, even if a vendor or item shares the word.
    ranked = sorted(hints.values(), key=lambda h: ({"exact": 0, "typo": 1, "partial": 2}[h.how], -1 if (h.how == "exact" and h.kind == "team") else KIND_ORDER.get(h.kind, 9), h.name))
    return ranked[:MAX_HINTS]


def hint_prompt(hints: list[Hint]) -> str:
    """One line for the model. Empty when nothing matched."""
    useful = [h for h in hints if h.how != "exact" or h.kind in {"vendor", "person", "team"}]
    if not useful:
        return ""
    field = {"team": " (filter owner_team)"}
    parts = [f"“{h.text}” → {'owner team' if h.kind == 'team' else h.kind} “{h.name}”{field.get(h.kind, '')}" + (" (spelling corrected)" if h.how == "typo" else "") for h in useful]
    return "Workspace names matching words in the question (hints, not facts; use these exact names in lookups): " + "; ".join(parts) + "."
