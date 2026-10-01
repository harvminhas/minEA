# BuboMap: Platforms & cloud + Servers & devices (infrastructure split) — spec v1

**Flag:** `infra.split.v1` (requires `repository.mvp.v1`; default off; I0 confirms the flag helper)
**Prompts:** CURSOR-INFRA-INSTRUCTIONS.md (I0–I7, plus optional I1b backfill)
**Mockup:** `bubomap-ui.html`, shots `19-platforms.png` … `23-aging-tile-or-report.png`
**Builds on:** REPOSITORY-MVP-SPEC.md (nav, tables, panel), COST-SPEC.md v2 (cost module, "No host linked" hint), CURSOR-ASK-FIXES.md (impact builder, answer strategy)
**v1 (Sep 30, 2026).** Replaces the single "Infrastructure" list with two lists that match minEA's real object types: **Platforms & cloud** = the platform type, **Servers & devices** = the runtime type.

Names marked **(fact)** come from the repo owner. Everything else is a design choice. I0 checks every fact in the code and writes DISCOVERY.md §17. Where the code disagrees, the code wins and Cursor asks.

---

## 0. Storage facts this design is built on

| Topic | Fact (from the repo owner) |
|---|---|
| Objects | One objects store; each object has a type and a `properties` JSON blob. Owner is a real column. Vendor, cost and hosting are keys in `properties`. **(fact)** |
| Platform type | `vendor` is a short code (`oracle`, `microsoft`, `salesforce`, …) plus optional `vendor_product`. `hosting_model` is `saas` \| `paas` \| `self_hosted` \| `hybrid`. **(fact)** |
| Runtime type | `vendor` = supplier; `runtime_provider` = who hosts it; `compute_runtime_kind` exists; `cost_model` may be `capex`; renewal key is `commitment_ends`. **(fact)** |
| Applications | `hosting_model` is `cloud` \| `on_premise` \| `hybrid` \| `saas`. Where it really runs = `runs_on` / `built_on` relationships pointing at a platform or runtime. **(fact)** |
| Ask impact | Walks relationships, never `hosting_model`. **(fact)** |
| Catalog labels | "On-prem server / SaaS platform / Cloud" are derived from `hosting_model` + `compute_runtime_kind`. **(fact)** |
| Ask rules | `apps/web/lib/ask/answerStrategies.ts`; the model path is the existing `/ai/ask` loop (possibly Python), which loads `strategyPrompt` (via a generated JSON artifact if needed). There is **no** `ask.llm.v1` flag. **(fact)** |
| Cost | `properties.cost_lines` + `lib/cost/` (COST-SPEC.md). **(fact, from the cost design)** |

The reference screenshots in `refs/` (`runtimes-list.png`, `runtime-detail.png`) show the current runtime card and panel: "Runtime · On-prem / bare metal", Provider, Hosting model, Cost model "Capital asset (depreciated)", SLA target, Criticality.

---

## 1. Principles

1. **Two lists, two real types.** Platforms & cloud lists the platform type; Servers & devices lists the runtime type. No union read model, no merged table, **no new tables, no structural migrations.**
2. **Reuse before adding.** New `properties` keys are added only where I0 shows that no existing key holds the fact. If `os`, `location`, `region`, `warranty_end`, … exist, they are used (and the config maps them).
3. **One config, one status function.** Enums, labels, the EOL OS list, thresholds and the "No host linked" rule live in `lib/infra/infraConfig.ts` (same pattern as `relationshipImpactRules`). Support status is computed in one server module, `lib/infra/status.ts`. Tables, badges, chips, the Overview tile, reports and Ask all call it. No component computes status.
4. **Relationships, not labels.** "Built on it", "Runs", "Runs on it", "Impact if down" and "No host linked" come from `runs_on` / `built_on` edges. `hosting_model` is a label. Its only use is deciding when to show "No host linked".
5. **Cost comes from the cost module.** The panels' Cost section and the Platforms footer call `lib/cost/` (COST-SPEC). This spec adds no cost maths.
6. **Zod on every server-side write** of the new keys, inside the existing properties write path. Unknown values are rejected with a readable message.
7. **No bulk rewrite.** Objects nobody edits keep their properties. Mapping `compute_runtime_kind` → `runtime_kind` runs only on request, dry run first (I1b).
8. **Flag off = today.** With `infra.split.v1` off, the single Infrastructure list and every route behave exactly as before.

