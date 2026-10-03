# BuboMap cost lines (Applications + Infrastructure): Cursor build instructions — v2

Paste these prompts into Cursor, one at a time, to add cost lines and the infrastructure share to minEA (`D:\Users\hminhas\WebstormProjects\minEA`).

- `docs/design/COST-SPEC.md` (v2) decides the data shape and the maths: `properties.cost_lines`, the `lib/cost/` module, write-back to `annual_cost`, shares, tests.
- The mockup `docs/design/bubomap-ui.html` and shots 14–18 decide the UI: layout, copy, states.
- `docs/design/CURSOR-UI-INSTRUCTIONS.md` still owns the shell, tokens (§2), the flag pattern and "how to run a prompt" (§1.2).
- `docs/design/ASK-GROUNDING-SPEC.md` §10 covers Ask.

Order of authority: DISCOVERY.md (what the code really does) > COST-SPEC > mockup > this file. On a conflict Cursor stops and asks.

> **Sep 30, 2026:** "Infrastructure table" below means the single list from P2. If `infra.split.v1` is already on, apply the same cost column/footer to **Platforms & cloud** and put the cost only in the panel on **Servers & devices** (INFRA-SPEC §6). The Cost eval's Infrastructure total of $146,230 then splits into platforms and runtimes per INFRA-SPEC §8.

**How minEA stores this (from the repo owner):** cost, vendor and hosting are keys in `objects.properties` (JSON), not records; owner is a real column. So: **no new tables, no structural migrations.** Cost lines go in `properties.cost_lines`, and one module (`lib/cost/`) is the only thing that reads or writes cost. `annual_cost` stays as the legacy total and is written back from the lines.

Everything ships behind **`cost.lines.v1`** (needs `repository.mvp.v1`). With it off, the UI is unchanged, and the refactored spend/Vendors/Ask code must return exactly the same numbers as today.

---

## 1. How to use this

### 1.1 Before you start

1. P0 (DISCOVERY.md) exists and is committed; P1–P3 are done. P4 is not needed for cost (its money fields are replaced by this).
2. Expand the kit over the old one (CURSOR-UI-INSTRUCTIONS §1.1). Cost files: `COST-SPEC.md`, `CURSOR-COST-INSTRUCTIONS.md`, shots `14-cost-table.png`, `15-cost-panel-onprem.png`, `16-cost-panel-shared-saas.png`, `17-cost-add-line.png`, `18-spend-report.png`.
3. Branch and commit the docs:

```powershell
cd D:\Users\hminhas\WebstormProjects\minEA
git status                                  # clean
git checkout -b feat/cost-lines-v1
git add docs/design
git commit -m "docs: cost lines spec v2, Cursor cost instructions, shots 14-18"
```

4. Mockup routes: `#/model/applications`, `#/model/infrastructure` (column + footer), `#/model/infrastructure/as400?sec=cost`, `#/model/applications/teams?sec=cost`, `#/model/applications/teams?sec=cost&add=user`, `#/reports/spend`. Amber `+ Add` (e.g. Shop Floor Label Printing) shows quick entry.

### 1.2 How to run each prompt

Same as CURSOR-UI-INSTRUCTIONS §1.2: a **new Cursor Agent chat per prompt**; attach the named shots; mention `@docs/design/DISCOVERY.md` and `@docs/design/COST-SPEC.md`; paste the prompt; review the diff; check `localhost:3001` with `cost.lines.v1` on **and** off; walk the acceptance list and §3; commit:

```powershell
git add -A
git commit -m "cost.lines.v1: C2 cost module"   # change per phase
```

C1 shows a **plan and waits for your OK**. C2b (backfill) only runs when you ask, dry run first.

### 1.3 Phase list

