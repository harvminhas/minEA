# BuboMap Repository MVP Spec

**Audience:** SMB CTO / VP IT who came up buying hardware and software, not an EA practitioner  
**Surface:** Repository tab (the other top-level tab is Views) for a workspace that already has data, post-onboarding  
**Constraint:** reuse the existing System, Platform, Runtime, Integration/Flow, and People/team objects; add a small set of shared fields; no new metamodel  
**Feature flag:** `repository.mvp.v1`  
**Cost:** cost lines and infrastructure share for Applications and Infrastructure are specified in `COST-SPEC.md` v2 (flag `cost.lines.v1`). In minEA, cost, vendor and hosting are keys in `objects.properties` (JSON); cost lines are stored as `properties.cost_lines`, and `properties.annual_cost` stays as the derived legacy total. No new tables  
**Infrastructure split (Sep 30, 2026):** `INFRA-SPEC.md` (flag `infra.split.v1`) replaces the single Infrastructure list, its type chips and the unified read model with two lists: **Platforms & cloud** (platform type) and **Servers & devices** (runtime type). Old routes redirect. Sections below that describe the single list (§5 table rows, the nav block, the route map, the Infrastructure table and panel, the unified list note, the acceptance items) still describe the `repository.mvp.v1` baseline. Prompts: `CURSOR-INFRA-INSTRUCTIONS.md`.  
**Out of scope for this spec:** Views tab, onboarding (see `ONBOARDING-DAY1-SPEC.md`), finance/SSO importers, AI chat (the grounded, LLM-backed Ask is specified separately in `ASK-GROUNDING-SPEC.md`), first-class Vendor object (phase 2 of the Vendors view only)

---

## 1. Goal

A CTO opens Repository and sees **what they run, what it costs, who owns it, and what renews or retires soon**, in their own words: apps, infrastructure, vendors, cost, renewals, owners.

They should be able to answer, in under a minute and without jargon:

- What do we spend, and with which vendors?
- What renews in the next 90 days, and when is the notice deadline?
- What is retiring, and what breaks when it goes?
- What is critical and has nobody accountable for it?
- Where is one server or platform holding up several critical apps?

## 2. Non-goals

- Renaming objects in the database or API. This is a label, route, and UI change; persisted type names stay (`System`, `Platform`, `Runtime`, etc.)
- Removing any object type from the database. Capabilities, Processes, Roadmaps, APIs, Events, Data Entities, Data Stores, Data Domains, Components, and Integration Infra all stay. Only Products leave the nav (their routes redirect to Roadmaps; the records are kept)
- Capability maps, TIME, target architecture, or any new Views work
- Currency conversion. Totals are shown per currency (see §7.4)
- A first-class Vendor object in this release (phase 5 ships a derived view; the object is a later phase)
- Contract document storage, purchase orders, or invoice import
- Changing the Tech debt or History tabs beyond reading from them

## 3. Success metric (instrument this)

Primary, per workspace, 14 days after `repository.mvp.v1` is on:

```
shared_field_fill_rate(applications + infrastructure) >= 70%
AND overview_viewed_weeks >= 2           // returned to Overview in 2 distinct weeks
```

`shared_field_fill_rate` = filled cells / (items × 6) across owner, vendor, annual cost, renewal date, lifecycle, criticality. Owner counts as filled when a team **or** a person is set.

Secondary:

```
critical_items_without_owner == 0
overview_panel_clicked >= 1               // a panel drove someone into a filtered list
bulk_fill_applied >= 1
```

Baseline the fill rate for each workspace **before** the phase 3 migration so the lift is measurable.

## 4. Design principles

1. **Speak procurement, not EA.** Applications, Infrastructure, Connections, Vendors and contracts, Owners and teams come first, in the `Your estate` group. EA terms live in the `Architecture` group below it: visible, never hidden, and collapsible.
2. **Six fields everywhere.** Owner, vendor, annual cost, renewal date, lifecycle, criticality appear in the same order on every Application, Infrastructure item, and Vendor. Everything else sits under `More details`.
3. **Gaps are the to-do list.** An empty field is shown as an `Add X` prompt, never a blank label. Tables highlight blanks, and Overview tells you exactly how many are missing.
4. **One field, one meaning.** No two fields may say the same thing (today Type, Provider, and Hosting model all say "on-prem").
5. **Every number is a link.** Each Overview panel opens a pre-filtered list that reproduces the number.
6. **No schema change until it pays for itself.** Phases 1–2 are UI only. Fields and migration come in phase 3.

## 5. What to change vs today

From the current Repository screenshots of workspace `Meridian Fasteners / Default`:

| Today | Change |
|---|---|
| Left nav: Overview; Systems (6) › Components (0); Integrations (4); Platforms (3) › Runtimes (2); People (4); Business (3); Strategy (0) › Products, Roadmaps; Data (1) | Two groups. `Your estate` (always open): Overview, Applications, Infrastructure, Connections, Vendors and contracts, Owners and teams. `Architecture` (shown, collapsible, state remembered per user): Capabilities, Processes, Roadmaps, APIs & events, Data (Entities, Stores, Domains). Empty sections show a muted count and a one-line purpose hint; nothing is hidden. Products removed (redirect to Roadmaps) |
| Components are a nav child of Systems | Components leave the nav and appear as a Components section in the Application detail panel/page, with `Add component`. They stay real records with their own detail view, are findable in search and Ask, and the old route redirects to Applications |
| Platforms and Runtimes are separate lists | *(superseded by INFRA-SPEC: two lists, Platforms & cloud and Servers & devices)* One Infrastructure list with a type filter: Cloud, On-prem server, SaaS platform, Network |
| APIs, Events, Integration Infra are peers inside Integrations | APIs & events get their own item in the `Architecture` group (option: nest them under Connections instead). Integration Infra stays behind the `Advanced` toggle in Connections |
| Lists are card grids (e.g. Runtimes shows DigitalOcean Box and AS400 cards) | Dense sortable, filterable table; cards are an optional toggle |
| Card shows `Runtime · On-prem / bare metal`, Provider, Hosting model, Cost model, SLA target, Criticality | Table columns are the six shared fields, plus `Hosted where` on Infrastructure |
| Detail panel: KIND (Type), IDENTITY (Provider), DEPLOYMENT (Hosting model) all say on-prem | `Hosted where` replaces Type + Hosting model; Provider becomes `Vendor` (a company name) |
| CONTRACT = Cost model only | Contract = vendor, annual cost, cost model, renewal date, notice period |
| GOVERNANCE Owner = team only (`Infrastructure Team`) | Owner = team + named person |
| Empty values render as bare labels (AS400 card) | `Add owner`, `Add vendor`, `Add annual cost`, … prompts |
| Overview content not specified here | CTO dashboard computed from the six shared fields (§8.1) |