---

## 2. Glossary (UI words)

| UI word | Meaning |
|---|---|
| Platforms & cloud | Objects of the platform type: SaaS suites, PaaS, cloud accounts, self-hosted platforms |
| Servers & devices | Objects of the runtime type: servers, VMs, cloud services, databases, network gear, storage, end-user devices |
| Kind | `platform_kind` (platforms) or `runtime_kind` (runtimes), shown as a label |
| Supplier | Runtime `vendor`: who you buy it, or its support, from |
| Provider | Runtime `runtime_provider`: who hosts and runs it |
| Built on it / Runs | Count of distinct objects with a `runs_on` or `built_on` edge **to** this record (direct only) |
| Support status | Output of `infraStatus()` (§5): `out_of_support`, `unsupported_os`, `ends_soon`, `ok`, `unknown` |
| No host linked | An application/solution whose `hosting_model` says it runs somewhere we manage (default `on_premise`, `hybrid`) but that has no `runs_on`/`built_on` edge |

---

## 3. Navigation and routes

### 3.1 Nav (shots 19, 20)

`Your estate` (always open): **Overview · Applications · Platforms & cloud · Servers & devices · Connections · Vendors & contracts · Owners & teams**. The single `Infrastructure` item is removed. Icons: cloud (Platforms & cloud), server (Servers & devices). Counts = number of objects of that type in the workspace. The `Architecture` group is unchanged.

"Model {pct}% complete" (REPOSITORY-MVP §5) keeps its definition. Its base becomes Applications + Platforms + Runtimes, which is the same set as before.

### 3.2 Routes

Use the route base P2 built (DISCOVERY §2 / P2 notes; the mockup uses `#/model/...`).

| New route | Shows |
|---|---|
| `{base}/platforms` | Platforms & cloud table |
| `{base}/platforms/{id}` | table + platform panel |
| `{base}/servers` (`?status=all\|attention\|out_of_support_or_os\|ends_soon\|ok\|unknown`) | Servers & devices table, status chip preselected |
| `{base}/servers/{id}` | table + runtime panel (keeps `?status=`) |

| Old route | Redirects to (flag on) |
|---|---|
| `{base}/infrastructure` | `{base}/servers` (most-used half; the old list was mostly runtimes) *(see Q3)* |
| `{base}/infrastructure?source=platform` / `?source=runtime` | `{base}/platforms` / `{base}/servers` |
| `{base}/infrastructure/{id}` | `{base}/platforms/{id}` or `{base}/servers/{id}` by the object's type (server-side lookup; 404 page if not found) |
| `/repository/platforms`, `/repository/runtimes` (the P2 legacy redirects) | the new pages instead of the unified list |

Redirects live where the existing ones live (DISCOVERY §2). Query strings `q`, `sec`, `missing` carry over. With the flag off, nothing redirects.

---

## 4. Data: properties keys

### 4.1 Runtimes (new keys only if I0 shows they don't exist)

| Key | Type | Values / rule | UI |
|---|---|---|---|
| `runtime_kind` | enum | `physical_server` \| `vm` \| `cloud_service` \| `database` \| `network_device` \| `storage` \| `end_user_device` | Kind + icon |
| `location` | enum | `office` \| `data_center` \| `cloud_region` | Location line 1 |
| `location_detail` | string ≤ 120 | free text, e.g. `Fremont plant · server room B`, `AWS · us-east-1` | Location line 2 |
| `os_name` | string ≤ 80 | free text; matched case-insensitively against the EOL list | OS & version |
| `os_version` | string ≤ 40 | free text, e.g. `7.3`, `2012 R2`, `22.04 LTS` | OS & version |
| `support_ends` | ISO date | warranty / vendor support / support contract end for **this** item | Support ends |
| `end_of_life` | ISO date | when the item itself is planned to be retired or the vendor ends the product | End of life |

Existing keys used as they are: `vendor` (Supplier), `runtime_provider` (Provider), `compute_runtime_kind`, `hosting_model`, `cost_model`, `commitment_ends` (renewal), lifecycle, criticality, SLA target, owner column.

