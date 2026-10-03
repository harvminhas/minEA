# BuboMap: Cost lines (Applications + Infrastructure) — spec v2

**Flag:** `cost.lines.v1` (requires `repository.mvp.v1`; default off)
**Prompts:** CURSOR-COST-INSTRUCTIONS.md (C0–C6b, plus optional C2b backfill)
**Mockup:** `bubomap-ui.html`, shots `14-cost-table.png` … `18-spend-report.png`
**Builds on:** REPOSITORY-MVP-SPEC.md, ASK-GROUNDING-SPEC.md §10
**v2 (Sep 28, 2026):** rewritten for how minEA really stores data: cost, vendor and hosting are keys in `objects.properties` (JSON), not records. **No new tables and no structural migrations.** Cost lines live in `properties.cost_lines`. Owner is a real column and is not touched.

Names below that come from the user's description of the repo are marked **(fact)**. Everything else is a design choice. C0 confirms every fact in the code and writes DISCOVERY.md §16; if the code disagrees, the code wins and Cursor asks.

---

## 0. Storage facts this design is built on

| Topic | Fact (from the repo owner) |
|---|---|
| Objects | One `objects` table; each object has a type and a `properties` JSON blob. Owner is a real column. **(fact)** |
| Vendor | A string in properties. Applications, solutions, technical capabilities: free text `properties.vendor`. Platforms: a short code (`oracle`, `microsoft`, `salesforce`, … presets) + optional `vendor_product`. Runtimes: supplier in `vendor`, separate from `runtime_provider` (who hosts it). No vendor directory: the Vendors and contracts screen and Ask group the strings case-insensitively and drop hosting words (`saas`, `on_premise`, `cloud`, …). `is_custom_built` = in-house. **(fact)** |
| Cost | `properties.annual_cost`: a **number** on applications; a **string** on platforms, integration tools and runtimes. Only a value that parses to a number > 0 is added to spend. Zero and blank = missing. A runtime with `cost_model = capex`, and a custom-built system with no number, count as **filled, no amount**. **(fact)** |
| Not in the total | `license_model`, per-call cost, model token prices, roadmap initiative cost are stored separately and are not part of the total. **(fact)** |
| Renewal | `contract_renewal` on applications, platforms and tools; `commitment_ends` on runtimes. **(fact)** |
| Hosting | Stored twice. `hosting_model` is a label (application: `cloud` \| `on_premise` \| `hybrid` \| `saas`; platform: `saas` \| `paas` \| `self_hosted` \| `hybrid`); the catalog labels On-prem server / SaaS platform / Cloud come from it plus `compute_runtime_kind`. Where something actually runs is a **relationship**: `runs_on` and `built_on` point at a platform or runtime. Ask's impact walks relationships, never `hosting_model`. A system can say on-premise and have no host link. **(fact)** |

---

## 1. Principles

1. **Cost lines are the detail; `annual_cost` stays the legacy total.** Lines live in `properties.cost_lines`. When they exist, `annual_cost` is derived from them (write-back, §5.4) so every legacy reader stays correct.
2. **One cost module (`lib/cost/`) is the only reader and writer** of `cost_lines` and `annual_cost`. Spend, the Vendors and contracts screen, tables, panel, reports, CSV and Ask call it. Nobody else parses `annual_cost`. The UI never adds, multiplies or normalizes saved amounts.
3. **Count once.** Every line counts once, at the object that holds it. Shared lines (M365) and infrastructure share are **allocated, not added**: shown on dependents, never in portfolio, vendor, table-footer or report totals.
4. **Relationships, not labels.** Sharing and infrastructure share follow `runs_on` / `built_on` edges only. `hosting_model` is never used to allocate money.
5. **One currency per workspace** (USD or CAD), no per-line currency, no conversion. Amounts in lines are integer cents.
6. **Estimates stay visible.** `source = estimate` and internal lines show `est.`; totals say what % is estimated.
7. **Run-rate, not actuals.** No invoices-paid history. Ask says so.
8. **No bulk rewrite.** Objects without `cost_lines` are untouched. Backfill (legacy value → one line) runs only on request, dry run first (C2b).

---

## 2. Glossary (UI words)