| # | Prompt | Shots | Touches data? |
|---|---|---|---|
| C0 | Discovery: confirm the storage facts, list every `annual_cost` reader, the vendor normalizer, edges, settings | none | No (read-only) |
| C1 | Plan (wait for OK) → `properties.cost_lines` zod schema, `lib/cost/` skeleton, costable config, currency setting, flag | none | No |
| C2 | Cost module: legacy parse, `annualCost`, write-back, vendor spend, renewals; refactor every `annual_cost` reader; tests | none | Only via writes users make |
| C2b | *Optional, on request:* backfill `annual_cost` → one estimate line, dry run first | none | Yes, when you run it |
| C3 | Annual cost column + footer + quick entry on both tables; 1280 width fix | 14 | Quick entry writes |
| C4 | Panel Cost section + Add/edit line form (line renewal, sharing) | 15, 16, 17 | Line writes |
| C5 | Shared lines + infrastructure share via `runs_on`/`built_on`; "No host linked" | 15, 16 | No |
| C6a | Spend report, Vendors and contracts screen, KPIs, renewals, CSV from the module | 18 | No |
| C6b | Ask: tools read the module; cite object + line ids; cost eval C01–C08 | none | No |

C6b needs P7a–7c; without P7, do its step 1 (P6 handlers) only.

---

## 2. The prompts

### Prompt C0: Cost discovery (read-only)

Attach: nothing. Mention `@docs/design/DISCOVERY.md`, `@docs/design/COST-SPEC.md`.

```text
You are working in the BuboMap Next.js repo (Windows, PowerShell, dev server on localhost:3001).
This task is READ-ONLY. Do not change, create or delete code, config, data or dependencies.
The only file you may edit is docs/design/DISCOVERY.md, by APPENDING section 16.

Context: we're adding cost lines behind the flag cost.lines.v1 (docs/design/COST-SPEC.md v2).
The repo owner told us how data is stored (COST-SPEC §0). Confirm each fact in the code,
with file paths and line numbers, and correct it where the code says otherwise. Don't guess;
write "Not found" and where you looked.

Append "## 16. Cost storage facts (cost.lines.v1)":

16.1 objects table and properties: where the objects model/table is defined, how properties
     (JSON) is typed/validated today, how it is read and written (helpers, API routes, server
     actions), and whether writes replace the whole blob or patch keys. Any optimistic
     concurrency / updated_at check? Owner column name (confirm it's a real column).
16.2 Type names: the exact type identifiers for application, solution, technical capability,
     platform, integration tool, runtime (and any other type that has annual_cost). Which
     BuboMap list (Applications / Infrastructure / Connections) shows each.
16.3 annual_cost: for each type, the stored JS type (number vs string) and 5 example value
     shapes from seed/fixtures (e.g. 9800, "18600", "$18,600", "18.6k"?). The existing parse
     function(s): path, name, exact rules (> 0, zero/blank missing, capex runtime filled,
     custom-built filled). Where cost_model and its values are defined.
16.4 EVERY current reader and writer of annual_cost. Run:
       rg -n "annual_cost" --glob "!node_modules" --glob "!.next"
     plus any dynamic access (properties[...], a keys array, SQL/JSON path queries). For each
     hit: file:line, what it does (sum, display, missing count, edit, Ask, CSV), and whether it
     uses the shared parser or its own. This list is C2's refactor checklist.
16.5 Separate cost-like fields that must stay OUT of totals: license_model, per-call cost,
     model token prices, roadmap initiative cost. Exact keys and where they are read.
16.6 Renewal keys: contract_renewal (applications, platforms, tools) and commitment_ends
     (runtimes). Formats stored (ISO date? free text?). Any notice-period key?
16.7 Vendor: properties.vendor per type; platform short-code list (path) and code → display
     name mapping; vendor_product; runtime vendor vs runtime_provider. The existing vendor
     normalizer used by the Vendors and contracts screen and Ask (path, name, rules: case,
     hosting-word drop list). is_custom_built handling.
16.8 Relationships: where runs_on and built_on edges live (table/columns or properties key),
     direction, how to list "objects that point at host X" and "hosts of object Y", and whether
     duplicates are possible. Which types can be targets. The hosting_model values per type
     and compute_runtime_kind. Confirm Ask impact walks edges, not hosting_model.
16.9 relationshipImpactRules (or the equivalent single config of relationship rules): path
     and shape. We will mirror this pattern for lib/cost/costable.ts.
16.10 Workspace settings: where workspace/tenant settings live (column, JSON, table), how to
     read/write them, who is admin. Is there any currency setting?
16.11 History helper, user id for created_by/updated_by, id generator (uuid available?),
     zod or another validator in use.
16.12 Where the Applications and Infrastructure tables, footers and the detail panel are
     rendered (paths from P2/P3); report query module; Vendors and contracts screen; Ask
     aggregate tool (P7a) if present.
16.13 Infrastructure table width at 1280x800 with a 124px Annual cost column: does it
     overflow? List columns and width rules.
16.14 Tests: runner, unit test location, fixtures/seeds, fast-check installed or not (don't
     install).
16.15 Conflicts with COST-SPEC v2 and your recommended adaptation; the list of decisions C1
     must make (lib/cost path, how cost_lines is written atomically, annual_cost string format
     for write-back, settings location).

Finish with a 10-line summary in the chat. Change no code.
```