**Mapping `compute_runtime_kind` → `runtime_kind`.** I0 lists the real values. I1 proposes the map, e.g. bare metal / on-prem server → `physical_server`, virtual machine → `vm`, container / serverless / managed service → `cloud_service`. Unmapped values give `runtime_kind = null` (Kind shows a dash, amber in the quick filter). Read order: `runtime_kind` if set, else `mapComputeKind(compute_runtime_kind)`, else null. `runtime_kind` is written only when a user picks a Kind, or by the I1b backfill.

### 4.2 Platforms

| Key | Type | Values | UI |
|---|---|---|---|
| `platform_kind` | enum | `saas_suite` \| `paas` \| `cloud_account` \| `self_hosted` | Kind |

Existing keys used as they are: `vendor` (short code), `vendor_product`, `hosting_model` (`saas|paas|self_hosted|hybrid`, labels SaaS / PaaS / Self-hosted / Hybrid), `contract_renewal`, owner column.

Default when `platform_kind` is blank (read-only inference, never written): `hosting_model = saas` → `saas_suite`; `paas` → `paas`; `self_hosted` → `self_hosted`; else null. Inferred kinds show in the table as normal text with the tooltip "From hosting model". *(new)*

### 4.3 Labels (config)

| Enum | Labels |
|---|---|
| runtime_kind | Physical server · VM · Cloud service · Database · Network device · Storage · End-user device |
| location | Office · Data center · Cloud region |
| platform_kind | SaaS suite · PaaS · Cloud account · Self-hosted |
| platform hosting_model | SaaS · PaaS · Self-hosted · Hybrid |
| status | OK · Ends in {n} days · Out of support · Unsupported OS · Not set |

Platform vendor codes → display names use the **existing** code list and display mapping (COST-SPEC T18 / DISCOVERY §16.7), not a new list.

### 4.4 `lib/infra/infraConfig.ts` (one file, follows `relationshipImpactRules`)

```ts
export const infraConfig = {
  runtimeKinds: [
    { key: 'physical_server', label: 'Physical server', icon: 'server' },
    { key: 'vm',              label: 'VM',              icon: 'vm' },
    { key: 'cloud_service',   label: 'Cloud service',   icon: 'cloud', managed: true },
    { key: 'database',        label: 'Database',        icon: 'db' },
    { key: 'network_device',  label: 'Network device',  icon: 'router' },
    { key: 'storage',         label: 'Storage',         icon: 'hdd' },
    { key: 'end_user_device', label: 'End-user device', icon: 'laptop' },
  ],
  computeRuntimeKindMap: { /* filled in I1 from DISCOVERY §17.3 */ },
  locations: [ { key: 'office', label: 'Office' }, { key: 'data_center', label: 'Data center' }, { key: 'cloud_region', label: 'Cloud region' } ],
  platformKinds: [ { key: 'saas_suite', label: 'SaaS suite' }, { key: 'paas', label: 'PaaS' }, { key: 'cloud_account', label: 'Cloud account' }, { key: 'self_hosted', label: 'Self-hosted' } ],
  platformHostingLabels: { saas: 'SaaS', paas: 'PaaS', self_hosted: 'Self-hosted', hybrid: 'Hybrid' },
  status: { endsSoonDays: 90 },
  eolOs: [   // name/version matched case-insensitively, whitespace-collapsed; date = end of extended support
    { name: 'Windows Server', version: '2012 R2', ends: '2023-10-10' },
    { name: 'Windows Server', version: '2012',    ends: '2023-10-10' },
    { name: 'Windows Server', version: '2016',    ends: '2027-01-12' },
    { name: 'SQL Server',     version: '2016',    ends: '2026-07-14' },
    { name: 'IBM i',          version: '7.3',     ends: '2023-09-30' },
    { name: 'Windows 11',     version: '23H2',    ends: '2026-11-10' },
    { name: 'Ubuntu',         version: '22.04',   ends: '2027-04-30', match: 'prefix' },
  ],
  noHostLinked: {
    types: ['application', 'solution'],            // real type ids from DISCOVERY §17.1
    hostingModels: ['on_premise', 'hybrid'],       // configurable
    edgeKinds: ['runs_on', 'built_on'],
  },
  hostEdgeKinds: ['runs_on', 'built_on'],          // what "Built on it" / "Runs" count
} as const;
```

Dates in `eolOs` are from vendor lifecycle pages as of Sep 2026. Each entry carries a `source` URL comment. Admins don't edit this list in the UI in v1 *(Q5)*.

### 4.5 Validation (zod, server-side)

