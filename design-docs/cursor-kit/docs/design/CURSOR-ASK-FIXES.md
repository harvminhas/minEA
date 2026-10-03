# BuboMap Ask fixes: impact answer table (A) + answer strategy (B) — Cursor prompts v1

Two ready prompts from the Sep 30, 2026 review, cleaned up. Run them **after the UI P-phases and before Cost (C) and Infra (I)**: CURSOR-INFRA-INSTRUCTIONS I4 reuses A's builder, and I7 adds an intent to B's file.

**Facts from the repo owner (minEA):**
- Ask rules live in `apps/web/lib/ask/answerStrategies.ts`.
- The model path is the existing **`/ai/ask` loop**, which may be Python. It loads `strategyPrompt`, through a generated JSON artifact if it can't import TypeScript.
- There is **no `ask.llm.v1` flag**. Where ASK-GROUNDING-SPEC or CURSOR-UI-INSTRUCTIONS mention it, read "the existing `/ai/ask` path".
- Impact walks relationships (`relationshipImpactRules`), never `hosting_model`.
- Objects keep vendor, cost and hosting in `properties`; owner is a real column; object updates go through the existing audited update.

Order of authority: DISCOVERY.md > this file > ASK-GROUNDING-SPEC.md > mockup. Shots: `02-ask-answer.png`, `11-ask-answer-gaps.png`, `12-ask-answer-impact.png`, `13-ask-answer-spend.png`.

---

## 1. How to use this

1. Use a new Cursor Agent chat per prompt. Mention `@docs/design/DISCOVERY.md`, `@docs/design/ASK-GROUNDING-SPEC.md`, `@docs/design/CURSOR-ASK-FIXES.md`, and attach the shots named in the prompt.
2. Each prompt starts with a **read-only report + plan and waits for your OK** before changing code. The report is appended to DISCOVERY.md as §18 (A) and §19 (B). Sections 16 and 17 belong to Cost and Infra; leave the gaps if those haven't run yet.
3. Review the diff, run the tests, ask the acceptance questions in the UI, then commit:

```powershell
git checkout -b fix/ask-impact-and-strategy
git add -A
git commit -m "ask: A impact answer table"     # then "ask: B answer strategy"
```

| # | Prompt | Shots | Touches data? |
|---|---|---|---|
| A | Impact answer table: shared builder, severity groups, path labels, citations, context, gaps, Ask next | 12, 02 | No |
| B | Answer strategy: `answerStrategies.ts`, intents, thresholds, verdicts, evidence, gaps, fix actions, JSON artifact, item resolution | 11, 12, 13 | Only via the fix action the user clicks |

---

## 2. The prompts

### Prompt A: Impact answer table fix

Attach: `12-ask-answer-impact.png`, `02-ask-answer.png`. Mention `@docs/design/DISCOVERY.md`, `@docs/design/ASK-GROUNDING-SPEC.md` (§1.2, §2.4, §4, §5), `@docs/design/CURSOR-ASK-FIXES.md`.