**Check:** `git status` shows only `DISCOVERY.md`. Read §16.4 carefully: every reader listed there must be refactored in C2. Fix anything wrong by hand. Commit `cost.lines.v1: C0 discovery`.

---

### Prompt C1: Properties schema + cost module plan, then skeleton

Attach: nothing. Mention `@docs/design/DISCOVERY.md`, `@docs/design/COST-SPEC.md`.

```text
Read docs/design/DISCOVERY.md §16 and docs/design/COST-SPEC.md §0-§5.

GOAL
Define properties.cost_lines and the lib/cost/ module skeleton. No new tables, no structural
migrations, no UI, no data changes.

1. FIRST show me a plan and WAIT for my OK:
   a. The zod schema for a cost line (COST-SPEC §4.2) adapted to the repo's validator, and
      how it is enforced on every server-side write of properties (which write path(s) from
      §16.1 get the check, so no other code can write cost_lines).
   b. lib/cost/ file list (COST-SPEC §5 table) at the path convention the repo uses.
   c. costable.ts entries using the REAL type names from §16.2, with annualCostFormat,
      renewalKey, vendorOf, isInHouse, filledWithoutAmount and canHost per type, following
      the relationshipImpactRules pattern from §16.9.
   d. How a line write is atomic with the rest of properties (§16.1) and concurrency-safe.
   e. The annual_cost write-back format per type (§16.3; strings as the existing values are
      written, default plain digits).
   f. Where the workspace currency lives (§16.10; else the workspace/tenant settings JSON),
      default USD.
   g. The flag cost.lines.v1 with the existing flag helper, default off.
   h. Anything you'd do differently from COST-SPEC and why.
2. After OK: add schema.ts, costable.ts, format.ts (currencyLabel, formatMoney),
   vendor.ts (re-export the EXISTING normalizer from §16.7 + displayVendor for platform
   codes; do not write a second normalizer), getWorkspaceCurrency/setWorkspaceCurrency,
   the flag, and the write-path validation hook. Stub service.ts/write.ts with TODO(C2).
3. Tests: schema rules and messages (COST-SPEC T22), currency (T20).

ACCEPTANCE
- No new table, column or migration file in the diff.
- Typecheck, lint, existing tests pass; new tests pass.
- Writing properties with an invalid cost_lines value is rejected server-side (test).
- Flag off: nothing visible changes.

DO NOT
- Parse or sum annual_cost anywhere yet.
- Add per-line currency or FX.
- Create a vendor directory or contracts table.
- Add a package without asking.
```

**Check:** compare the plan with DISCOVERY §16 before saying OK. Commit `cost.lines.v1: C1 schema + module skeleton`.

---

### Prompt C2: Cost module, write-back, refactor of every annual_cost reader

Attach: nothing. Mention `@docs/design/DISCOVERY.md`, `@docs/design/COST-SPEC.md`.