`lib/infra/schema.ts` exports `runtimeInfraPropsSchema` and `platformInfraPropsSchema`. Both are partial and accept `null` to clear a key. They are applied in the existing properties write path (the same hook as `cost_lines`, DISCOVERY §16.1 / §17.1) for objects of those types.

| Rule | Message |
|---|---|
| `runtime_kind` not in the enum | `Pick a kind from the list.` |
| `location` not in the enum | `Location must be Office, Data center, or Cloud region.` |
| `location_detail` > 120 | `Keep the location detail under 120 characters.` |
| `support_ends` / `end_of_life` not an ISO date, or year outside 1990–2100 | `Use a date like 2027-03-01.` |
| `os_version` without `os_name` | `Add the OS name too.` |
| `platform_kind` not in the enum | `Pick a kind from the list.` |

---

## 5. Support status: `lib/infra/status.ts`

```ts
export type InfraStatus = 'out_of_support' | 'unsupported_os' | 'ends_soon' | 'ok' | 'unknown';
export interface InfraStatusResult {
  status: InfraStatus;
  severity: 'bad' | 'warn' | 'ok' | 'none';
  label: string;              // 'Out of support' | 'Unsupported OS' | 'Ends in 63 days' | 'OK' | 'Not set'
  daysLeft: number | null;    // to the earliest relevant date; negative = past
  effectiveDate: string | null; // the date shown in "Support ends"
  dateSource: 'support_ends' | 'os' | null;
  osMatch: { name: string; version: string; ends: string } | null;
  reason: string;             // for tooltips, reports and Ask: 'IBM i 7.3 standard support ended Sep 30, 2023'
}
export function infraStatus(obj: RuntimeLike, today: Date, cfg = infraConfig): InfraStatusResult;
export function infraStatusMany(objs: RuntimeLike[], today: Date): Map<string, InfraStatusResult>;
export function agingSummary(workspaceId, today): { outOfSupportOrOs: number; endsSoon: number; unknown: number; items: … };
```

**Rules, in this order (first match wins):**

1. `out_of_support`: `support_ends` < today.
2. `unsupported_os`: `os_name` + `os_version` match an `eolOs` entry whose `ends` < today.
3. `ends_soon`: the earliest of `support_ends` and the matched OS `ends` is ≥ today and < today + `endsSoonDays` (90). Label `Ends in {n} days`.
4. `ok`: there is a future date (support_ends or matched OS), or the kind is `managed` (cloud_service) with no dates.
5. `unknown`: no `support_ends`, no OS match, not managed. Label `Not set`.

`effectiveDate` = `support_ends` if set, else the matched OS `ends`. `today` comes from the caller (server date in the workspace timezone, or the fixture TODAY in tests). `end_of_life` is shown but does **not** drive status in v1 *(Q4)*. Platforms have no support status in v1.

**Severity → badge:** bad = red (`Out of support`, `Unsupported OS`), warn = amber (`Ends in {n} days`), ok = green (`OK`), none = grey (`Not set`). The "Support ends" date is red when bad and amber when warn.

---

## 6. UI

### 6.1 Platforms & cloud table (shot 19)

Header: eyebrow `Suites and clouds you build on`, h1 `Platforms & cloud`, `{n} records`, `Fill missing ({n})`, `+ Add`. Toolbar: search `Search by name, vendor, or owner`, `All kinds` select, `Any hosting` select, quick filter `Missing owner or cost`.

| Column | Source | Blank |
|---|---|---|
| Name | name, icon | — |
| Vendor | display name of the code; sub-line mono `{code} · {vendor_product}` | grey dash |
| Kind | `platform_kind` label (or inferred, §4.2) | grey dash |
| Hosting | `hosting_model` label as a neutral pill | grey dash |
| Owner | owner column: team, sub-line person | **amber `+ Add`** |
| Built on it | count of distinct `runs_on`/`built_on` sources; sub-line `{a} apps · {s} servers` | grey dash at 0 |
| Annual cost (US$) | cost module cell (COST-SPEC §7.1) | **amber `+ Add`** (quick entry) |
| Renewal | `contract_renewal`; `within 90 days` sub-line in amber when < 90 days | grey dash |

Only owner and cost are "key" blanks here (amber). Everything else shows a grey dash. Footer: `{shown} of {n} shown · amber = missing owner or cost · a dash means not set` and `Total {portfolioTotals(types: platform)}` (shared lines are counted at the platform, COST-SPEC §5.3).