Keep as-is: Details / Tech debt / History tabs, SLA target, `Updated by {user} {relative time}` footer.

---

## 6. Navigation

### 6.1 New left nav

Decided Sep 27, 2026. This replaces the earlier collapsed `Advanced` group and its hide-empty rule.

```
MODEL
YOUR ESTATE                         (always open, not collapsible)
  Overview
  Applications              (9)
  Infrastructure            (5)     → with infra.split.v1: Platforms & cloud (3) + Servers & devices (2)
  Connections               (11)
  Vendors & contracts       (9)
  Owners & teams            (6)
▾ ARCHITECTURE              (27)    (shown by default, collapsible, remembered per user)
  Capabilities              (7)
  Processes                 (4)
  Roadmaps                  (4)
  APIs & events             (4)     (option: nest under Connections instead)
  Data                      (8)
      Entities              (5)
      Stores                (3)
      Domains               (0)     Groups of related entities
```

(Counts are the mockup's Meridian example data, the same as the Ask eval fixture in `ASK-GROUNDING-SPEC.md` §7.2.)

Rules:

- Counts are item counts. Infrastructure count = Platforms + Runtimes. Vendors count = distinct normalized vendor names (§7.5). Roadmaps = roadmap items (or roadmaps if the schema has no items). APIs & events = APIs + Events. Data = Entities + Stores + Domains. The Architecture header shows the sum of its items. Components are not counted in the nav.
- `Your estate` is always open. `Architecture` is open by default and collapsible. Its open/closed state persists per user (local storage, key includes the user id). If the active route is inside Architecture, the group auto-expands.
- **Nothing is hidden.** A section with 0 items shows a muted count and a one-line purpose hint under its label (with a tooltip `Nothing here yet. {hint}.`), instead of a bare 0 or disappearing. Hints: Capabilities `What the business must be able to do`; Processes `How work moves across teams`; Roadmaps `Planned changes and when they land`; APIs & events `How systems expose and share data`; Data `The information you keep and where`; Entities `Things you track, e.g. Customer`; Stores `Databases and files that hold it`; Domains `Groups of related entities`.
- **Products** is removed from the nav. Every Products route (list and detail) redirects to Roadmaps. Product records are kept.
- **Components** are not a nav item. They appear as a Components section inside an Application's detail panel/page (§8.3, §8.4), with `Add component`. They stay real records with their own detail view (`/model/applications/[id]/components/[componentId]`), are findable in global search and by Ask, and the old Components route redirects to Applications (component ids redirect to their parent application's component view).
- **APIs & events** sit in Architecture by default. Option: nest them under Connections (as the Connections `Advanced` kind chips, §8.2) instead. Keep the nav config in one file so this is a one-line change.
- Tooltip on first render of Applications: `Applications used to be called Systems. Same records, new name.` Dismiss once per user.

### 6.2 Old → new mapping

**Assumption to verify:** route paths below are placeholders. Inspect the router (App Router `app/` tree or Pages `pages/`) and replace with the real paths before building.

| Old label | Old route (assumed) | New label | New route | Notes |
|---|---|---|---|---|
| Overview | `/repository` | Overview | `/repository` | Content replaced in phase 4 |
| Systems | `/repository/systems` | Applications | `/repository/applications` | Same System records |
| Systems › Components | `/repository/components`, `/repository/components/[id]` | (Application detail, Components section; component detail view) | `/repository/applications` and `/repository/applications/[systemId]/components/[id]` | List route → Applications. Detail → the parent's component view. Orphan components listed under `/repository/applications?view=components` |
| Integrations | `/repository/integrations` | Connections | `/repository/connections` | Flows are the default list |
| APIs / Events | `/repository/integrations/{apis,events}` | Architecture › APIs & events | `/repository/apis-events?kind={api,event}` | Option: `/repository/connections?advanced=1&kind={api,event}` if nested under Connections |
| Integration Infra | `/repository/integrations/infra` | Connections › Advanced | `/repository/connections?advanced=1&kind=infra` | |
| Platforms | `/repository/platforms` | Infrastructure (with `infra.split.v1`: Platforms & cloud, INFRA-SPEC §3.2) | `/repository/infrastructure?source=platform` | `source` is an internal filter, not shown as a chip |
| Platforms › Runtimes | `/repository/runtimes` | Infrastructure (with `infra.split.v1`: Servers & devices) | `/repository/infrastructure?source=runtime` | |
| — | — | Vendors and contracts | `/repository/vendors` | New, derived (phase 5) |
| People | `/repository/people` | Owners and teams | `/repository/owners` | |
| Business › Capabilities, Processes | `/repository/business/...` | Architecture › Capabilities, Processes | `/repository/capabilities`, `/repository/processes` | Existing pages, new nav placement |
| Strategy › Roadmaps | `/repository/strategy/roadmaps` | Architecture › Roadmaps | `/repository/roadmaps` | |
| Strategy › Products | `/repository/strategy/products` (+ `/[id]`) | (removed) | → `/repository/roadmaps` | Products leave the nav; records kept |
| Data › Entities, Stores, Domains | `/repository/data/...` | Architecture › Data › Entities, Stores, Domains | `/repository/data/{entities,stores,domains}` | |

### 6.3 Redirects

- Permanent redirects (308) from each old route to its new route, **preserving** record IDs, query string, and hash. Detail routes (`/repository/systems/[id]` → `/repository/applications/[id]`) redirect too.
- Implement in `next.config` `redirects()` or middleware, whichever the repo already uses. Keep the redirects after the flag is removed; bookmarks and shared links live for years.
- While `repository.mvp.v1` is **off**, no redirects fire and the old nav renders unchanged.
- Fire `repository_legacy_route_redirected { from, to }` once per redirect (client-side on landing with a `?from=` marker, or server log if simpler).
- Views that deep-link into Repository must be updated to the new routes (search the codebase for old path strings).

---

## 7. Data

### 7.1 The six shared fields

Every Application (System), Infrastructure item (Platform, Runtime), and Vendor carries these, in this order:

| # | Field | UI label | Type | Notes |
|---|---|---|---|---|
| 1 | Owner | `Owner` | team ref + person ref | Team from Owners and teams; person optional but prompted |
| 2 | Vendor | `Vendor` | string (company name) | e.g. `DigitalOcean`, `IBM`. `Built in-house` is a valid choice |
| 3 | Annual cost | `Annual cost` | amount + ISO 4217 currency | Default currency = workspace currency; if none exists, USD. **In minEA this is `properties.annual_cost` (number on applications, string on platforms/tools/runtimes). With `cost.lines.v1`: derived from `properties.cost_lines` and written back to `annual_cost` by `lib/cost/`; one workspace currency (USD or CAD). See COST-SPEC.md** |
| 4 | Renewal date | `Renewal / contract end` | date | Optional notice period lives next to it in Contract |
| 5 | Lifecycle | `Lifecycle` | enum | `Planned`, `Pilot`, `Active`, `Retiring`, `End of life` |
| 6 | Criticality | `Criticality` | enum | Reuse the existing Criticality enum seen on Runtime (`Low` observed) |

### 7.2 Type sketch (adapt to real schema)

> **For money, COST-SPEC.md v2 applies (`cost.lines.v1`).** minEA has no cost columns: `annual_cost`, `cost_model`, `contract_renewal` (runtimes: `commitment_ends`), `vendor`, `hosting_model` are keys in `objects.properties`. Don't add `annualCost`, `annualCostCurrency`, `renewalDate`, `noticePeriodDays` or `costModel` as new fields. Cost detail goes in `properties.cost_lines`; `annual_cost` stays and is written back from the lines (COST-SPEC §5.4); the object renewal stays `contract_renewal` / `commitment_ends`; notice periods live on lines. Only `lib/cost/` reads or writes these keys.

```ts
// Shared across System, Platform, Runtime (and Vendor in a later phase)
type SharedFields = {
  ownerTeamId?: string;         // exists on System (onboarding spec); verify on Platform/Runtime
  ownerPersonId?: string;       // NEW where missing; on System reuse pointOfContactId if it means the same person
  vendor?: string;              // exists on System; on Platform/Runtime this REPLACES provider (migration §7.6)
  annualCost?: number;          // minEA: properties.annual_cost; with cost.lines.v1 derived from cost_lines (COST-SPEC §5.4). System: reuse costPerYear; NEW on Platform/Runtime
  annualCostCurrency?: string;  // not used with cost.lines.v1: one workspace currency
  renewalDate?: string;         // minEA: properties.contract_renewal (runtimes: commitment_ends); lines may add their own renewal_date
  lifecycle?: Lifecycle;        // Runtime already has Lifecycle (value "Pilot" seen); System has status
  criticality?: Criticality;    // Runtime already has it; verify on System
};

type Lifecycle = "planned" | "pilot" | "active" | "retiring" | "end_of_life";

// Contract block (Infrastructure and Applications)
type ContractFields = {
  costModel?: CostModel;        // minEA: properties.cost_model (runtime capex = filled, no amount); cost line type carries the detail
  noticePeriodDays?: number;    // not added: notice_days lives on cost lines (COST-SPEC §4.2)
};

// Infrastructure only
type HostedWhere =
  | "cloud"          // AWS, Azure, GCP, DigitalOcean, Linode, …
  | "on_prem"        // own server room / bare metal / midrange (AS400)
  | "colocation"     // own hardware in someone else's data center
  | "saas_platform"  // vendor-run platform (Salesforce platform, Shopify, M365 tenant)
  | "network"        // firewalls, SD-WAN, ISP circuits, VPN
  | "unknown";
```

**Assumptions to verify in the repo:**

- Criticality enum values beyond `Low` (expected `Low / Medium / High / Critical`). "Critical" in this spec means the top two values. If the enum has only three values, use the top one.
- Cost model enum values beyond `Capital asset (depreciated)`. Keep the existing enum; add `Subscription`, `Usage-based`, `Free / open source`, and `Included in another contract` only if missing and cheap.
- Whether System already has `criticality`. The onboarding spec added `criticalityLite` (`must` / `nice`) and said not to reuse the API-form Criticality. For Repository, the shared field is the Runtime Criticality enum. Backfill rule: `must` → `High`, `nice` → `Low`, only where `criticality` is empty. Onboarding UI can keep Must-have / Nice-to-have and write both.
- Whether an Application → Infrastructure "runs on" relationship exists (possibly via Components deployed to Runtimes, since the Runtime panel has a COMPONENTS section). If not, add `runsOnIds: string[]` on System in phase 3. Overview dependents and single-point-of-failure panels need it.
- The Tech debt tab's record shape (expected: title, severity, linked item). Overview only reads it.
- The System detail panel layout was not observed. Verify it has the same KIND / IDENTITY / DEPLOYMENT / CONTRACT / GOVERNANCE sections before reusing the Runtime layout.

### 7.3 Field mapping per object

| Shared field | System (Application) | Platform | Runtime | Vendor (derived, phase 5) |
|---|---|---|---|---|
| Owner team | `ownerTeamId` | verify / add | GOVERNANCE Owner (team) | most common owner team among its items (read-only) |
| Owner person | `pointOfContactId` (if same meaning) or add `ownerPersonId` | add | add | — |
| Vendor | `vendor` | `provider` → `vendor` | `provider` → `vendor` | the vendor name itself |
| Annual cost | `costPerYear` + new currency | add | add | sum of items, per currency (with `cost.lines.v1`: `vendorSpend()` in `lib/cost/`, grouped by the existing vendor normalizer) |
| Renewal date | add | add | add | earliest upcoming renewal among items |
| Lifecycle | `status` mapped (below) | verify / add | `lifecycle` | — (shown as `n active · n retiring`) |
| Criticality | `criticality` or backfill from `criticalityLite` | verify / add | `criticality` | highest among its items |

System `status` → Lifecycle: `planned` → Planned, `evaluating` → Pilot, `active` → Active. Add Retiring and End of life. Keep the old column readable until the flag is removed; write both during the transition.

Everything not in the six (SLA target, cost model, notice period, hosted where, category, governance, how found, custom-built, source kind, tags) sits under `More details` in the panel, except the Contract block (§8.3), which keeps cost model and notice period next to cost.