```text
Read COST-SPEC.md §5, §9, §10 and DISCOVERY.md §16 (especially 16.3, 16.4, 16.7, 16.8).

GOAL
lib/cost/ becomes the only reader and writer of cost. Every current annual_cost reader
calls it. No UI yet.

1. math.ts: lineAnnualCents, isEstimated, isInternal, splitLargestRemainder, and
   parseLegacyAnnualCost = the EXISTING parser from §16.3 moved here unchanged (keep the
   old export as a re-export so nothing breaks).
2. service.ts: annualCost / annualCostMany (mode lines | legacy, statuses, renewal,
   includeInternal), portfolioTotals, vendorSpend (lines by line vendor; legacy by vendorOf;
   existing normalizer; in-house and internal excluded), renewals (line renewal_date items +
   object contract_renewal/commitment_ends items, COST-SPEC §5.5), breakdownBy. Leave
   includeAllocated returning null with TODO(C5). Never read license_model, per-call cost,
   token prices or roadmap initiative cost.
3. write.ts: addLine / updateLine / deleteLine: validate, write cost_lines atomically,
   write back annual_cost = run total in the type's format (remove the key at 0), History
   entry. First-line conversion (COST-SPEC §5.4) as a server option
   { legacy: 'keep_as_line' | 'replace' } that the UI will ask for in C4.
4. API routes / server actions for these (per §16.1 conventions), gated by the flag for
   writes. Reads used by legacy screens are NOT gated (they must work flag-off).
5. Refactor EVERY reader in DISCOVERY §16.4 to call the module (portfolioTotals,
   vendorSpend, annualCost, renewals). Paste the checklist in your reply with a tick per
   file. With the flag off, output must be identical to before.
6. Fixture: seed "Meridian Fasteners / Cost eval" per COST-SPEC §9 (map the suggested
   types to the real ones; edges runs_on/built_on as listed). Command e.g.
   npm run seed:meridian -- --with-cost. The base Meridian workspace is unchanged.
7. Tests: COST-SPEC T1-T9, T12, T15 (invariants 1, 2, 4, 5), T16 (except allocated rows),
   T17-T19, T21-T25. T7 legacy parity: snapshot every refactored reader's output on the
   base fixture BEFORE your change, then assert equality after.
   Also give me a read-only PowerShell command that prints spend per workspace from my
   local DB with the old code path vs the module, to compare by hand.

ACCEPTANCE
- All tests pass. AS400 run 2,640,000 / internal 4,500,000 / total 7,140,000 / one-time
  1,500,000; portfolio 23,466,000; vendorSpend 15,966,000 across 11 vendors; renewals(90)
  4 items / 4,198,000 (TODAY 2026-09-25).
- After adding a line in a test, annual_cost is a number on an application and a string
  on a platform/runtime, equal to the run total.
- rg "annual_cost" shows no parsing or summing outside lib/cost (list what's left and why:
  e.g. write-back, the properties type).
- Flag off: every screen shows the same numbers as before (T7 + my manual comparison).

DO NOT
- Create tables, columns or migrations.
- Rewrite annual_cost for objects nobody edited.
- Use hosting_model in any cost calculation.
- Change the base Meridian eval workspace or G01-G44.
```

**Check:** run the tests and the comparison command against your local DB. Commit `cost.lines.v1: C2 cost module + reader refactor`.

---

### Prompt C2b (optional, only when you want it): Backfill legacy annual_cost into lines

Attach: nothing. Mention `@docs/design/COST-SPEC.md` (§6).

```text
Read COST-SPEC.md §6. Add npm run cost:backfill with --workspace <id> and --dry-run.
For each costable object WITHOUT cost_lines whose annual_cost parses > 0 (existing parser),
create one line (type per §6 using the real cost_model values from DISCOVERY §16.3, annual,
flat, source estimate, vendor from vendorOf, migrated_from 'annual_cost'), store
cost_meta.legacy_annual_cost, write back through lib/cost/write.ts. Skip blank/zero,
filled-without-amount and objects that already have lines. Idempotent. History actor
"BuboMap backfill". Write backfill-report-cost.md with counts, per-workspace spend before
and after (must be equal) and the skipped list. First show me the dry run output for my
LOCAL database; do not run the real backfill until I say so. Add a test: running twice
changes nothing; spend before == after.

DO NOT run it against anything but my local database, or wire it into startup/CI.
```

**Check:** read the dry-run report; spend before and after must match. Commit `cost.lines.v1: C2b backfill script`.

---

### Prompt C3: Annual cost column, footer, quick entry (both tables) + 1280 width

Attach: `14-cost-table.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/COST-SPEC.md`.