```text
You are working in the minEA / BuboMap repo (Windows, PowerShell, localhost:3001).

GOAL
"What breaks if X goes down?" answers show a correct, grouped, cited table built by the
SAME function as the panel's "Depends on this" list.

1. FIRST (read-only) append "## 18. Ask impact facts" to docs/design/DISCOVERY.md and show
   me a plan, then WAIT for my OK:
   a. Where impact_of / computeImpact lives today and what it returns.
   b. Where relationshipImpactRules lives, its shape, and whether each rule already says
      how failure lands (stops working / degraded / loses support) and a path label. If
      not, propose adding `impact: 'stops_working' | 'degraded' | 'loses_support'` and
      `label: (src, tgt) => string` per rule (config only).
   c. Where the panel's "Depends on this" list is built (component + query).
   d. How the impact answer is rendered today (component, answer schema, citation
      numbering) and how the /ai/ask loop gets impact data.
   e. Where `calls` (integration) edges and runs_on/built_on edges live; owner column;
      criticality; cost (lib/cost if present, else annual_cost via the existing parser);
      renewal keys.

2. After OK, build ONE builder (e.g. apps/web/lib/relationships/impactRows.ts):
   buildImpactRows(objectId, { depth }) -> {
     source: { id, name, type, owner, criticality, annualCost, renewal },
     groups: [{ severity: 'stops_working'|'degraded'|'loses_support', rows: ImpactRow[] }],
     gaps: Gap[]
   }
   ImpactRow = { id, name, type, owner, criticality, direct: boolean,
                 path: [{ fromId, toId, ruleKey }], pathLabel: string, via?: string }
   - Rows = the records impact_of returns (relationshipImpactRules only; never
     hosting_model), each once, at its most severe group; direct before indirect, then by
     criticality, then name.
   - pathLabel comes from the rule labels, e.g. "Runs on Salesforce", "Built on Salesforce
     platform", "Supported by Salesforce (vendor)", "Through EDI Gateway → Runs on AS400".
   - Gaps: no `calls` edges in or out of the source -> "No integrations recorded for {name},
     so data flows to other systems aren't included."; source (or a direct row) has
     hosting_model set but no runs_on/built_on -> "No host linked for {name}." (Infra I5
     later swaps this check for lib/infra noHostLinked).
3. Use the builder in BOTH places: the panel "Depends on this" list (same rows, same order,
   same labels) and the Ask impact answer (deterministic handler and the tool the /ai/ask
   loop calls). Delete the old per-place queries.
4. Answer rendering (match shot 12):
   - Sentence: "If {source} goes down, {n} records are affected: {a} stop working, {b} are
     degraded, {c} lose support. [1]". [1] is the SOURCE record, cited in the sentence
     only (it is not a table row).
   - Table grouped under headings "Stops working", "Degraded", "Loses support" (omit empty
     groups), columns: # | Name | Type | How it's connected | Owner | Criticality. Row
     citations are numbered from [2] in display order; each opens the record.
   - Context line under the table: "{source} · owner {team} ({person}) · criticality
     {value} · {annual cost}/yr · renews {date}" (skip missing parts; never invent).
   - Gaps line: the builder's gaps, with an "Add" link where there's a fix screen.
   - Ask next chips: "Who owns the things that stop working?", "What does {source} cost?",
     "How important is {source}?".
5. Tests (fixture in the repo's Meridian seed):
   - Salesforce: 5 rows = 4 direct + 1 loses_support; groups and order as rendered.
   - AS400 (or your top runtime): rows equal the panel list (same ids, order, labels).
   - Citation numbering: source [1] in the sentence, rows [2]..[n+1], no row cites [1].
   - Gaps: an object with no calls edges gets the integrations gap; an on_premise object
     with no runs_on gets "No host linked"; neither gap when the edges exist.
   - The answer never uses hosting_model to add or drop rows (grep + unit test).

ACCEPTANCE
- "What breaks if Salesforce goes down?" -> sentence with [1], 5 rows in their groups
  numbered [2]-[6], context line, gaps line, 3 Ask next chips.
- The Salesforce panel "Depends on this" shows the same 5 records with the same labels.
- All tests pass; no other answer type changes.

DO NOT
- Walk hosting_model, or invent edges from vendor names.
- Let the model compute counts (they come from the builder, registered for the validator).
- Keep a second dependents query for the panel.
- Add a flag (there is no ask.llm.v1).
```

**Check:** ask the Salesforce and AS400 questions. Open both panels and compare. Commit `ask: A impact answer table`.

---

### Prompt B: Answer strategy (as approved)

Attach: `11-ask-answer-gaps.png`, `12-ask-answer-impact.png`, `13-ask-answer-spend.png`. Mention `@docs/design/DISCOVERY.md`, `@docs/design/ASK-GROUNDING-SPEC.md` (§1, §4, §5), `@docs/design/CURSOR-ASK-FIXES.md`.