**With `cost.lines.v1`:** Annual cost comes from one module (`lib/cost/annualCost`, COST-SPEC §5) for every costable type: cost lines when present, else the existing parse of `properties.annual_cost`. Renewal = the object's `contract_renewal` / `commitment_ends` or a line's own `renewal_date`, whichever comes first. Every current reader of `annual_cost` is refactored to call the module (COST-SPEC §5.6).

### 7.4 Money rules

> **With `cost.lines.v1`, COST-SPEC.md replaces these rules:** one workspace currency (USD or CAD, shown as US$ / CA$), no per-line currency, no conversion; line amounts in integer cents; annual cost = own recurring lines per year (one-time separate, internal estimates flagged); shared lines counted once on the platform/runtime that holds them; infrastructure share allocated, not added (via `runs_on` / `built_on`, never `hosting_model`); `license_model`, per-call cost, token prices and roadmap initiative cost are never in totals. The rules below apply only with the flag off.

- Store amount and currency. Never sum across currencies. Show `$48,200 + €6,000` when mixed, and put each currency on its own line in charts.
- Annual cost means the yearly run-rate. For `Capital asset (depreciated)`, the annual cost is the yearly depreciation plus support. Helper text under the field: `For owned hardware, use yearly depreciation plus support.`
- Cost fields are visible to every workspace member (no field-level permissions in this spec).

### 7.5 Vendor normalization (derived view and dedupe)

`normalizeVendor(name)`: trim, collapse whitespace, lowercase, strip trailing `inc`, `inc.`, `llc`, `ltd`, `corp`, `corporation`, `co.`, `gmbh`, and punctuation. Display the most frequent original spelling. `Built in-house` and empty are excluded from vendor totals and reported separately.

### 7.6 Migration: Type + Hosting model → Hosted where; Provider → Vendor

Runs in phase 3, per workspace, idempotent, behind the flag. Keep old columns until the flag is removed (rollback = stop reading new ones).

**Step 1: Hosted where.** For each Platform/Runtime:

1. If Hosting model is set, map it with Appendix A.
2. Else, take the suffix of Type (`Runtime · On-prem / bare metal` → `On-prem / bare metal`) and map it.
3. If Provider holds a hosting term (Appendix A left column) and 1–2 gave nothing, use it.
4. If sources disagree (e.g. Hosting model = on-prem, Provider = `DigitalOcean`), set Hosted where from the **vendor** signal (known cloud vendor → `cloud`) and add the item to the review queue with reason `conflict`.
5. Nothing found → `unknown`.

**Step 2: Vendor.** For each Platform/Runtime `provider` value:

| Provider value looks like | Action |
|---|---|
| A company name (matches Appendix B, or is not a hosting term) | Copy to `vendor` as-is |
| A hosting term (`On-prem`, `bare metal`, `self-hosted`, `cloud`, `hosted`, `internal`) | Leave `vendor` empty; value already used in Step 1. If the item name matches Appendix B (e.g. `AS400` → `IBM`, `DigitalOcean Box` → `DigitalOcean`), store as a **suggestion**, not a value |
| Empty | Leave empty; suggest from item name if Appendix B matches |

**Step 3: Log.** Write one History entry per changed item: `Moved "On-prem / bare metal" from Provider to Hosted where` or `Provider renamed to Vendor`. Actor: `BuboMap migration`.

**Step 4: Review queue.** After migration, owners see a one-time banner on Infrastructure (§8.6). Suggestions are applied only on confirm.

---

## 8. Screens

Copy below is ship copy unless marked ALT. `{n}` and `{name}` are interpolations.

### 8.1 Overview (CTO dashboard) — phase 4

**Title:** `Overview`  
**Subtitle:** `What you run, what it costs, and what needs attention.`

**Layout:** a data-completeness strip on top, then a two-column grid of panels (one column under 1024px). Each panel has a title, a number or short list (max 5 rows), and a footer link to the filtered list. Panels compute from Applications + Infrastructure unless stated.

**Completeness strip:**  
`{pct}% of key fields filled across {n} applications and infrastructure items.` Link: `Fill the gaps` → Applications table filtered `missing=any`.

| # | Panel title | Content | Footer link → filtered list |
|---|---|---|---|
| P1 | `Annual spend by vendor` | Top 5 vendors by annual cost, horizontal bars, `Other ({n})` row. Total per currency in header | `See all vendors` → `/repository/vendors?sort=annualCost:desc` (before phase 5: Applications + Infrastructure table sorted by cost, grouped by vendor) |
| P2 | `Annual spend by category` | Applications by existing Category enum; Infrastructure grouped by Hosted where, shown as `Infrastructure · Cloud` etc. | `See costs` → `/repository/applications?sort=annualCost:desc&category={c}` |
| P3 | `Renewals in the next 90 days` | Rows: name, vendor, renewal date, cost, notice deadline (`renewalDate − noticePeriodDays`). Rows whose notice deadline has passed or is within 14 days get a `Notice due {date}` badge | `See all renewals` → `?renewal=next90&sort=renewalDate:asc` |
| P4 | `Retiring or end of life` | Rows: name, lifecycle, `{n} dependents`. Expand a row to list dependents (apps connected via Connections, apps running on it) | `See all` → `?lifecycle=retiring,end_of_life` |
| P5 | `Critical with no owner` | Count + up to 5 names. Owner missing = no team **and** no person | `Assign owners` → `?criticality=critical&missing=owner` (opens bulk fill for owner) |
| P6 | `Single points of failure` | Rows: infrastructure item, `{n} critical apps depend only on this`. Definition below | `See dependencies` → `/repository/infrastructure?spof=1` |
| P7 | `Tech debt highlights` | Top 5 open Tech debt records by severity on critical items, then any items. Row: item, debt title, severity | `See all tech debt` → items list with `techDebt=open` filter |

**Single point of failure definition:** a critical Application whose "runs on" set contains exactly one Infrastructure item. Group by that item; show items with ≥1 such app, sorted by count. Do not guess redundancy from names.

**Dependents definition (P4):** for an item X, dependents = Applications with a Connection to or from X (any direction, any Connection kind, including integration infra and API/event links) ∪ Applications that run on X. Deduplicate. Show direct dependents only (one hop).

**Empty and partial states** (panel stays in place and shows the gap; never hide a panel for missing data):