| Term | Meaning |
|---|---|
| Annual cost | The object's own recurring lines normalized to a year, incl. internal estimates (flagged). Excludes one-time and anything allocated in. Legacy objects: parsed `annual_cost`. |
| Run cost | Annual cost minus internal estimates = money paid to vendors. This is what's written back to `annual_cost`. |
| Internal (est.) | Staff time; always an estimate; no vendor spend. |
| One-time | `frequency = one_time` lines; shown separately with a date. |
| Share of {line} | A dependent's part of a shared line on its host (line has `allocation`). Allocated, not added. |
| Infrastructure share | A dependent's even part of its host's other lines (no `allocation`). Allocated, not added. |
| Dependents of a host | Objects with a `runs_on` or `built_on` edge to that platform/runtime (counted once each). |

---

## 3. Workspace currency

| Item | Rule |
|---|---|
| Setting | `currency`: `USD` \| `CAD`, default `USD`. Stored where workspace settings live (C0 finds it); if nowhere, in the workspace/tenant settings JSON. |
| Label / format | `currencyLabel`: `US$` / `CA$`. `formatMoney(cents, currency)` → `$51,840`, `$12.50`; en-US grouping, narrow `$` for both. |
| Where shown | Column header `Annual cost (US$)`; panel footer `Amounts in US$ · change in Workspace settings`; report footers `Amounts in US$.`; Ask: first amount per answer `US$51,840`. |
| Change | Admin only; confirm `Change workspace currency to CA$? Amounts are not converted — they are relabelled.`; nothing is recalculated. |
| Legacy values | `annual_cost` has no currency; it's read in the workspace currency. |

---

## 4. Data: `properties.cost_lines`

### 4.1 Costable types (config)

`lib/cost/costable.ts` — one config, same single-config pattern as `relationshipImpactRules` (C0 finds where that lives and mirrors it). Type names are confirmed in C0.

```ts
type CostableType = 'application' | 'solution' | 'technical_capability' | 'platform' | 'integration_tool' | 'runtime'; // confirm in C0

interface CostableDef {
  type: CostableType;
  table: 'applications' | 'infrastructure' | 'connections' | null;   // which BuboMap list shows it (C0 confirms)
  annualCostFormat: 'number' | 'string';          // application: number; platform, integration_tool, runtime: string (fact); others: C0
  renewalKey: 'contract_renewal' | 'commitment_ends' | null;          // runtime: commitment_ends (fact)
  vendorOf(p: Properties): string | null;         // app/solution/tech cap: p.vendor; platform: displayName(p.vendor code) (+ vendor_product for labels only); runtime: p.vendor (NOT runtime_provider)
  isInHouse(p: Properties): boolean;              // p.is_custom_built === true
  filledWithoutAmount(p: Properties): boolean;    // runtime && cost_model === 'capex'; or is_custom_built && no amount (fact)
  canHost: boolean;                               // platform, runtime: targets of runs_on/built_on
}
```

Adding a type later = one config entry. Nothing else hard-codes type names.

### 4.2 Line shape (zod, validated on every write, server-side)

```ts
const CostLine = z.object({
  id: z.string().uuid(),
  type: z.enum(['subscription','support_maintenance','hosting','services_one_time','internal_estimate','other']),
  label: z.string().max(120).optional(),                 // "IBM Power support"; default = type label
  amount_cents: z.number().int().min(0).max(1e11).optional(),   // flat only
  frequency: z.enum(['monthly','annual','one_time']),
  calculation: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('flat') }),
    z.object({ kind: z.literal('per_user'), seats: z.number().int().min(1), unit_price_monthly_cents: z.number().int().min(0) }),
    z.object({ kind: z.literal('pct_of_license'), pct_bp: z.number().int().min(1).max(10000), license_amount_cents: z.number().int().min(0) }), // pct in basis points; licence = annual
  ]),
  vendor: z.string().max(120).nullable(),                // free text; null for internal
  renewal_date: z.string().date().optional(),            // own renewal, e.g. a third-party support contract
  notice_days: z.number().int().min(0).max(730).optional(),  // applies to renewal_date, else the object's renewal key
  auto_renew: z.boolean().optional(),
  source: z.enum(['estimate','quote','invoice']),
  one_time_date: z.string().date().optional(),           // required when one_time (1st of month ok)
  notes: z.string().max(2000).optional(),
  allocation: z.object({                                 // only on lines of objects with canHost
    mode: z.enum(['even','custom']),
    overrides: z.record(z.string(), z.number().int().min(0).max(10000)).optional(), // objectId -> pct_bp
  }).optional(),
  created_at: z.string().datetime(), created_by: z.string(),
  updated_at: z.string().datetime(), updated_by: z.string(),
  migrated_from: z.literal('annual_cost').optional(),    // set by backfill / first-line conversion
});
// properties.cost_lines: CostLine[] (absent = legacy object)
// properties.cost_meta?: { legacy_annual_cost?: string | number, converted_at?: string }  (audit of the pre-lines value)
```