### 6.2 Servers & devices table (shot 20)

Header: eyebrow `Where things run`, h1 `Servers & devices`. Toolbar: search `Search by name, OS, or owner`, `All kinds`, `Any location`, quick filter `Missing owner`. Status chips with counts: `All` · `Needs attention` (bad + warn) · `Out of support / unsupported OS` · `Ends in 90 days` · `OK` (· `Not set` only when > 0).

| Column | Source | Blank |
|---|---|---|
| Name | name, kind icon, 2-line clamp | — |
| Kind | runtime_kind label | grey dash |
| Location | location label; sub-line `location_detail` | grey dash |
| OS & version | `{os_name} {os_version}`; red text when `unsupported_os` | grey dash |
| Runs | count of distinct direct `runs_on`/`built_on` sources; tooltip lists names | grey dash at 0 |
| Owner | team + person | **amber `+ Add`** |
| Support ends | `effectiveDate` (red/amber by severity; tooltip `reason`) | grey dash |
| Status | badge from `infraStatus` | `Not set` (grey) |

No cost column (cost is in the panel). Footer: `{shown} of {n} shown · {x} out of support or on an unsupported OS · {y} ending in 90 days` and, on the right, `Runs = apps with a runs-on link`.

**Quick-add row** (last row of the table, flag on, users who can create objects): `+` · input `Add a server or device, e.g. ESX01 VMware host` · Kind select (default Physical server) · `Save` · hint `Only a name and kind are needed. Fill in the rest later.` Enter or Save creates a runtime stub (`name`, `properties.runtime_kind`, owner blank) through the existing create path. The row re-renders from the server, and the toast reads `Added {name} ({kind}). Open it to fill in the rest.` An empty name gives an inline `Type a name first`. Duplicate names are allowed, with the hint `There's already a "{name}". Saved anyway.` *(new)*.

### 6.3 Width at 1280 (both tables)

At 1280×800 with the panel closed, there is no horizontal scroll and the top bar fits. Use `table-layout: fixed` with percentage columns:
- Platforms: 18/13/11/8/14/12/13/11.
- Servers: 17/11/15/13/5/13/11/15.

Text cells clamp to 2 lines, sub-lines to 1 line with an ellipsis and a `title`. Badges never wrap. Below 1380px the top bar search shrinks to 180px. (In the mockup review, the old Infrastructure table and the top bar both overflowed at 1280.)

### 6.4 Runtime panel (shot 21)

Header: kind icon, name, `Server & device · {kind}`, chips: kind, status badge, lifecycle, criticality. Tabs as today. Details order:

1. **Server & device**: Kind (icon + label), Location (`{label} · {detail}`), OS & version, Support ends (date + badge, sub-line `reason`), End of life (`Not set` muted when blank), and, when this runtime itself has a host, `Runs on {host}` links.
2. **Supplier and provider**: two boxes side by side. `Supplier` = `vendor` ("Who you buy it or its support from (vendor)"); `Provider` = `runtime_provider` ("Who hosts and runs it (runtime provider)"). Blank → `Add supplier` / `Add provider` link.
3. **Runs on it** `{n} apps`: one card per direct `runs_on`/`built_on` source (icon, name, `{kind} · runs on {name}`, criticality pill), from the **shared impact builder** (CURSOR-ASK-FIXES A). Under it, a muted line `Also affected indirectly: {names} (through {via})` from the builder's indirect rows. Empty state: `Nothing is linked to run on it yet. Link an app`.
4. **Impact if down** bar (full width, accent): `Impact if down: ask what breaks if the {name} goes down →` opens Ask prefilled with `What breaks if the {name} goes down?` and submits it.
5. **Cost** (COST-SPEC §7.3, unchanged).
6. **Governance**: Owner, Lifecycle, Criticality. Then `Updated by …`.

### 6.5 Platform panel

Header `Platform · {kind}`. Sections: **Platform** (Kind, Hosting, Region if present) → **Vendor** (display name + mono code, Product = `vendor_product`) → **Built on it** `{n} records` (cards from the shared builder, line `{Type} · built on {name}` / `runs on {name}`; empty `Nothing is built on it yet.`) → **Cost** (cost module, including the host block `Shared by {n}` and shared-line split, COST-SPEC §7.3 item 6) → Governance.