| Panel | Condition | Copy | CTA |
|---|---|---|---|
| P1, P2 | 0 items with annual cost | `No costs yet. Add annual cost to see where the money goes.` | `Add costs` |
| P1, P2 | Some items missing cost | Chart renders, plus footnote: `Add annual cost to {n} apps to see full spend.` (use `apps`, `infrastructure items`, or `items` depending on what is missing) | `Add annual cost` |
| P1 | Items with cost but no vendor | Footnote: `{amount} has no vendor yet.` | `Add vendors` |
| P3 | 0 items with renewal date | `No renewal dates yet. Add them to get a 90-day heads-up.` | `Add renewal dates` |
| P3 | Dates exist, none in 90 days | `Nothing renews in the next 90 days. Next: {name} on {date}.` | — |
| P4 | None retiring | `Nothing is marked Retiring or End of life.` | — |
| P4 | {n} items have no lifecycle | Footnote: `{n} items have no lifecycle set.` | `Set lifecycle` |
| P5 | 0 critical items without owner | `Every critical item has an owner.` (success tone) | — |
| P5 | 0 items with criticality | `Mark what's critical to see who owns it.` | `Set criticality` |
| P6 | No "runs on" links exist | `Link apps to the infrastructure they run on to spot single points of failure.` | `Link infrastructure` → Applications filtered `missing=runsOn` |
| P6 | Links exist, none found | `No critical app depends on just one infrastructure item.` | — |
| P7 | No tech debt records | `No tech debt logged. Add it from any item's Tech debt tab.` | — |

Every CTA opens the relevant list pre-filtered to rows missing that field, with bulk fill ready (§8.5).

**Do not** show EA jargon on Overview (capability, domain, TOGAF, metamodel).

---

### 8.2 Lists (table default) — phase 2

Applies to Applications, Infrastructure, and Vendors. Connections and Owners and teams use the same table component with their own columns.

**Toolbar:** search `Search by name, vendor, or owner` · filter chips · `Missing fields` quick filter · view toggle `Table | Cards` · `Add application` / `Add infrastructure` primary.

**Default columns (Applications):**

| Column | Header copy | Sort | Filter | Inline edit control |
|---|---|---|---|---|
| Name (frozen) | `Name` | A–Z | search | text |
| Owner | `Owner` | by team, then person | team, person, `No owner` | team + person typeahead, `Create "{text}"` |
| Vendor | `Vendor` | A–Z | multi-select, `No vendor` | typeahead of existing vendors, free text |
| Annual cost | `Annual cost` | numeric within currency | range, `No cost` | amount + currency |
| Renewal | `Renewal` | date | `Next 30 / 90 / 365 days`, `Past`, `No date` | date picker |
| Lifecycle | `Lifecycle` | enum order | multi-select | select |
| Criticality | `Criticality` | enum order | multi-select | select |

**Infrastructure** adds `Hosted where` after Name, with the type filter as segmented chips at the top of the table: `All · Cloud · On-prem server · SaaS platform · Network`. `On-prem server` includes `on_prem` and `colocation`. `unknown` shows under All with a `Not set` chip.

**Optional columns** (column picker `Columns`): Category, SLA target, Cost model, Notice period, Updated. Updated shows the existing `Updated by {user} {relative}` string.

**Gap highlighting:** empty cells render muted text `Add` on a light amber background, and the column header shows `{n} missing`. Clicking an empty cell starts inline edit. Row hover shows no extra chrome.

**`Missing fields` filter:** menu `Any key field` / `Owner` / `Vendor` / `Annual cost` / `Renewal` / `Lifecycle` / `Criticality`. Sets `missing=` in the URL.

**Inline edit:** click or Enter to edit, Enter to save, Esc to cancel, Tab to the next cell. Optimistic save with toast on failure: `Couldn't save {field}. Try again.` Every save writes a History entry, same as the panel.

**Row click** (outside an editable cell) opens the detail panel (§8.3). Applications open the full detail page (§8.4) via `Open full page`.

**Cards toggle:** reuses today's card component with the six fields. The choice persists per user per list. Empty fields in cards show `Add {field}`.

**URL state:** every filter, sort, and view choice is in the query string so Overview links and shared links reproduce the list.

**Density:** 36px rows; at 1280×800, Name + all six shared columns fit without horizontal scroll (Name truncates with tooltip).

**Connections table columns:** `From`, `To`, `How` (existing mechanism), `Owner`, `Criticality`, `Updated`. Toggle at right of the toolbar: `Advanced` (off by default). When on, adds kind chips `Flows · Integration infra` and their existing lists. Helper under toggle when off: `Integration infrastructure is under Advanced. APIs and events are under Architecture.` (If APIs & events are nested under Connections instead, the chips become `Flows · APIs · Events · Integration infra`.)

**Owners and teams table columns:** `Team`, `People`, `Items owned`, `Critical items owned`, `Annual cost owned`. Row click opens the team with its owned items listed.

**Empty list state (flag on, zero rows):**  
Applications: `No applications yet.` / `Add the software your business runs.` / CTA `Add application`.  
Infrastructure: `No infrastructure yet.` / `Add servers, cloud accounts, SaaS platforms, and network gear.` / CTA `Add infrastructure`.

---

### 8.3 Detail panel (Infrastructure item; Applications reuse after verification) — phases 1 and 3

Tabs unchanged: `Details` · `Tech debt` · `History`.

**Header:** name, `Hosted where` chip (e.g. `Cloud`), lifecycle chip, criticality chip.

**Details tab sections, in order:**

| Section | Fields | Replaces |
|---|---|---|
| `Key facts` | Owner (team + person), Vendor, Annual cost, Renewal / contract end, Lifecycle, Criticality | parts of IDENTITY, CONTRACT, GOVERNANCE |
| `Hosted where` | Hosted where (select), Location / region (existing field if any, else free text under More details) | KIND (Type) + DEPLOYMENT (Hosting model) |
| `Contract` | Vendor (same value as Key facts, read-only link), Annual cost, Cost model, Renewal date, Notice period | CONTRACT (Cost model only) |
| (with `cost.lines.v1`) `Vendor` + `Cost` | Replace `Contract`: record vendor editor, then Renewal date (`contract_renewal` / `commitment_ends`), cost lines, shared lines and infrastructure share (allocated, not added), `No host linked · Add host`, Add cost line form (COST-SPEC §7.3–7.4, shots 15–17) | `Contract` section |
| `Governance` | Owner, SLA target, Lifecycle, Criticality | GOVERNANCE (owner gains person) |
| `Components` | Applications only: the System's components as cards (name, kind, runs on, lifecycle) plus `Add component` (existing create flow, parent preset). Each card opens the component's own detail view | COMPONENTS (moved from the old Systems › Components nav) |
| `More details` (collapsed) | Everything else, plus read-only `Source: Platform` / `Source: Runtime` | IDENTITY leftovers |