**Rules (refinements; the UI shows the same messages):**

| Rule | Message |
|---|---|
| `services_one_time` ⇒ `one_time` + `flat` | `Services are one-time. Use Other for recurring services.` |
| `internal_estimate` ⇒ `source = estimate`, `vendor = null` | (form hides Vendor/Source) |
| `per_user` / `pct_of_license` ⇒ not `one_time` | `Seats and price per user per month are required.` / `Percentage and licence amount are required.` |
| `flat` ⇒ `amount_cents` set | `Enter an amount first` |
| `one_time` ⇒ `one_time_date` | `When was (or is) it paid?` |
| `allocation` only on platform/runtime lines | `Only lines on a platform or runtime can be shared.` |
| `custom` overrides Σ ≤ 10000 and keys are current dependents | `Shares add up to more than 100%.` / `{name} no longer runs on this.` (stale keys are ignored in maths and flagged in the panel) |

- Writes go through `lib/cost/write.ts` (add/update/delete line) which: validates, updates `cost_lines` atomically with the rest of `properties` (read-modify-write in one transaction or with the repo's optimistic-concurrency pattern; C0 finds it), writes back `annual_cost` (§5.4), and writes a History entry with the existing helper: `Cost line added: IBM Power support · $18,000/yr (invoice)`.
- Permissions: whoever can edit the object's properties can edit its lines. Currency: admins.

---

## 5. The cost module (`lib/cost/`)

| File | Contents |
|---|---|
| `schema.ts` | zod `CostLine`, types |
| `costable.ts` | §4.1 config |
| `math.ts` | pure, isomorphic: `lineAnnualCents`, `isEstimated`, `isInternal`, `splitLargestRemainder`, `parseLegacyAnnualCost` |
| `vendor.ts` | re-exports the **existing** vendor normalizer (C0 finds it) + `displayVendor(code)` for platform short codes |
| `service.ts` | server-only reads (§5.2–5.6) |
| `write.ts` | server-only writes + write-back + History |
| `format.ts` | `currencyLabel`, `formatMoney` |

### 5.1 Line maths

| calculation | frequency | annual cents |
|---|---|---|
| flat | monthly | `amount × 12` |
| flat | annual | `amount` |
| flat | one_time | `0` (one-time bucket) |
| per_user | monthly/annual (billing, display only) | `seats × unit_price_monthly × 12` |
| pct_of_license | monthly/annual (display only) | `round_half_up(license × pct_bp / 10000)` |

`isEstimated = source === 'estimate' || type === 'internal_estimate'`. Splits use largest remainder ($100.00 ÷ 3 → 3334/3333/3333, ties by object id).

### 5.2 `annualCost(object, opts)` — one object

```ts
annualCost(obj, { includeInternal = true, includeAllocated = false }): CostBreakdown

interface CostBreakdown {
  objectId: string; type: CostableType; currency: 'USD'|'CAD';
  mode: 'lines' | 'legacy';
  run: number; internal: number; total: number;          // cents; own lines only
  estimated: number; estimatedPct: number;
  oneTime: { cents: number; lines: LineView[] };
  lines: LineView[];                                     // own recurring lines
  status: 'has_cost' | 'internal_only' | 'filled_no_amount' | 'shared_only' | 'blank';
  renewal: { date: string | null; source: 'object' | 'line'; lineId?: string; noticeBy?: string } | null; // earliest upcoming
  allocatedIn: AllocatedView[] | null;                   // only when includeAllocated (Share of {line} + Infrastructure share per host)
  totalWithAllocated: number | null;
  dependents?: { count: number; ids: string[] };         // hosts only
  hostHint?: 'no_host_linked';                           // hosting_model says on_premise/hybrid/self_hosted but no runs_on/built_on edge
  formatted: Record<string, string>;
}
```

- **mode `lines`** (`cost_lines` present, even if empty array): totals from lines.
- **mode `legacy`** (no `cost_lines`): `run = total = parseLegacyAnnualCost(properties.annual_cost)` with the existing rules: a number, or a string that parses to a number > 0, counts as `run`. Legacy values have no source, so `estimated = 0` and no `est.` chip. Zero/blank → `status = 'blank'` unless `filledWithoutAmount` → `'filled_no_amount'`. `parseLegacyAnnualCost` is the **existing** parser moved into the module (behaviour unchanged, covered by parity tests).
- `status = 'shared_only'` when own total is 0 but a shared line is allocated in (e.g. Teams). Shared-only and `filled_no_amount` are **not missing**.
- Batch: `annualCostMany(objs, opts)` loads edges once; equals single calls (test).

### 5.3 Shared lines and infrastructure share (allocated, not added)

For a host `H` (platform or runtime) and its dependents `D(H)` = distinct objects with a `runs_on` or `built_on` edge to `H` (C0 finds where edges live):

- **Shared line** (`allocation` set): its annual is split across `D(H)` — `even`: equal parts; `custom`: `overrides` pct for listed dependents, the rest split evenly among unlisted dependents; if all are listed, any remainder shows on the host as `Unallocated {pct}%`. Dependents show `Share of {label} · allocated, not added`.
- **Infrastructure share**: the host's other recurring lines (and a legacy host's parsed `annual_cost`) pooled, using the caller's `includeInternal`, split evenly across `D(H)`. Dependents show one row per host: `AS400 · 1/3 of $71,400 · $23,800/yr`.
- A host line is shown to a dependent **once**: either as a named share (has `allocation`) or inside the pool.
- **No cascade** (a runtime on a platform doesn't pass its share further). Optional later.
- If a dependent has `hosting_model` in {`on_premise`, `hybrid`, `self_hosted`} (C0 confirms the list) and **no** edge: no share, panel shows `No host linked · Add host` (opens the existing relationship editor for `runs_on`).
- These amounts appear only in `annualCost(..., { includeAllocated: true })`. `portfolioTotals`, `vendorSpend`, `renewals`, footers, reports and Ask spend aggregates **never** include them.

### 5.4 Write-back to `annual_cost` (dual write)

Whenever an object's `cost_lines` change, `write.ts` sets `properties.annual_cost` = the object's **run** total (recurring, external, excluding internal and one-time), in that type's format (`annualCostFormat`: number for applications; string for platforms/tools/runtimes, in the format C0 finds existing values use, default plain digits like `"26400"`). If run = 0 the key is removed (legacy readers then see blank; `filledWithoutAmount` still applies).

- **First-line conversion:** adding the first line to an object whose legacy `annual_cost` parses > 0 first stores the old value in `cost_meta.legacy_annual_cost` and asks: `This record already has an annual cost of $9,800. Keep it as a line?` — `Keep as a line` (creates one subscription/annual/flat line, source estimate, `migrated_from: 'annual_cost'`, vendor = object vendor) or `Replace it`. Quick entry only runs on blank cells, so it never hits this.
- Once `cost_lines` exist, the UI edits lines only; the `annual_cost` editor is replaced by the read-only total.
- Only objects the user edits change. No bulk rewrite.

### 5.5 Workspace functions

| Function | Returns | Rule |
|---|---|---|
| `portfolioTotals({ types?, filters?, includeInternal })` | total, run, internal, oneTime, estimated %, byTable, `missing` ids | Σ own totals (lines or legacy). Never allocated amounts. |
| `vendorSpend()` | `[{ vendor, cents, objects, lines, pct }]` desc | Lines mode: each recurring external line by its own `vendor`. Legacy mode: parsed `annual_cost` by the object's vendor (`vendorOf`). Grouped with the existing normalizer (case-insensitive, hosting words dropped, platform codes → display names). In-house objects and internal lines have no vendor spend. |
| `renewals({ withinDays, from })` | items + sum | Items: (a) every line with its own `renewal_date` → that line's annual; (b) every object with `contract_renewal` / `commitment_ends` → the annual of its recurring external lines **without** their own `renewal_date` (legacy objects: parsed `annual_cost`); an item with 0 value is still listed (`no cost`). Per object, `renewal` in the breakdown = earliest upcoming item. `notice_by = date − notice_days` (line `notice_days`; object-level items use the notice of their lines if all agree). |
| `breakdownBy('cost_type' \| 'source' \| 'vendor' \| 'table')` | groups | line level, count once |

**Excluded from every total (fact):** `license_model`, per-call cost, model token prices, roadmap initiative cost. The module never reads them. A test sets them on fixture objects and asserts no total changes.

**Invariants (property tests):**
1. Σ `vendorSpend` = Σ recurring external line annuals + Σ legacy parsed values (of non-in-house objects), for any allocations/edges.
2. Σ own `annualCost(o).total` over all costable objects = `portfolioTotals().total`.
3. Σ `totalWithAllocated` − `portfolioTotals().total` = Σ of all shares allocated to dependents (so shares are never added).
4. Allocation parts of a line sum to the line exactly (plus any explicit `Unallocated`).
5. After any write, `annual_cost` = run total in the type's format (or absent when 0).

### 5.6 Legacy readers

C0 lists every current reader of `annual_cost` (`rg -n "annual_cost"` plus any `properties\[['\"]annual_cost` / dynamic access), e.g. spend report, Vendors and contracts screen, Overview KPIs, Ask aggregate, completeness/missing counters, CSV. C2 refactors **each** to call the module. With the flag off, results must be byte-for-byte the same as before (parity test on fixture + a read-only comparison script against the local DB).

---

## 6. Optional backfill (C2b — only on request)

`npm run cost:backfill -- --workspace <id> --dry-run` then without `--dry-run`:

- For each costable object **without** `cost_lines` whose legacy `annual_cost` parses > 0: create one line `{type: subscription (support_maintenance if cost_model says support; hosting for runtimes with cost_model usage/opex — C0 lists real values), frequency annual, flat, amount, source estimate, vendor = vendorOf, migrated_from 'annual_cost'}`, copy `cost_meta.legacy_annual_cost`, write-back (value unchanged by construction).
- Skips: blank/zero, `filledWithoutAmount`, objects that already have `cost_lines`. Re-runnable (idempotent). History actor `BuboMap backfill`.
- Report `backfill-report-cost.md`: counts, per-workspace spend before/after (**must be equal**), skipped list.
- Never runs automatically, never in CI against real data.

---

## 7. UI (mockup shots 14–18 win for copy; *(new)* = not in the mockup)

### 7.1 `Annual cost (US$)` column — Applications and Infrastructure tables (shot 14)

After Vendor, before Renewal; right-aligned; ~124px.

| status | Cell |
|---|---|
| has_cost | `$31,500`; `est.` chip if estimated; sub-line `+ $15,000 one-time` if any; hosts with shared lines: sub-line `Allocated to 4 apps` |
| internal_only | muted `~$30,000` + `est.` |
| shared_only | `$12,960` (the share, from `includeAllocated`) with sub-line `25% · shared`; hover *(new)* `Share of Microsoft 365 E3 on Microsoft 365 tenant · allocated, not added`. **Not in the footer.** |
| filled_no_amount | muted `No license cost` (custom-built) or *(new)* `Capex` (runtime `cost_model = capex`) |
| legacy with value | `$18,600` (no `est.`), *(new)* hover `From Annual cost (no cost lines yet)` |
| blank | amber `+ Add` → quick entry |

Footer `Total $88,430 · 45% estimated · incl. ~$30,000 internal (est.)` (+ `· $15,000 one-time not included` when non-zero), from `portfolioTotals({ types: this table, filters })`. Renewal column = breakdown `renewal` (object key or earliest line). Missing = `blank`.

### 7.2 Quick entry

Blank cell → `$ [ ] /yr` + hint `Enter saves as 1 Subscription line · Estimate · Esc cancels`. Enter creates one line (subscription, annual, flat, estimate, vendor = `vendorOf`, `null` for in-house) → write-back sets `annual_cost` → cell re-renders from the server. Toast `Added a Subscription line (Estimate) of $9,600/yr to HubSpot`. Invalid: `Type an annual amount, e.g. 4500`. Non-blank cells open the panel `?sec=cost`.

### 7.3 Panel `Cost` section (shots 15, 16)

Replaces the old `Contract` block when the flag is on. Order: Key facts → Hosted where → Vendor → **Cost** → Governance. The object-level renewal (`contract_renewal` / `commitment_ends`) stays an editable field in Cost (label `Renewal date`), because it's a real object property.

1. Summary: `Annual cost $71,400/yr`, `incl. ~$45,000 internal (est.)`, one-time box `$15,000 · 2026 · not in annual`, Run cost / Internal bar (mockup). Shared-only objects: label *(new)* `Allocated share` instead of `Annual cost`, sub `not added to totals`.
2. `Recurring` line cards (mockup `costLineCard`): name, amount, `{type} · {vendor}`, calc text (`20% of license ($42,000) = $8,400/yr`), chips: source, `different vendor`, `renews in 5 months`, `90-day notice · by Dec 1`, `auto-renews`, `quick entry`. Renewal chips use the line's `renewal_date`, else the object's.
3. `One-time · not in the annual total` group.
4. **Allocated in** (dependents; `includeAllocated`): `Share of Microsoft 365 E3 · allocated, not added` block (split mode, one row per dependent with % and amount, `(this app)`, `Line total`, `Open Microsoft 365 tenant →`), then `Infrastructure share · allocated, not added` rows per host, and the toggle `Include allocated costs` (off, remembered per user) that switches the summary to `totalWithAllocated`. *(new strings except the mockup's shared block)*
5. `No host linked · Add host` *(new)* when `hostHint = 'no_host_linked'`.
6. Hosts: `Shared by {n} (runs on / built on this)` *(new)* with links; shared lines show their split; `Unallocated {pct}%` when relevant.
7. `+ Add cost line`; empty `No cost recorded yet. + Add annual cost`; in-house `No license cost. Add a line for support, hosting, or internal time if it matters.`
8. Legacy object (no lines, value present) *(new)*: `Annual cost $18,600 (from the Annual cost field) · Break it into lines`.
9. Footer `Amounts in US$ · change in Workspace settings`.

### 7.4 Add / edit cost line form (shot 17)

Inline in the panel. `Type` chips · `Name` (optional) · `Calculation` Flat / Per user / % of license · amount row · live output (from `math.ts`; saved values re-render from the server) · `Vendor` (prefilled from the object: platform code → display name; runtime `vendor`, not `runtime_provider`; in-house → none) · **`Renewal`** section: `Uses {record}'s renewal (Jan 14, 2027)` or `Own renewal date` + notice select + `Auto-renews` · **`Shared by`** (platforms/runtimes only): `{record} only` · `Split evenly across the {n} records that run on or are built on it ({pct}% each)` · `Custom %` · `Source` Estimate / Quote / Invoice · `Save line` / `Cancel`. Deep links `?sec=cost&add=1|user`.

### 7.5 Spend report (shot 18) and Vendors and contracts screen

- Strip: `Vendor run cost $159,660/yr` · `Internal (est.) ~$75,000/yr not included` · `One-time $15,000 … not included`.
- `Annual cost by vendor` from `vendorSpend()`; table + footer `Vendor spend only: recurring lines, normalized to a year. Internal estimates and one-time spend are not included. Amounts in US$.`
- Vendors and contracts screen: same `vendorSpend()`; each vendor lists the objects (and lines) behind it.
- Overview "Annual spend" KPI: vendor run cost + *(new)* sub-label `+ ~$75,000 internal (est.)`.
- Renewals (report card, KPI `Renewing in 90 days`): `renewals({withinDays: 90})`, per object with its lines listed under it.
- CSV *(new)*: one row per line (object, type, line, vendor, calc, frequency, annual, one-time, source, renewal, notice, shared-by) + one row per legacy object.

### 7.6 Table width at 1280

At 1280×800 neither table scrolls horizontally with the panel closed: `table-layout: fixed`, Name flexible (min 200, ellipsis + title), Vendor 150 ellipsis, Annual cost 124, Renewal 120, chips 100–120, lowest-priority column hidden below 1360px. (The Infrastructure table overflowed in the mockup review.)

---

## 8. Ask

See ASK-GROUNDING-SPEC §10. In short: tools read `lib/cost/` only; cost answers cite the object and its line ids (`object:<id>#line:<lineId>`); impact still walks relationships; shared/infra shares are allocated, not added.

---

## 9. Fixture: Meridian cost overlay

Workspace **"Meridian Fasteners / Cost eval"** (base Meridian fixture from ASK-GROUNDING §7.2 + below), USD, TODAY 2026-09-25. Base workspace and G01–G44 untouched. Object types are suggestions; C0 maps them to the real type names.

| Object (type) | Properties | `cost_lines` | Annual | Written-back `annual_cost` |
|---|---|---|---|---|
| DigitalOcean Box (runtime) | vendor `DigitalOcean`, runtime_provider `DigitalOcean` | Hosting flat $120/mo, invoice | 1,440 | `"1440"` |
| AS400 (runtime) | vendor `IBM`, hosting on-prem, commitment_ends — | IBM Power support flat 18,000, invoice, renewal_date 2027-03-01, notice 90, auto · Keystone Midrange Support 20% of $42,000, quote, renewal_date 2027-06-30, notice 60 · Internal ~0.5 FTE 45,000 · Northfield IT Consulting services one-time $15,000 (2026-03), quote | run 26,400 · internal 45,000 · total 71,400 · one-time 15,000 | `"26400"` |
| Microsoft 365 tenant (platform) | vendor `microsoft`, vendor_product `Microsoft 365`, contract_renewal 2027-01-14 | Microsoft 365 E3, per_user 120 × $36/mo, invoice, notice 30, auto, `allocation: {mode: even}` | 51,840 | `"51840"` |
| AWS account (platform) | vendor `aws` (display Amazon Web Services) | AWS flat 18,600, invoice | 18,600 | `"18600"` |
| Office network / firewall (platform) | vendor `fortinet`, contract_renewal 2026-11-30 | Firewall support 2,950, invoice, notice 60 | 2,950 | `"2950"` |
| Order Entry (application) | is_custom_built, runs_on AS400 | Internal 30,000 | internal 30,000 | key removed (run 0) |
| Inventory (application) | is_custom_built, runs_on AS400 | — (legacy, filled no amount) | 0 | untouched |
| EDI Gateway (application) | vendor `TrueCommerce`, contract_renewal 2027-02-01, runs_on AS400 + AWS | EDI subscription 9,800, invoice, notice 90, auto | 9,800 | `9800` |
| Invoicing (application) | is_custom_built, runs_on AWS | — | 0 | untouched |
| QuickBooks Online (application) | vendor `Intuit`, contract_renewal 2026-12-03 | $190/mo, invoice, auto | 2,280 | `2280` |
| Salesforce (application) | vendor `Salesforce`, contract_renewal 2026-10-31, license_model `per user` | 25 × $105/mo, invoice, notice 30, auto | 31,500 | `31500` |
| HubSpot (application) | vendor `HubSpot` | quick entry 9,600, estimate | 9,600 | `9600` |
| Slack (application) | vendor `Slack`, contract_renewal 2026-11-15 | 35 × $12.50/mo, invoice, notice 30, auto | 5,250 | `5250` |
| Microsoft Teams, Outlook & Exchange, SharePoint & OneDrive, Office desktop apps (application ×4) | vendor `Microsoft`, **built_on Microsoft 365 tenant** | — | own 0, share 12,960 each (`shared_only`) | untouched |
| Shop Floor Label Printing (application) | vendor `Seagull Scientific`, hosting_model `on_premise`, **no** runs_on | — | blank (missing); panel `No host linked · Add host` | untouched |
| *(exclusion test)* | Salesforce `license_model`; an integration tool with per-call cost $0.002; a platform with token prices; roadmap initiative cost 120,000 | — | not in any total | — |

**Derived facts (tests and golden cases assert these):**

| Fact | Value |
|---|---|
| AS400 | run 26,400 · internal 45,000 · total 71,400 · one-time 15,000 · 63% est. |
| Microsoft 365 tenant | total 51,840; dependents 4; shares 12,960 each; status has_cost, sub-line `Allocated to 4 apps` |
| Applications table (own) | 88,430 (internal 30,000; estimated 39,600 = 45%) |
| Infrastructure table (own) | 146,230 (internal 45,000; estimated 45,000 = 31%) |
| Portfolio | 234,660 = run 159,660 + internal 75,000; estimated 84,600 = 36%; one-time 15,000 |
| Vendor spend | 159,660, 11 vendors: Microsoft 51,840 · Salesforce 31,500 · Amazon Web Services 18,600 · IBM 18,000 · TrueCommerce 9,800 · HubSpot 9,600 · Keystone Midrange Support 8,400 · Slack 5,250 · Fortinet 2,950 · Intuit 2,280 · DigitalOcean 1,440. Top 3 = 64% |
| Infrastructure share (includeInternal) | AS400 71,400 ÷ 3 = 23,800 → Order Entry, Inventory, EDI; AWS 18,600 ÷ 2 = 9,300 → EDI, Invoicing. (includeInternal false: AS400 8,800 each) |
| Shared line share | Microsoft 365 E3 51,840 ÷ 4 = 12,960 → Teams, Outlook, SharePoint, Office |
| EDI with allocated | 9,800 + 23,800 + 9,300 = 42,900; Order Entry 53,800; Teams 12,960 |
| Σ allocated to dependents | 90,000 infra share + 51,840 shared = 141,840 = Σ totalWithAllocated − portfolio |
| Renewals ≤ 90 days (to 2026-12-24) | Salesforce 31,500 (Oct 31, notice by Oct 1) · Slack 5,250 · firewall 2,950 · QuickBooks Online 2,280 → 4 items, 41,980 |
| Renewals ≤ 12 months | + Microsoft 365 E3 51,840 · EDI 9,800 · AS400 IBM line 18,000 · AS400 Keystone line 8,400 → 8 items (7 objects), 130,020 |
| Missing annual cost | Shop Floor Label Printing only (Inventory, Invoicing: filled no amount; the 4 M365 apps: shared_only) |

**Mockup vs product:** the mockup (unchanged numbers) attributes the M365 shares to the four apps inside the Applications footer ($140,270) and shows Infrastructure at $94,390. The product follows §5.3: Applications $88,430, Infrastructure $146,230. Portfolio, vendor spend and every per-object number are the same.

---

## 10. Tests

| # | Test | Expect |
|---|---|---|
| T1 | per_user | 120 × 3600 × 12 = 5,184,000; 35 × 1250 × 12 = 525,000; 25 × 10500 × 12 = 3,150,000 |
| T2 | pct_of_license | 2000 bp × 4,200,000 = 840,000; half-up rounding |
| T3 | monthly → annual | 12,000 → 144,000; 19,000 → 228,000 |
| T4 | one-time excluded | AS400 total 7,140,000, oneTime 1,500,000 |
| T5 | internal flagged | AS400 internal 4,500,000, 63%; includeInternal false → 2,640,000 |
| T6 | legacy parse (moved, unchanged) | number 9800 ✓; string `"18600"` ✓; `"0"`, `0`, `""`, missing → blank; capex runtime and custom-built without number → filled_no_amount; whatever other formats the current parser accepts, unchanged (parity) |
| T7 | legacy parity | with the flag off, every refactored reader returns the same result as before on the fixture (snapshot) |
| T8 | write-back | after each write, `annual_cost` = run total, number on applications, string on platforms/tools/runtimes, removed at 0; Order Entry key removed; AS400 `"26400"` |
| T9 | first-line conversion | object with legacy 9800 → "Keep as a line" creates 1 estimate line, `cost_meta.legacy_annual_cost = 9800`, `annual_cost` still 9800 |
| T10 | shared line | M365 E3 even across 4 dependents via built_on = 1,296,000 each; tenant total 5,184,000; vendor Microsoft 5,184,000 once |
| T11 | custom overrides | 50% Teams, others split remaining 50% → 2,592,000 / 864,000 ×3; stale override key ignored and flagged |
| T12 | largest remainder | $100.00 ÷ 3 → 3334/3333/3333 |
| T13 | infrastructure share | EDI 2,380,000 + 930,000; Order Entry, Inventory 2,380,000; includeInternal false → 880,000 |
| T14 | no host linked | Shop Floor Label Printing (on_premise, no edge) → no share, hostHint `no_host_linked`; `hosting_model` never affects maths |
| T15 | **no double counting** (property test, random lines/allocations/edges/legacy objects) | invariants 1–5 in §5.5 |
| T16 | fixture | every value in §9 |
| T17 | renewals | 90d: 4 / 4,198,000; 12m: 8 / 13,002,000; line renewal_date vs object key; notice_by; commitment_ends on runtimes |
| T18 | vendor normalization | `microsoft` code → Microsoft; `Microsoft` and `microsoft ` group together; `saas`/`on_premise`/`cloud` vendor strings dropped; runtime uses `vendor` not `runtime_provider`; in-house has no vendor spend |
| T19 | excluded fields | license_model, per-call cost, token prices, roadmap initiative cost set → no total changes |
| T20 | currency | `US$`/`CA$`; `formatMoney(5184000,'CAD') = '$51,840'`; switching changes labels only |
| T21 | quick entry | `9600`, `9,600`, `$9,600`, `9.6k` → 960,000; creates subscription/annual/estimate; writes `annual_cost` 9600 (number) on an application |
| T22 | validation | every §4.2 rule rejects with its message; unknown keys stripped |
| T23 | concurrency | two writes to the same object don't lose lines or other properties |
| T24 | batch = single | `annualCostMany` = per-object calls |
| T25 | UI purity (grep) | only the Add-line form imports `lib/cost/math`; no component parses `annual_cost` |

---

## 11. Rollout

1. C1–C2 land with the flag off. Refactored readers produce identical output (T7).
2. Flag on per workspace: lines UI appears; objects without lines keep showing their legacy value.
3. Backfill only if the user asks (C2b).
4. No removal of `annual_cost` — it stays the derived legacy total.

---

## 12. Open questions (defaults in use)

| # | Question | Default |
|---|---|---|
| Q1 | Exact type names and which list each appears in (solutions, technical capabilities, integration tools) | C0 confirms; config maps them |
| Q2 | Where `relationshipImpactRules` lives | C0 finds it; `costable.ts` mirrors its pattern |
| Q3 | Infrastructure share base: include the host's internal estimate? | Follows `includeInternal` (default yes: $23,800; no: $8,800) |
| Q4 | Cascade shares runtime → platform? | No |
| Q5 | `Include allocated costs` toggle default | Off |
| Q6 | Overview "Annual spend": vendor run cost or incl. internal? | Vendor run cost + internal sub-label |
| Q7 | CAD display | `$` + `CA$` label |