```text
Read COST-SPEC.md §7.1, §7.2, §7.6 and in the mockup costCell, qeStart, qeKey and CSS
.cc .estm .ctot .qe. Match shot 14.

GOAL
Behind cost.lines.v1, on the Applications AND Infrastructure tables (every costable type
that appears in them, via costable.ts):

1. Column "Annual cost (US$)" after Vendor, all cell states in COST-SPEC §7.1 (has_cost,
   internal_only, shared_only, filled_no_amount, legacy value, blank), from ONE
   annualCostMany call per page. shared_only cells use includeAllocated for the displayed
   share only.
2. Footer from portfolioTotals({ types: this table, filters }) with the §7.1 text. Shares
   are never in it.
3. Sort by total (blank last); Missing = status blank; Renewal column = breakdown renewal.
4. Quick entry on blank cells (strings from the mockup): creates one subscription/annual/
   estimate line via write.ts, which writes back annual_cost. Re-render from the response.
5. 1280x800 width fix (COST-SPEC §7.6), both tables.
6. Flag off: tables exactly as before.

ACCEPTANCE (Cost eval workspace)
- Applications footer "Total $88,430 · 45% estimated · incl. ~$30,000 internal (est.)".
- Infrastructure footer "Total $146,230 · 31% estimated · incl. ~$45,000 internal (est.) ·
  $15,000 one-time not included".
- AS400 "est. $71,400" + "+ $15,000 one-time"; Microsoft 365 tenant "$51,840" +
  "Allocated to 4 apps"; Teams "$12,960" + "25% · shared" (not in the footer); Inventory
  "No license cost"; Order Entry "~$30,000"; Shop Floor Label Printing amber "+ Add".
- Typing 9600 on a blank application cell creates a line; properties.annual_cost becomes
  9600 (number); footer updates from the server.
- No horizontal scroll at 1280x800 on either table.

DO NOT
- Compute totals in components or parse annual_cost in the UI.
- Put allocated shares into footers.
- Fetch per row.
```

**Check:** shot 14 at 1440×900 (the mockup footers differ on purpose, see §5 notes), then 1280×800. Commit `cost.lines.v1: C3 table column + quick entry`.

---

### Prompt C4: Panel Cost section and Add/edit cost line form

Attach: `15-cost-panel-onprem.png`, `16-cost-panel-shared-saas.png`, `17-cost-add-line.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/COST-SPEC.md`.

```text
Read COST-SPEC.md §4.2 (messages), §5.4, §7.3, §7.4 and in the mockup costSection,
costLineCard, calcText, renewBadge, costForm, cfDefaults, cfAnnual, cfOutHTML, cfSave.
Match shots 15-17.

GOAL
Behind cost.lines.v1, in the detail panel of every costable type:

1. Replace the old Contract block with Vendor + Cost (COST-SPEC §7.3 order). The object's
   renewal key (contract_renewal / commitment_ends) stays editable in Cost as "Renewal date".
   Key facts "Annual cost" is read-only from the breakdown.
2. Cost section from annualCost (items 1-3, 7-9 of §7.3): summary, Recurring cards with
   chips (line renewal_date, else the object's renewal), One-time group, empty/in-house/
   legacy states, footer. Edit/Delete on hover.
3. Form (§7.4): Type, Name, Calculation, amount row, live output via lib/cost/math.ts,
   Vendor prefilled with vendorOf (platform code -> display name; runtime vendor, not
   runtime_provider; in-house none), Renewal ("Uses {record}'s renewal" or own date +
   notice + auto-renews), Shared by (platforms/runtimes only: this record only / split
   evenly across the records that run on or are built on it / custom %), Source.
   Saves via write.ts; errors inline with the spec messages.
4. First-line conversion: adding the first line where annual_cost > 0 asks "This record
   already has an annual cost of $X. Keep it as a line?" [Keep as a line] [Replace it].
5. Workspace settings: Currency select (US$ / CA$), admin only, confirm text from §3.
6. History tab shows cost entries.

ACCEPTANCE (Cost eval workspace)
- AS400 matches shot 15: $71,400/yr, incl. ~$45,000 internal (est.), one-time $15,000,
  IBM "90-day notice · by Dec 1" + "auto-renews" (line renewal), Keystone
  "20% of license ($42,000) = $8,400/yr" + Quote + "different vendor".
- Form matches shot 17; a per-user 40 x $10 line previews $4,800/yr.
- Adding a $1,200/mo hosting line to AWS account: panel, table cell and footer update
  (+$14,400) and properties.annual_cost becomes "33000" (string).
- Flag off: old panel as before.

DO NOT
- Build the allocated-in blocks or "No host linked" (C5).
- Edit annual_cost directly once lines exist.
- Compute saved totals in the client.
```