```text
GOAL
One file decides how Ask answers each kind of question:
apps/web/lib/ask/answerStrategies.ts. Deterministic code and the /ai/ask loop both follow it.

1. FIRST (read-only) append "## 19. Ask strategy facts" to docs/design/DISCOVERY.md and
   show me a plan, then WAIT for my OK:
   a. Current contents of answerStrategies.ts (or "Not found") and every place that routes
      a question today (keyword routing, intent detection, the /ai/ask loop).
   b. The /ai/ask loop: language, entry file, how it gets its system prompt today, and
      whether it can import TS. If not, where a generated JSON artifact should live and
      how the loop loads it.
   c. The existing audited object update (path) for criticality and owner, and the
      permission check.
   d. The current answer schema and renderer (what fields exist for verdict, evidence,
      gaps, actions).
   e. How items are resolved from text today (search helper, fuzzy rules).

2. After OK, answerStrategies.ts (single file) exports:
   - INTENTS in routing order. A question that NAMES an item is routed to an item intent
     first: importance | impact | cost | ownership | aging (aging = INFRA-SPEC §7, single
     runtime). Otherwise to a list intent: gaps | lists | spend | aging. Nothing matched ->
     unknown (say what Ask can answer + 3 example chips).
   - Item resolution: case-insensitive, partial match on name and vendor; exactly 1 match
     -> that item; >1 -> answer "Did you mean …?" with up to 5 chips (name · type) and no
     verdict; 0 -> unknown with "I couldn't find {text} in your model."
   - IMPORTANCE thresholds, evaluated in this order:
       unknown  = the item has no relationships at all
       high     = >= 3 direct dependents OR it supports a capability OR any dependent has
                  stored criticality high/critical
       medium   = has dependents, not high
       low      = has relationships but no dependents
     (dependents = buildImpactRows direct rows from prompt A.)
   - VERDICT rules:
       stored criticality present -> verdict "{Value} (set in your model)", inferred=false;
         if the inferred level is higher, add the note "may be higher: {reason}" (e.g. "4
         apps depend on it"); NO fix button.
       stored criticality blank -> verdict "Likely {inferred level}" (e.g. "Likely high")
         with an "Inferred" tag, inferred=true.
       no relationships -> verdict "Unknown", inferred=true, with the gap "No relationships
         recorded for {name}".
   - EVIDENCE: 2-4 bullets, each with >= 1 citation (dependents count, the capability
     supported, a high/critical dependent, owner, cost/renewal where relevant).
   - GAPS: missing owner, missing criticality, no relationships, no integrations, no host
     linked (same texts as prompt A).
   - FIX ACTIONS only when the verdict is inferred: "Set criticality to {level}" and, if the
     owner is blank, "Set owner". Each runs the EXISTING audited object update (permission
     checked, History written), then re-asks the question. Never shown for stored values.
   - Answer schema additions: verdict { label, level, inferred, note? }, evidence [{ text,
     citations[] }], gaps [{ text, fix? }], fixActions [{ kind: 'set_criticality' |
     'set_owner', objectId, value?, label }]. Render: verdict chip, evidence bullets, gaps
     line, fix buttons (match shots 11-13 styling).
   - strategyPrompt: an exported string generated from the same constants (intent list,
     thresholds, verdict rules, evidence/gaps rules) for the model path.
3. Build-time JSON artifact for the /ai/ask loop (e.g.
   apps/web/lib/ask/generated/answerStrategies.json via `npm run ask:strategies`, also run
   in prebuild): { version, intents, thresholds, verdictRules, strategyPrompt }. The loop
   loads it instead of its hard-coded prompt. A staleness test fails if the artifact differs
   from what the TS file generates.
4. Wire both paths: deterministic handlers call the strategy functions; the /ai/ask loop
   uses the artifact and its tool results; the validator still checks numbers/citations.
5. Tests:
   - Routing: named item first ("how important is the AS400" -> importance; "what breaks
     if Salesforce goes down" -> impact; "what does Slack cost" -> cost; "who owns EDI"
     -> ownership; "what's missing" -> gaps; "list our SaaS apps" -> lists; "spend by
     vendor" -> spend; "what's out of support" -> aging; "tell me a joke" -> unknown).
   - Thresholds: each branch, including the order (no relationships -> unknown even when
     criticality is stored; 3 dependents -> high; supports a capability -> high; a
     critical dependent -> high; 1 dependent -> medium; relationships but no dependents ->
     low).
   - Verdicts: stored Medium + inferred high -> "Medium (set in your model)" + "may be
     higher" note, inferred=false, no fixActions; blank -> "Likely high" + Inferred + 1-2
     fixActions; none -> "Unknown".
   - Evidence: 2-4 bullets, every bullet cited.
   - Fix action: calls the audited update once, History written, permission denied ->
     error message, no change.
   - Resolution: "as400" and "the AS400" -> AS400; "sales" (matches Salesforce and
     Salesforce platform) -> "Did you mean"; vendor match ("Intuit" -> QuickBooks Online);
     0 matches -> the unknown text.
   - Artifact staleness test; strategyPrompt contains every intent key.

ACCEPTANCE
- "How important is the AS400?" with stored Critical -> "Critical (set in your model)",
  evidence 2-4 cited bullets, no fix button.
- On an item with blank criticality and 3+ dependents -> "Likely high", Inferred tag,
  "Set criticality to High" works and the re-asked answer shows "High (set in your model)".
- "How important is sales?" -> "Did you mean …?" chips.
- npm test passes, including the staleness test; the /ai/ask loop answers with the same
  verdict as the deterministic path for the importance tests.

DO NOT
- Spread intent rules across files or hard-code a second prompt in the /ai/ask loop.
- Show fix actions for stored values, or write without the audited update.
- Let the model choose the verdict level (it comes from the threshold function).
- Add an ask.llm.v1 flag.
```