Key facts and Contract/Governance show the same underlying values (edit once, reflected everywhere). If duplication feels heavy in review, ALT: drop `Key facts` and keep Contract + Governance only.

**Empty field prompts** (link-styled, open the editor in place):

| Field | Prompt |
|---|---|
| Owner team | `Add owner team` |
| Owner person | `Add a named owner` |
| Vendor | `Add vendor` (helper in editor: `Company you pay, e.g. DigitalOcean or IBM`) |
| Annual cost | `Add annual cost` |
| Renewal | `Add renewal date` |
| Notice period | `Add notice period` |
| Lifecycle | `Set lifecycle` |
| Criticality | `Set criticality` |
| Hosted where | `Set where it's hosted` |
| Cost model | `Add cost model` |
| SLA target | `Add SLA target` |

**Vendor editor:** typeahead of existing workspace vendors (normalized, §7.5), then Appendix B names, then `Use "{text}"`. First option when empty: `Built in-house`. If the typed value matches a hosting term, inline warning: `That sounds like where it's hosted. Put it in Hosted where instead?` with button `Move it`.

**Pending suggestion** (from migration): under Vendor, `Suggested: IBM` with `Accept` · `Dismiss`.

**Phase 1 note:** before the phase 3 migration, the panel only renames labels (Provider → `Vendor (was Provider)`, Type/Hosting model unchanged) and adds empty prompts. No field is moved until phase 3.

---

### 8.4 Application detail page — phase 1 (Components move) and phase 3

Route `/repository/applications/[id]`. Same tabs as the panel. Details sections: Key facts, Contract, Governance, `Runs on` (infrastructure list, add/remove), `Connections` (in/out, read-only summary with link to Connections filtered to this app), `Components` (moved from the old Systems › Components nav; same create/edit UI as today), More details.

Components empty state: `No components. Break this application into parts only if it helps you track hosting or ownership.` CTA `Add component`.

Components whose parent System is missing (if the model allows orphans) appear at `/repository/applications?view=components` with banner: `These components aren't attached to an application.`