**Check:** shots 15–17 at 1440×900 (the Teams shared block comes in C5). Commit `cost.lines.v1: C4 panel cost section`.

---

### Prompt C5: Shared lines and infrastructure share (allocated, not added)

Attach: `16-cost-panel-shared-saas.png`, `15-cost-panel-onprem.png`. Mention `@docs/design/DISCOVERY.md` (16.8), `@docs/design/COST-SPEC.md`.

```text
Read COST-SPEC.md §5.3, §5.5 invariant 3, §7.3 items 4-6, §9 allocated rows.

GOAL
Dependents see their part of host costs; no total ever adds it.

1. service.ts includeAllocated: dependents of host H = distinct objects with runs_on or
   built_on edges to H (DISCOVERY §16.8), loaded once per request. Lines with allocation
   -> "Share of {label}" (even / custom with overrides, remainder rules, stale keys ignored
   and flagged). Other recurring lines (and a legacy host's parsed annual_cost) -> pooled
   infrastructure share, split evenly, same includeInternal as the caller. Each host line
   reaches a dependent once. No cascade. Never use hosting_model.
2. hostHint 'no_host_linked' when hosting_model is on_premise / hybrid / self_hosted (use
   the real values from §16.8) and the object has no runs_on/built_on edge.
3. Panel: allocated-in blocks (the mockup's shared block with the new wording: "Share of
   Microsoft 365 E3 · allocated, not added", rows, "Line total", "Open Microsoft 365
   tenant →"; then "Infrastructure share · allocated, not added" rows per host), toggle
   "Include allocated costs" (off, per user), host block "Shared by {n}", "Unallocated
   {pct}%", and "No host linked · Add host" (opens the existing runs_on editor).
4. portfolioTotals, vendorSpend, renewals, footers: add a comment "never includes
   allocated amounts" and a test.
5. Tests: T10, T11, T13, T14, T15 with invariant 3 and random edges, T16 allocated rows.

ACCEPTANCE (Cost eval workspace)
- Teams: "Allocated share $12,960", "Share of Microsoft 365 E3 · allocated, not added",
  4 rows, "Line total $51,840" — matches shot 16 apart from that wording.
- EDI Gateway: toggle off $9,800; on $42,900 (AS400 1/3 of $71,400 = $23,800; AWS
  account 1/2 of $18,600 = $9,300). Order Entry on: $53,800.
- AS400 panel "Shared by 3"; Microsoft 365 tenant "Shared by 4".
- Shop Floor Label Printing: "No host linked · Add host"; adding a runs_on edge to the
  AS400 makes the AS400 split 4 ways ($17,850 each) without changing any total.
- Applications footer $88,430, Infrastructure $146,230, vendor spend $159,660 regardless
  of the toggle.

DO NOT
- Store computed shares.
- Change relationships or hosting_model.
- Add shares to any total.
```

**Check:** toggle on EDI, then look at footers and `/reports/spend`: nothing moved. Commit `cost.lines.v1: C5 shares`.

---

### Prompt C6a: Spend report, Vendors and contracts screen, renewals

Attach: `18-spend-report.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/COST-SPEC.md`.

```text
Read COST-SPEC.md §5.5 and §7.5 and the mockup spend report (.runsplit). Match shot 18.

GOAL
Behind cost.lines.v1: the Run / Internal / One-time strip, "Annual cost by vendor" from
vendorSpend(), the vendor table and footer (mockup strings), the Vendors and contracts
screen from vendorSpend() with each vendor's objects and lines, Overview "Annual spend"
KPI (vendor run cost + "+ ~$75,000 internal (est.)"), renewals card/KPI from
renewals({withinDays: 90}) listed per object with lines underneath, and the CSV (one row
per line + one per legacy object). No sums in components.

ACCEPTANCE (Cost eval workspace)
- Strip "Vendor run cost $159,660/yr" · "Internal (est.) ~$75,000/yr not included" ·
  "One-time $15,000 ... not included"; "11 vendors · $159,660"; Microsoft $51,840 once.
- Renewing in 90 days: $41,980, 4 items; Salesforce notice by Oct 1.
- CSV recurring rows sum to 234,660; one-time 15,000.
- Flag off: P5 report and Vendors screen show the same numbers as before C2.

DO NOT
- Count a shared line more than once or add infrastructure share.
- Read annual_cost directly.
```