**Check:** ask importance questions for one stored and one blank item, try the fix button, and check the History tab. Run `npm run ask:strategies` and make sure `git diff` is clean. Commit `ask: B answer strategy`.

---

## 3. Fidelity checklist (Ask fixes)

- [ ] **12 impact** (`#/ask?q=What breaks if the AS400 goes down?`): sentence with [1] only, grouped table with rows from [2], "How it's connected" labels, context line, gaps line, Ask next chips
- [ ] Panel "Depends on this" = the same rows as the answer table
- [ ] **11 gaps**: gaps line wording matches prompt A; fix links only where a fix screen exists
- [ ] **13 spend**: unchanged apart from the shared verdict/evidence layout if B adds it
- [ ] Importance answers: verdict chip, Inferred tag only when inferred, 2–4 cited bullets, fix buttons only when inferred
- [ ] Ambiguous names give "Did you mean"; unknown questions give example chips

---

## 4. If Cursor drifts (Ask fixes)

**It walked hosting_model or guessed edges**
```text
Impact rows come only from relationshipImpactRules via buildImpactRows. hosting_model is
used only for the "No host linked" gap. Remove every other use and rerun the tests.
```

**It kept a separate dependents query for the panel**
```text
The panel's "Depends on this" and the Ask impact table must call the same builder. Delete
the second query and show me both call sites.
```

**It numbered the source as a row**
```text
[1] is the source record, cited in the sentence only. Table rows start at [2]. Fix the
numbering and the citation test.
```

**It let the model decide the importance level**
```text
The level comes from the threshold function in answerStrategies.ts (unknown -> high ->
medium -> low, in that order). The model only phrases it. Pass the computed verdict in and
validate that the answer's level matches.
```

**It showed a fix button on a stored value**
```text
Fix actions appear only when the verdict is inferred. A stored value gets "(set in your
model)" and, if relevant, the "may be higher" note, with no button.
```

**It hard-coded the prompt in the /ai/ask loop**
```text
The loop must load the generated artifact (strategyPrompt + rules) from answerStrategies.ts.
Remove the hard-coded copy, regenerate the artifact and make the staleness test pass.
```

---

## 5. Notes

- The `aging` intent is specified in INFRA-SPEC §7. B reserves it in the intent list, and I7 implements its handler and regenerates the artifact.
- The "No host linked" gap starts as a simple check in A's builder. Infra I5 moves it to `lib/infra` `noHostLinked()` and COST-SPEC's `hostHint` calls the same function.
- The Salesforce expectation (5 rows: 4 direct + 1 loses_support) is from the repo's Meridian data, as reviewed on Sep 30. If DISCOVERY §18 shows different edges, update the test, not the builder.