### 6.6 "No host linked" (shot 22)

Shown in the application/solution panel's **Hosting** section when `noHostLinked(obj)` is true (§4.4: type in `types`, `hosting_model` in `hostingModels`, no edge of `edgeKinds` from it):

- Amber box: warn icon, **`No host linked`**, right-aligned `+ Add host`. Text: `Hosting says {label}, but nothing links {name} to a server or device, so "what breaks if…" and infrastructure cost can't include it.` If the object has a note/description that mentions a runtime name, add `Your note says "{match}".`
- `+ Add host` opens an inline picker under the text, without a modal:
  - Search `Search servers & devices`, searching name, kind and location.
  - `Suggested` group first: runtimes whose name appears in the object's note, description or `hosting` text, tagged `Suggested · matches "{text}"`.
  - Then `Servers & devices` (max 5 shown, scroll for more). Each row has the kind icon, name, `{kind} · {location} · {detail}` and the status badge.
  - Footer: `+ Add a new server or device` (goes to the quick-add row with the name prefilled from the search) and the muted note `Creates a runs-on link`.
- Picking a row creates a `runs_on` edge (app → runtime) through the **existing relationship API** and writes History. The panel then re-renders with `Runs on {name}`, and the toast reads `{app} now runs on {runtime}`. Platforms can be linked the same way (`built_on`) from the same picker under a `Platforms & cloud` group *(new, collapsed by default)*.
- The same predicate drives the table sub-line `On-prem · no host linked`, COST-SPEC's `hostHint = 'no_host_linked'` (C5 moves to call `noHostLinked`), and the Ask gap (§7).

### 6.7 Overview tile + Aging report (shot 23)

**Overview:** five KPI cards: Applications, Platforms & cloud (`{k} in pilot`), Servers & devices (`{k} critical`), Annual spend, Missing fields. Under them, the **Aging infrastructure** tile (full width, red tint when `outOfSupportOrOs > 0`, amber when only ends_soon, hidden when both are 0):
- Eyebrow `AGING INFRASTRUCTURE`; line `{x} items out of support or on an unsupported OS · {y} ending in 90 days`
- Item chips, bad first then warn, each showing name + badge colour
- Right: `Review in Servers & devices →`, linking to `{base}/servers?status=attention`

**Reports:** a new card `Aging infrastructure` (category Risk, icon clock) with `{x} out of support · {y} ending soon`. The detail page groups items by status (Out of support, Unsupported OS, Ends in 90 days, Not set) with columns Name, Kind, OS & version, Support ends, Runs, Owner, Reason. Each row opens the runtime panel. CSV export lists the same rows. The existing `End of life & retiring` report (lifecycle-based) stays as it is *(Q6)*.

---

## 7. Ask

1. **Intent `aging`** in `answerStrategies.ts` (CURSOR-ASK-FIXES B). Triggers: "out of support", "end of life", "EOL", "aging", "unsupported", "old servers", "what needs replacing". With no named item it is a list intent; with a named runtime it is a single-item answer.
2. It reads `agingSummary()` / `infraStatusMany()`, never `hosting_model` or raw dates in the prompt. Every item row cites its object, and numbers (counts, days) are registered for the validator (ASK-GROUNDING §5).
3. Answer shape: verdict line `{x} items are out of support or on an unsupported OS, and {y} end in the next 90 days.`, then a table grouped like the report, evidence bullets with `reason`, and gaps: `{n} servers & devices have no support date` (unknown).
4. Impact answers (CURSOR-ASK-FIXES A) add the gap `No host linked for {name}: hosting says {label} but no runs-on link` from `noHostLinked`.
5. "What breaks if the AS400 goes down?" is unchanged. It walks edges.

---

## 8. Fixture: Meridian infra overlay

Workspace **"Meridian Fasteners / Infra eval"** = the Cost eval workspace (COST-SPEC §9) + the rows below. USD, **TODAY 2026-09-25**. The base Meridian and Cost eval workspaces stay untouched. Types are suggestions; I0 maps them to the real ones.

**Platforms (6)**