**Check:** shot 18; sum the CSV in Excel. Commit `cost.lines.v1: C6a reports`.

---

### Prompt C6b: Ask for cost questions

Attach: nothing. Mention `@docs/design/ASK-GROUNDING-SPEC.md` (§10), `@docs/design/COST-SPEC.md`, `@docs/design/DISCOVERY.md`.

```text
Read ASK-GROUNDING-SPEC.md §10 with §1, §2, §5, §7, and COST-SPEC §8-§9.

GOAL
Ask answers cost questions only from lib/cost/, cites objects and their line ids, and
still walks relationships for impact.

1. P6 deterministic handlers (spend by vendor, renewals, "what does X cost") call
   vendorSpend / renewals / annualCost. (Do this even without P7.)
2. P7 (ASK-GROUNDING §10.2-10.4): RecordSummary cost fields from annualCost; aggregate
   uses the module (include_internal, sum_one_time, group_by cost_type | source | vendor);
   new tool cost_breakdown(object_id, include_allocated?) with lines, renewal items and
   allocated-in shares; citations "object:<id>#line:<lineId>" hydrate to the object panel
   ?sec=cost&line=<lineId>; register every number for the validator.
3. Metamodel {{COST_NOTES}} (§10.5) when the flag is on; {{CURRENCY}} from the setting.
4. Eval: cost overlay + C01-C08 (§10.6), npm run ask:eval -- --suite=cost --provider=fake.
   G01-G44 pass unchanged on the base fixture.

ACCEPTANCE
- Both suites pass with the fake provider.
- "What does the AS400 really cost us?" -> $71,400/yr (run $26,400 + ~$45,000 est.),
  $15,000 one-time not included; cites as400 and its 4 line ids.
- "What did we pay IBM last year?" -> run-rate, not payments; offers $18,000/yr.
- The validator rejects a cost number not returned by a tool in the turn (test).

DO NOT
- Let the model add, split or multiply amounts.
- Read annual_cost or hosting_model in Ask cost tools.
- Change G01-G44 or the base fixture.
```

**Check:** run both eval suites; ask the questions in the UI on both the deterministic path and the `/ai/ask` path (there is no `ask.llm.v1` flag; see CURSOR-ASK-FIXES.md). Commit `cost.lines.v1: C6b ask cost`.

---

## 3. Fidelity checklist (cost)

Mockup and app side by side at 1440×900 (and 1280×800 where noted), Cost eval workspace, `cost.lines.v1` on.

**14 Cost table** (`#/model/applications`, `#/model/infrastructure`)
- [ ] "Annual cost (US$)" after Vendor on **both** tables; `est.` chip; "+ $15,000 one-time"; "25% · shared"; muted "~$30,000"; "No license cost"; amber "+ Add"
- [ ] Footer segments as COST-SPEC §7.1 (product totals $88,430 / $146,230; the mockup shows $140,270 / $94,390 because it attributes M365 to apps)
- [ ] Quick entry hint "Enter saves as 1 Subscription line · Estimate · Esc cancels"; toast "Added a Subscription line (Estimate) of $9,600/yr to HubSpot"
- [ ] 1280×800: no horizontal scroll on either table

**15 Cost panel, on-prem** (`#/model/infrastructure/as400?sec=cost`)
- [ ] Vendor + Cost sections, no old Contract block; Renewal date field in Cost
- [ ] Summary "$71,400/yr", "incl. ~$45,000 internal (est.)", one-time box, Run cost / Internal bar
- [ ] Line cards with chips "renews in 5 months", "90-day notice · by Dec 1", "auto-renews", "different vendor"; no contract-name chip
- [ ] (C5) "Shared by 3"

**16 Cost panel, shared SaaS** (`#/model/applications/teams?sec=cost`)
- [ ] "Share of Microsoft 365 E3 · allocated, not added", rows with "(this app)", "Line total $51,840", "Open Microsoft 365 tenant →"
- [ ] Summary label "Allocated share"; toggle "Include allocated costs" (off)