Component detail view: `/repository/applications/[id]/components/[componentId]`. It shows `← Back to {application}`, `Component of {application} · {kind}`, Part of, Hosting (runs on), Governance (owner, or the application's owner as `{team} · from {application}`), Description, and the existing Tech debt/History if components have them. Components appear in global search (`Component · {application}`) and in the Ask record index.

---

### 8.5 Bulk fill missing — phase 2 (UI) / phase 3 (new fields)

Entry points: select rows → action bar `Fill missing`; column header menu `Fill missing {field} ({n})`; Overview CTAs.

**Drawer title:** `Fill missing {field}`  
**Body:** `{n} items have no {field}. Values you enter here only fill blanks. Nothing already set is changed.`

Layout: one row per item (name, current context such as vendor or hosted where), one editor per row, and a `Set all to` control at the top. Primary `Save {k} changes`; secondary `Cancel`. Skipped rows stay blank.

Rule: bulk fill **never overwrites** a non-empty value. Overwriting is a separate, explicit `Edit selected` action (P1, not in MVP).

Toast on save: `Filled {field} on {k} items.` with `Undo` (10 seconds; reverts only the values written).

---

### 8.6 Migration review banner — phase 3

Shown on Infrastructure (and Applications if any System changed) to workspace admins until resolved or dismissed.

**Banner:** `We tidied up {n} infrastructure items. Provider is now Vendor, and hosting terms moved to Hosted where. {k} need a quick look.`  
Buttons: `Review {k}` · `Dismiss`

**Review drawer title:** `Check these changes`  
Rows: item, `Was`, `Now`, suggestion, actions `Accept` · `Edit` · `Undo change`.  
Example row: `AS400` · Was: Provider `—`, Hosting model `—` · Now: Hosted where `Unknown` · Suggested vendor `IBM` · Accept.

---

### 8.7 Vendors and contracts (derived) — phase 5

**Title:** `Vendors and contracts`  
**Subtitle:** `Built from the vendor, cost, and renewal on your applications and infrastructure.`

Table columns: `Vendor`, `Items` (count, click to expand the item list), `Annual cost` (sum per currency), `Next renewal` (earliest future date + item name), `Owners` (distinct teams, max 3 + `+{n}`), `Highest criticality`, `Lifecycle` (`{a} active · {r} retiring`).

Read-only in phase 1 of this view: editing a cell shows `Edit on the item. Vendors are built from item fields.` Clicking a vendor opens a panel listing its items in the standard table with inline edit.

Footer rows: `No vendor ({n} items, {amount})` → Applications/Infrastructure filtered `missing=vendor`; `Built in-house ({n})`.

Empty state: `No vendors yet. Add a vendor to your applications and infrastructure and they'll show up here.` CTA `Add vendors`.

**Later phase (first-class Vendor):** a Vendor record with the six shared fields (owner = relationship owner, annual cost = contract value, renewal = master agreement end), plus website, account manager, and notes. Item `vendor` strings link to it by normalized name. Design the derived view's URLs (`/repository/vendors/[normalizedName]`) so they can resolve to Vendor IDs later without breaking links.

---

## 9. Implementation notes for Cursor

Inspect before writing code: router layout, the Repository nav component, the list/card component, the detail panel component, the schema (Prisma/Drizzle/SQL/other) for System, Platform, Runtime, Integration/Flow, Component, People/Team, Tech debt, and the existing feature-flag helper used by `onboarding.day1.v1`.

Suggested shape (adapt to the real tree):

```
src/repository/
  nav/repositoryNav.ts          // nav config: labels, routes, counts, advanced group
  nav/legacyRoutes.ts           // old → new map, shared by redirects and link rewrites
  table/RepositoryTable.tsx     // dense table: sort, filter, gap cells, inline edit
  table/columns.ts              // six shared columns + per-list extras
  table/BulkFillDrawer.tsx
  panel/KeyFacts.tsx
  panel/AddPrompt.tsx           // "Add X" empty-field prompt
  panel/VendorEditor.tsx
  overview/OverviewPage.tsx
  overview/panels/*.tsx         // P1–P7
  overview/queries.ts           // spend, renewals, dependents, SPOF
  vendors/deriveVendors.ts      // normalizeVendor + aggregation
  migration/hostedWhere.ts      // Appendix A
  migration/vendorFromProvider.ts // Appendix B
```

- **Flag:** `repository.mvp.v1`, workspace-scoped, same helper as `onboarding.day1.v1`. Dogfood on Meridian Fasteners / Default and the Research Sandbox account.
- **Copy rule:** in Repository UI the nouns are Application, Infrastructure, Connection, Vendor, Owner. API/DB names stay. One glossary tooltip: `Applications used to be called Systems. Same records, new name.` The onboarding spec's "tool" copy is unchanged. Nav labels use `&` to match the mockup (`Vendors & contracts`, `Owners & teams`, `APIs & events`).
- **Unified Infrastructure list:** a read model that unions Platform and Runtime rows with a `source` discriminator. Do not merge the tables. *(With `infra.split.v1` this is replaced by two per-type lists; see INFRA-SPEC.md.)*
- **Performance:** Overview queries run server-side on one request; workspaces are small (free plan cap 50 objects), so compute in memory after one fetch per object type rather than adding aggregates.
- **Reuse:** team/person create-on-save from Quick Add, Category enum, History writer, Tech debt data.

## 10. Analytics events

```
repository_nav_clicked { item, from_item }
repository_architecture_group_toggled { open }
repository_empty_section_viewed { section }
repository_component_opened { from: "panel" | "search" | "ask" | "redirect" }
repository_legacy_route_redirected { from, to }
list_viewed { list, view: "table" | "cards", row_count, missing_any_count }
list_view_toggled { list, view }
list_filter_applied { list, filter, value, source: "toolbar" | "overview" | "url" }
list_sorted { list, column, direction }
list_cell_edited { list, field, was_empty }
list_gap_cell_clicked { list, field }
bulk_fill_opened { list, field, missing_count, source }
bulk_fill_applied { list, field, filled_count, skipped_count }
bulk_fill_undone { list, field, count }
detail_add_prompt_clicked { object, field }
detail_vendor_hosting_term_warned { value, moved: boolean }
connections_advanced_toggled { on }
overview_viewed { fill_rate, panels_empty: string[] }
overview_panel_clicked { panel, target_list }
overview_empty_cta_clicked { panel, field }
migration_completed { workspace_id, items, vendor_copied, hosted_where_set, suggestions, conflicts }
migration_review_action { action: "accept" | "edit" | "undo" | "dismiss", reason }
vendors_view_opened { vendor_count, unassigned_items }
```

Funnel: `overview_viewed` → `overview_panel_clicked` or `overview_empty_cta_clicked` → `bulk_fill_applied` / `list_cell_edited`. If Overview CTAs don't lead to fills, fix the filtered-list landing first.

---

## 11. Phasing (build order)

| Phase | Scope | Schema change | Exit criteria |
|---|---|---|---|
| **1. Nav** | New labels, `Your estate` + `Architecture` groups (remembered open/closed, empty sections show count + hint, nothing hidden), Products removed (redirect to Roadmaps), unified Infrastructure list (read model), Connections Advanced toggle (Integration infra), Components into Application detail with their own detail view, redirects, `Add X` prompts on existing fields, Provider label `Vendor (was Provider)` | None | All old routes redirect; no data changes |
| **2. Table** | Table component, six shared columns (existing fields only; missing fields show as gap columns disabled with `Coming soon`), sort, filter, URL state, cards toggle, inline edit, bulk fill for existing fields | None | Lists default to table behind flag |
| **3. Fields + migration** | Add owner person, currency, renewal date, notice period, lifecycle values, criticality on System, Hosted where, vendor on Platform/Runtime, runs-on if missing; run migration §7.6; review banner; enable remaining columns and bulk fill | Yes | Migration idempotent on re-run; History entries written; rollback tested |
| **4. Overview** | P1–P7 panels, completeness strip, empty/partial states, links to filtered lists | None | Every panel number matches its filtered list |
| **5. Vendors** | Derived Vendors and contracts view, nav count, P1 link retarget | None | Totals match sum of items per currency |
| **Cost lines** (`cost.lines.v1`) | `properties.cost_lines` + `lib/cost/` module (only reader/writer, write-back to `annual_cost`), refactor of every `annual_cost` reader, table column + quick entry, panel Cost section, shared lines + infrastructure share, spend report, Ask; optional backfill. See COST-SPEC.md and CURSOR-COST-INSTRUCTIONS.md (C0–C6b, C2b) | No structural change (properties JSON only) | Legacy parity with flag off; no double counting test passes |
| Later | First-class Vendor object; overwrite bulk edit; currency conversion; contract documents | Yes | — |

---

## 12. QA checklist

- [ ] Flag off: old nav, old routes, card grids, and old panel render exactly as today
- [ ] Flag on: nav shows `Your estate` (Overview, Applications, Infrastructure, Connections, Vendors & contracts, Owners & teams) and an `Architecture` group (Capabilities, Processes, Roadmaps, APIs & events, Data › Entities, Stores, Domains)
- [ ] `Architecture` collapses, stays collapsed after reload (per user), and auto-expands on an Architecture route
- [ ] Empty sections (e.g. Domains 0, or Roadmaps 0 in a workspace with none) show a muted 0 and their hint; nothing is hidden
- [ ] No Products entry; every old Products URL redirects to Roadmaps
- [ ] Every old route in §6.2, including detail routes with IDs, query strings, and hashes, redirects to the right place
- [ ] Infrastructure count = Platforms (3) + Runtimes (2) = 5 in Meridian
- [ ] Infrastructure type chips filter correctly; `On-prem server` includes colocation
- [ ] Components no longer in nav; Application detail shows the Components section, `Add component` works, a component opens its own detail view, search finds components, and old Components URLs redirect
- [ ] Connections defaults to Flows; Integration infra appears only with Advanced on; APIs & events are reachable from Architecture
- [ ] Table fits Name + six shared columns at 1280×800 without horizontal scroll
- [ ] Blank cells show amber `Add`; header shows `{n} missing`; `Missing fields` filter matches the count
- [ ] Inline edit saves, writes History, and reverts with an error toast on failure
- [ ] Bulk fill never overwrites a set value; Undo reverts only what it wrote
- [ ] Cards toggle persists per user per list
- [ ] Detail panel: no two fields say the same thing; Type/Hosting model replaced by Hosted where; Provider shows as Vendor
- [ ] Typing `On-prem` into Vendor shows the hosting-term warning and `Move it` works
- [ ] Owner shows team and named person; empty person shows `Add a named owner`
- [ ] Tech debt and History tabs unchanged and still populated
- [ ] Migration: re-running produces no new changes or History entries
- [ ] Migration: hosting terms in Provider end up in Hosted where, not Vendor
- [ ] Mixed currencies never summed together on Overview or Vendors (flag off; with `cost.lines.v1` there is one workspace currency)
- [ ] With `cost.lines.v1`: cost QA is in CURSOR-COST-INSTRUCTIONS §3 and COST-SPEC §10
- [ ] Each Overview panel link opens a list whose rows reproduce the panel number
- [ ] Partial-data copy uses real counts (e.g. `Add annual cost to 4 apps to see full spend.`)
- [ ] P4 dependents include apps linked by Connections in either direction and apps that run on the item
- [ ] P6 flags a critical app with exactly one runs-on item; an app with two is not flagged
- [ ] Overview never shows capability/domain/TOGAF wording
- [ ] **Sample data:** `DigitalOcean Box` is labeled `Runtime · On-prem / bare metal` with Provider/Hosting model on-prem. After migration it must be Hosted where = `Cloud`, Vendor = `DigitalOcean`, and appear in the review queue as a `conflict`. Fix the seed/sample data too
- [ ] **Sample data:** the `AS400` card has empty fields. It must show `Add X` prompts, count toward gaps, get a `Suggested: IBM` vendor (not auto-applied), and Hosted where `Unknown` until someone sets `On-prem server`
- [ ] **Sample data:** both Runtimes show Cost model `Capital asset (depreciated)`, SLA 99.9%, Criticality Low, Lifecycle Pilot. Confirm these are real values and not defaults leaking into empty records

---

## Appendix A — Hosting terms → Hosted where

| Source value (Type suffix, Hosting model, or Provider; case-insensitive contains) | Hosted where |
|---|---|
| on-prem, on prem, bare metal, self-hosted, server room, in-house server, midrange | `on_prem` |
| colo, colocation, data center, datacenter | `colocation` |
| cloud, iaas, paas, vps, droplet, ec2, azure vm, compute engine | `cloud` |
| saas, vendor-hosted, managed service, tenant | `saas_platform` |
| network, firewall, sd-wan, vpn, isp, circuit, switch, router, wan, lan | `network` |
| hybrid, empty, anything else | `unknown` (review queue if non-empty) |

Known cloud vendors override a conflicting on-prem term: AWS, Amazon Web Services, Azure, Microsoft Azure, Google Cloud, GCP, DigitalOcean, Linode, Akamai, Vultr, Hetzner, OVH, Oracle Cloud, IBM Cloud.

## Appendix B — Name → vendor suggestions (suggest only, never auto-apply from the item name)

| Name contains | Suggested vendor |
|---|---|
| AS400, AS/400, iSeries, IBM i, Power Systems | IBM |
| DigitalOcean, droplet | DigitalOcean |
| AWS, EC2, S3, RDS | Amazon Web Services |
| Azure, Microsoft 365, M365, Office 365, Entra | Microsoft |
| GCP, Google Cloud, Google Workspace | Google |
| Salesforce | Salesforce |
| NetSuite, Oracle | Oracle |
| SAP | SAP |
| VMware, vSphere, ESXi | Broadcom (VMware) |
| Dell, PowerEdge | Dell |
| HPE, ProLiant | Hewlett Packard Enterprise |
| Cisco, Meraki | Cisco |
| Fortinet, FortiGate | Fortinet |

A Provider value that already matches a vendor in this table (or any non-hosting term) is copied directly (§7.6 Step 2).

---

## Appendix C — Cursor implementation prompt (paste into Agent)

Use this in the BuboMap repo. Run one phase per PR; change the phase number each time.

> Implement **phase 1** of `REPOSITORY-MVP-SPEC.md` (nav renames and grouping, no schema change) behind the workspace feature flag `repository.mvp.v1`.  
> **Before writing code, inspect the repo and report back:** the router layout and the real Repository routes; the Repository nav component; the list/card and detail-panel components; the schema for System, Platform, Runtime, Integration/Flow, API, Event, Component, People/Team, and Tech debt; whether an Application→Infrastructure "runs on" relationship exists; the Criticality, Lifecycle, and Cost model enum values; and the existing feature-flag helper used for `onboarding.day1.v1`. Replace the placeholder routes in spec §6.2 with the real ones and list any spec assumption (§7.2) that turned out wrong.  
> Then: rename nav labels to Overview, Applications, Infrastructure, Connections, Vendors & contracts (placeholder page until phase 5), Owners & teams, in an always-open `Your estate` group. Add an `Architecture` group (shown, collapsible, open/closed remembered per user) with Capabilities, Processes, Roadmaps, APIs & events, and Data (Entities, Stores, Domains); empty sections show a muted count and a one-line hint and are never hidden (§6.1). Remove Products from the nav and redirect its routes to Roadmaps. Build the unified Infrastructure list as a read model over Platform + Runtime with type chips (Cloud, On-prem server, SaaS platform, Network). Put Integration infra behind an `Advanced` toggle in Connections. Move Components into the Application detail (Components section with `Add component`, plus a component detail view; components stay searchable). Add permanent redirects from every old route (keep IDs, query, hash) using one shared `legacyRoutes` map. Replace blank field labels with the `Add X` prompts from §8.3. Relabel Provider as `Vendor (was Provider)` only.  
> Do **not** rename database tables, API types, or persisted enums. Do **not** add fields, run migrations, or build Overview panels in this PR. Keep the Tech debt and History tabs unchanged. With the flag off, the UI must be identical to today.  
> Use the spec's ship copy unless a string already exists. Add the analytics events from §10 that apply to this phase. Finish by walking the phase 1 items in the §12 QA checklist on the Meridian Fasteners / Default workspace.

For later phases, swap the first line (e.g. `Implement **phase 3** …`) and the scope paragraph with the matching row of §11. For phase 3, also require: a dry-run mode for the migration that prints a per-item diff for Meridian before writing, and a test that a second run makes no changes.

---

*Baseline: Repository screenshots of the Meridian Fasteners / Default workspace (Runtimes list and Runtime detail panel), Sep 2026. Only the Runtime panel was observed; the System panel layout, route paths, and enum values are assumptions to verify. Spec does not invent backend objects beyond a few shared fields, Hosted where, and an optional runs-on link.*