| Name | vendor / product | platform_kind | hosting_model | Owner | Built on it | Cost (module) | contract_renewal |
|---|---|---|---|---|---|---|---|
| Microsoft 365 tenant | microsoft / Microsoft 365 | saas_suite | saas | Infrastructure Team · Priya Shah | 4 (Teams, Outlook, SharePoint, Office) | 51,840 (E3 line, shared) | 2027-01-14 |
| Dynamics 365 Business Central | microsoft / Dynamics 365 | saas_suite | saas | Finance · Carol Nguyen | 0 | blank | — (pilot) |
| Salesforce platform | salesforce / Salesforce Platform | paas | paas | Sales Ops · Jen Alvarez | 1 (Salesforce) | blank | 2026-10-31 |
| AWS account | aws | cloud_account | paas | **blank** | 4 (EDI, Invoicing, SQL01, Offsite backups) | 18,600 | — |
| Azure subscription | microsoft / Azure | cloud_account | paas | Infrastructure Team · Dana Ruiz | 1 (AZ-VM01) | blank | — (pilot) |
| Shopify (B2B parts store) | shopify / Shopify Plus | saas_suite | saas | Sales Ops · Jen Alvarez | 0 | blank | — (pilot) |

**Runtimes (10)**

| Name | runtime_kind | location · detail | OS | support_ends | Supplier / Provider | Runs | Status @ 2026-09-25 |
|---|---|---|---|---|---|---|---|
| AS400 | physical_server | office · Fremont plant · server room B | IBM i 7.3 | 2023-09-30 | IBM / Meridian (on-prem) | 3 (Order Entry, Inventory, EDI) | out_of_support |
| FS01 file & print server | vm | office · Fremont plant · server room B | Windows Server 2012 R2 | — | Microsoft / Meridian (on-prem) | 0 | unsupported_os (Oct 10, 2023) |
| RDS01 remote desktop | vm | office · same | Windows Server 2012 R2 | — | Microsoft / Meridian (on-prem) | 0 | unsupported_os |
| SQL01 invoicing database | database | cloud_region · AWS · us-east-1 (RDS) | SQL Server 2016 SP3 | 2026-07-14 | Microsoft / Amazon Web Services | 1 (Invoicing) | out_of_support |
| AZ-VM01 migration box | vm | cloud_region · Azure · East US 2 | Windows Server 2022 | 2031-10-14 | Microsoft / Microsoft Azure | 0 | ok |
| DigitalOcean Box | vm | cloud_region · DigitalOcean · NYC3 | Ubuntu 22.04 LTS | — | DigitalOcean / DigitalOcean | 0 | ok (OS ends 2027-04-30) |
| Offsite backups (S3) | cloud_service | cloud_region · AWS · us-west-2 | — | — | Amazon Web Services / Amazon Web Services | 0 | ok (managed) |
| NAS01 backup storage | storage | data_center · Sacramento colo · cage 14 | Synology DSM 7.2 | 2028-06-30 | Synology / Meridian (colo) | 0 | ok |
| Office network / firewall | network_device | office · Fremont plant · IDF closet | FortiOS 7.0 | 2026-11-30 | Fortinet / Meridian (on-prem) | 0 (4 apps depend via `connects_through`) | ends_soon (66 days) |
| Plant PC (label station) | end_user_device | office · Fremont plant · shipping dock | Windows 11 23H2 | 2026-11-10 | Dell / Meridian (on-prem) | 0 | ends_soon (46 days) |

The **firewall** is a platform in the Cost eval fixture. In the Infra eval workspace it is a runtime (`network_device`) with `commitment_ends` 2026-11-30 and the same 2,950 line, so totals don't change *(Q2)*. Edges as the Cost eval, plus `SQL01 runs_on AWS account`, `Offsite backups runs_on AWS account`, `AZ-VM01 runs_on Azure subscription`, `Invoicing runs_on SQL01`, `Salesforce built_on Salesforce platform`. Shop Floor Label Printing stays `on_premise` with **no** edge and a note mentioning "Plant PC".

**Derived facts (tests assert these):**

| Fact | Value |
|---|---|
| Status counts | out_of_support 2 (AS400, SQL01) · unsupported_os 2 (FS01, RDS01) · ends_soon 2 (firewall 66 d, Plant PC 46 d) · ok 4 · unknown 0 |
| Tile | `4 items out of support or on an unsupported OS · 2 ending in 90 days` |
| Chips | All 10 · Needs attention 6 · Out of support / unsupported OS 4 · Ends in 90 days 2 · OK 4 |
| Runs | AS400 3; SQL01 1; others 0 |
| Built on it | M365 tenant 4; AWS 4 (2 apps · 2 servers); Salesforce platform 1; Azure 1 |
| No host linked | Shop Floor Label Printing only; suggested host Plant PC |
| Platforms footer | `Total $70,440` (M365 51,840 + AWS 18,600) |
| Servers (cost in panels) | AS400 $71,400 · firewall $2,950 · DigitalOcean Box $1,440 → 75,790; platforms + runtimes = 146,230 (= the old Infrastructure total) |
| Unchanged | portfolio 234,660 · vendor spend 159,660 (11 vendors) · renewals(90) 4 / 41,980 |