**17 Add cost line** (`#/model/applications/teams?sec=cost&add=user`)
- [ ] Type chips, Name, Calculation, amount row, live output, Vendor (prefilled), Renewal (uses the record's / own date), Shared by (platforms/runtimes only), Source

**18 Spend report** (`#/reports/spend`)
- [ ] Strip, "Annual cost by vendor", "11 vendors · $159,660", footer "Vendor spend only: …"

**Other**
- [ ] "No host linked · Add host" on an on-premise object with no runs_on
- [ ] CA$ switch relabels; amounts identical

---

## 4. If Cursor drifts (cost)

General prompts in CURSOR-UI-INSTRUCTIONS §5 still apply.

**It wants a table or migration**
```text
Stop. There are no cost tables. Cost lines live in objects.properties.cost_lines (JSON),
validated by the zod schema in lib/cost/schema.ts. Revert any table, column or migration
file and use the properties write path from DISCOVERY §16.1.
```

**It parsed annual_cost outside lib/cost**
```text
Only lib/cost reads or writes annual_cost and cost_lines. Replace your parsing with
annualCost / portfolioTotals / vendorSpend / renewals, then show me
rg -n "annual_cost" --glob "!node_modules" and explain every hit outside lib/cost.
```

**It used hosting_model for money**
```text
hosting_model is a label. Shares and "who runs on what" come only from runs_on / built_on
edges (DISCOVERY §16.8). The only use of hosting_model in cost is the "No host linked"
hint. Remove every other use.
```

**It counted something twice**
```text
Each line counts once, at the object that holds it. Shared lines and infrastructure share
are allocated, not added: never in portfolioTotals, vendorSpend, footers, reports or Ask
spend. Run the no-double-counting test (COST-SPEC T15); fix the code, not the test.
```

**It rewrote data nobody edited**
```text
Objects without cost_lines must not change. annual_cost is written back only for the
object whose lines changed. Bulk conversion is the separate, opt-in backfill (C2b).
Revert the bulk change.
```

**It wrote a new vendor normalizer or directory**
```text
Use the existing vendor normalizer from DISCOVERY §16.7 (re-exported in lib/cost/vendor.ts).
No vendor table, no second normalizer. Delete yours.
```

**It changed numbers with the flag off**
```text
With cost.lines.v1 off, every refactored screen must show exactly the numbers it showed
before C2. Run the legacy parity test (T7) and fix the difference.
```

**It hard-coded Meridian numbers**
```text
$51,840, $71,400, AS400, Microsoft 365 and the other COST-SPEC §9 values belong in
tests/fixtures only. Replace them with values from lib/cost.
```

---

## 5. Notes

- **Mockup vs product (numbers kept as they are in the mockup):** the mockup attributes the Microsoft 365 E3 shares to the four apps, so its Applications footer is $140,270 and Infrastructure $94,390. The product keeps the line on the Microsoft 365 tenant (allocated, not added): $88,430 / $146,230. The mockup's tenant cell says "Allocated to 4 apps" without the $51,840 above it, and the form preview in shot 17 reads "Microsoft Teams: $12,960 → $17,760/yr after saving" (the product shows own cost: $0 → $4,800). Portfolio ($234,660), vendor spend ($159,660) and every per-object number match.
- The mockup's "Contract" wording was changed to match the storage facts (no contracts table): line cards have no contract-name chip; the shared block reads "Share of Microsoft 365 E3 · allocated, not added" / "Line total" / "Open Microsoft 365 tenant →"; Teams' summary label is "Allocated share" ("from Microsoft 365 tenant · not added to totals"); the form's Contract section became Renewal (None / Record's renewal / Own date) plus Shared by (platforms/runtimes only). Shots 06 and 15–17 were retaken; 14 and 18 are unchanged.
- The mockup has no infrastructure-share or "No host linked" UI; build them from COST-SPEC §7.3.
- The eval TODAY is 2026-09-25; the mockup's is 2026-09-28.
- "Vendors & contracts" stays the screen name (it's the existing screen); "contract" in renewal copy refers to `contract_renewal`.
- New copy is marked *(new)* in COST-SPEC §7. Open questions: COST-SPEC §12.