**Mockup vs product.** The mockup uses TODAY 2026-09-28, so its badges read 63 and 43 days. It attributes the M365 shares to apps, so its Platforms footer reads $18,600. It shows text cells (`Trial (no cost)`, `Free credits (pilot)`, `Included in Salesforce`, `Dev store (no cost)`) where the product shows the cost module's blank state (amber `+ Add`) *(Q1)*. Its "Support ends" for FS01/RDS01 shows Oct 10, 2023, which is the product's OS-derived `effectiveDate`.

---

## 9. Tests

| # | Test | Expect |
|---|---|---|
| T1 | status order | support_ends past + EOL OS → `out_of_support`; EOL OS only → `unsupported_os` |
| T2 | ends_soon boundary | 89 days → ends_soon; 90 → ok; 0 (today) → ends_soon `Ends in 0 days`; −1 → out_of_support |
| T3 | earliest date | support_ends in 400 d, OS ends in 30 d → ends_soon (dateSource `os`) |
| T4 | OS match | `windows server 2012 r2`, `Windows  Server 2012 R2` match; `Windows Server 2012 R2 Datacenter` matches only with `prefix`; `2012` ≠ `2012 R2` unless listed |
| T5 | managed / unknown | cloud_service with no dates → ok; vm with no dates or OS match → unknown `Not set` |
| T6 | fixture | every row of §8 derived facts at TODAY 2026-09-25 |
| T7 | compute kind map | every DISCOVERY §17.3 value maps or returns null; `runtime_kind` wins over the map |
| T8 | zod | every §4.5 rule rejects with its message; `null` clears; unknown keys untouched |
| T9 | counts | Built on it / Runs = distinct sources over `hostEdgeKinds`; duplicate edges count once; edges from deleted objects ignored |
| T10 | noHostLinked | on_premise + no edge → true; with runs_on → false; cloud → false; config change of `hostingModels` changes the result |
| T11 | picker | creating the link calls the existing relationship API once; History written; second pick of the same host is a no-op |
| T12 | quick-add | name + kind creates a runtime with only those fields; empty name rejected; `runtime_kind` validated |
| T13 | redirects | old infrastructure routes → right new route by type; query strings kept; flag off → no redirect |
| T14 | one status source (grep) | no component, report or Ask tool compares `support_ends` to a date outside `lib/infra/status.ts` |
| T15 | Ask aging | intent routing; answer counts = agingSummary; every row cited; validator rejects a count not from the tool |
| T16 | cost parity | footers and spend in §8 unchanged by the split |

---

## 10. Rollout

1. I1–I2 land with the flag off; nothing visible changes.
2. I3+ behind `infra.split.v1`, per workspace. Turn it on for "Infra eval", then your own workspace.
3. I1b backfill only on request, dry run first.
4. The single Infrastructure list stays reachable with the flag off until the flag is removed. Remove the flag in a later clean-up PR.

---

## 11. Open questions (defaults in use)

| # | Question | Default |
|---|---|---|
| Q1 | Platforms with no cost (trial, credits, included elsewhere): blank, or a $0 line with a note? | Blank (amber `+ Add`); a $0 line is a COST-SPEC follow-up |
| Q2 | Is the firewall a platform or a runtime in the real data? | Runtime (`network_device`); the Cost eval fixture keeps it as a platform |
| Q3 | Where should old `/infrastructure` (no id) go? | Servers & devices |
| Q4 | Should `end_of_life` drive status? | No, it's shown only |
| Q5 | Editable EOL OS list in workspace settings? | No, config only in v1 |
| Q6 | Merge the Aging report into "End of life & retiring"? | Separate report; link from each other |
| Q7 | Do components (deployed to runtimes) count in "Runs"? | Only if I0 shows they use `runs_on`; then yes, shown as `{a} apps · {c} components` |
