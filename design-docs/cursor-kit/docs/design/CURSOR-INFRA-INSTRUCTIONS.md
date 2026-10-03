# BuboMap Platforms & cloud + Servers & devices: Cursor build instructions — v1

Paste these prompts into Cursor one at a time. Together they split the single Infrastructure list into **Platforms & cloud** (the platform type) and **Servers & devices** (the runtime type) in minEA (`D:\Users\hminhas\WebstormProjects\minEA`).

| Doc | Decides |
|---|---|
| `docs/design/INFRA-SPEC.md` (v1) | Properties keys, `lib/infra/infraConfig.ts`, `lib/infra/status.ts`, routes, UI rules, fixture, tests |
| The mockup `docs/design/bubomap-ui.html` and shots 19–23 | Layout, copy, states |
| `docs/design/COST-SPEC.md` + `CURSOR-COST-INSTRUCTIONS.md` | Everything about money; this package only places the cost cells and sections |
| `docs/design/CURSOR-ASK-FIXES.md` | The shared impact builder (A) and `answerStrategies.ts` (B); I4 and I7 build on them |
| `docs/design/CURSOR-UI-INSTRUCTIONS.md` | Still owns the shell, tokens (§2), the flag pattern and "how to run a prompt" (§1.2) |

Order of authority: DISCOVERY.md (what the code really does) > INFRA-SPEC > mockup > this file. On a conflict Cursor stops and asks.

**How minEA stores this (from the repo owner):** objects have a `properties` JSON blob, and owner is a real column. Vendor, cost and hosting are keys in `properties`. Platforms use a vendor short code + `vendor_product` and a `hosting_model` of `saas|paas|self_hosted|hybrid`. Runtimes have `vendor` (supplier), `runtime_provider` (who hosts it), `compute_runtime_kind`, `cost_model` (may be `capex`) and `commitment_ends`. Real hosting is the `runs_on` / `built_on` relationships. So: **no new tables, no structural migrations.** New keys go in `properties`, and only where I0 shows no existing key holds the fact.

Everything ships behind **`infra.split.v1`** (needs `repository.mvp.v1`). With it off, the single Infrastructure list and its routes behave exactly as today.

---

## 1. How to use this

### 1.1 Before you start

1. P0–P3 are done (DISCOVERY.md §1–15 committed). CURSOR-ASK-FIXES A and B are done (I4 reuses the impact builder; I7 adds an intent to `answerStrategies.ts`). Cost C3–C5 are ideally done. If they aren't, I3/I4 show the legacy `annual_cost` cell and section and leave `TODO(cost)` markers.
2. Expand the kit over the old one (CURSOR-UI-INSTRUCTIONS §1.1). Infra files: `INFRA-SPEC.md`, `CURSOR-INFRA-INSTRUCTIONS.md`, and shots `19-platforms.png`, `20-servers-devices.png`, `21-server-panel-as400.png`, `22-no-host-linked.png`, `23-aging-tile-or-report.png`.
3. Branch and commit the docs:

```powershell
cd D:\Users\hminhas\WebstormProjects\minEA
git status                                  # clean
git checkout -b feat/infra-split-v1
git add docs/design
git commit -m "docs: infra split spec v1, Cursor infra instructions, shots 19-23"
```

4. Mockup routes: `#/model/platforms`, `#/model/servers`, `#/model/servers?status=attention`, `#/model/servers/as400`, `#/model/platforms/m365`, `#/model/applications/labels?host=pick` (the picker open), `#/model/overview`. Old `#/model/infrastructure[/id]` redirects. The quick-add row at the bottom of Servers & devices works (it adds to the page only).

### 1.2 How to run each prompt

Same as CURSOR-UI-INSTRUCTIONS §1.2:
1. Open a **new Cursor Agent chat per prompt** and attach the named shots.
2. Mention `@docs/design/DISCOVERY.md` and `@docs/design/INFRA-SPEC.md`, then paste the prompt.
3. Review the diff.
4. Check `localhost:3001` at **1280×800 and 1440×900** with `infra.split.v1` **on and off**.
5. Walk the acceptance list and §3, then commit:

```powershell
git add -A
git commit -m "infra.split.v1: I2 status module"   # change per phase
```

I1 shows a **plan and waits for your OK**. I1b (backfill) only runs when you ask, dry run first.

### 1.3 Phase list

| # | Prompt | Shots | Touches data? |
|---|---|---|---|
| I0 | Discovery: type names, existing platform/runtime keys, `compute_runtime_kind` values, relationship storage, nav/route files, catalog label logic → DISCOVERY §17 | none | No (read-only) |
| I1 | Plan (wait for OK) → `infraConfig.ts`, zod schemas on the write path, flag, the `compute_runtime_kind` map | none | No |
| I1b | *Optional, on request:* backfill `runtime_kind` (and `platform_kind`) from existing keys, dry run first | none | Yes, when you run it |
| I2 | `lib/infra/status.ts` + tests + the Infra eval fixture | none | Fixture only |
| I3 | Nav split, routes + redirects, Platforms & cloud and Servers & devices tables, chips, 1280 width | 19, 20 | No |
| I4 | Runtime panel (Supplier vs Provider, Runs on it, Impact if down) + platform panel (Built on it, shared cost) | 21 | Field edits only |
| I5 | "No host linked" + host picker → `runs_on` via the existing relationship API | 22 | Creates edges |
| I6 | Quick-add row (name + kind → runtime stub) | 20 | Creates objects |
| I7 | Overview "Aging infrastructure" tile, Aging report, Ask `aging` intent | 23 | No |

---

## 2. The prompts

### Prompt I0: Infra discovery (read-only)

Attach: `refs/runtimes-list.png` and `refs/runtime-detail.png` if you have them. Mention `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`.

```text
You are working in the minEA / BuboMap repo (Windows, PowerShell, dev server on localhost:3001).
This task is READ-ONLY. Do not change, create or delete code, config, data or dependencies.
The only file you may edit is docs/design/DISCOVERY.md, by APPENDING section 17.

Context: we're splitting the single Infrastructure list into "Platforms & cloud" (platform
type) and "Servers & devices" (runtime type) behind the flag infra.split.v1
(docs/design/INFRA-SPEC.md). The repo owner told us how data is stored (INFRA-SPEC §0).
Confirm each fact in the code with file paths and line numbers, and correct it where the
code says otherwise. Don't guess; write "Not found" and where you looked.

Append "## 17. Infrastructure split facts (infra.split.v1)":

17.1 Type names: the exact type identifiers for platform, runtime, application, solution
     (and components, if they can run on a runtime). How the type is stored on an object.
     The properties write path(s) for these types (the same hook cost_lines uses, if §16
     exists) and where server-side validation can be added.
17.2 Existing properties keys on PLATFORM and RUNTIME objects: list EVERY key seen in the
     type definitions, forms, seed/fixtures and code (rg "properties\.", "properties\[",
     form field configs). For each: type, enum values, where it's edited and displayed.
     Specifically look for anything that already means: kind, location/site/region, OS name,
     OS version, warranty/support end, end of life/retirement date, serial/model.
     Then a table mapping INFRA-SPEC §4.1/§4.2 keys -> "reuse <existing key>" or "new".
17.3 compute_runtime_kind: where it's defined, every allowed value with its label (e.g.
     "On-prem / bare metal"), counts per value in seed/fixtures, and a proposed mapping to
     runtime_kind (INFRA-SPEC §4.1). Same for platform hosting_model values -> platform_kind.
17.4 Vendor and provider: platform vendor short-code list and code -> display name mapping
     (path); vendor_product; runtime vendor vs runtime_provider (labels used today, e.g.
     "Provider: On-premise"); cost_model values (capex label "Capital asset (depreciated)");
     commitment_ends format.
17.5 Relationships: where runs_on and built_on edges live (table/columns or a properties
     key), direction, the API/function that creates an edge (path, auth, History), how to
     list "sources pointing at X" and "targets of Y" in one query, duplicates possible?,
     allowed source/target types. Where relationshipImpactRules (or equivalent) lives, and
     whether components deployed to runtimes use runs_on.
17.6 Catalog labels: the exact function/file that turns hosting_model + compute_runtime_kind
     into "On-prem server / SaaS platform / Cloud" (and the Infrastructure type chips from
     P2). Who calls it.
17.7 Nav and routes: the file(s) for the "Your estate" nav built in P2, the Infrastructure
     list page, its detail route, the unified read model (source discriminator), legacy
     redirects (/repository/platforms, /repository/runtimes) and where redirects are
     defined. The Overview page and its KPI cards. The Reports grid and report registry.
17.8 Panel: the detail panel component, the per-type section layout, the existing "Depends
     on this" list and whether it already uses the shared impact builder from
     CURSOR-ASK-FIXES A (path).
17.9 Create path: how a new platform/runtime is created today (API/server action, required
     fields, permissions, default values), so quick-add can create a stub with name + kind.
17.10 Ask: apps/web/lib/ask/answerStrategies.ts (exists? intents present? the aging slot?),
     the /ai/ask loop (language, where it loads strategyPrompt, the generated JSON artifact
     if any), the tool/handler that returns records for list intents.
17.11 Flags: the flag helper and how infra.split.v1 is added (confirm there is no ask.llm.v1).
17.12 Width: the Infrastructure table at 1280x800 and 1440x900 today: columns, widths,
     does it or the top bar overflow?
17.13 Tests: runner, where unit tests live, fixtures/seeds (is there a Cost eval workspace
     yet?), date mocking helper.
17.14 Conflicts with INFRA-SPEC and your recommended adaptation; the decisions I1 must make
     (keys to reuse vs add, the compute_runtime_kind map, where infraConfig.ts lives, the
     validation hook, the flag).

Finish with a 10-line summary in the chat. Change no code.
```

**Check:** `git status` shows only `DISCOVERY.md`. Read §17.2 and §17.3 carefully. They decide which keys are new. Fix anything wrong by hand. Commit `infra.split.v1: I0 discovery`.

---

### Prompt I1: Config + properties schema plan, then skeleton

Attach: nothing. Mention `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`.

```text
Read docs/design/DISCOVERY.md §17 and docs/design/INFRA-SPEC.md §0-§4.

GOAL
One config file and server-side validation for the new properties keys. No new tables, no
structural migrations, no UI, no data changes.

1. FIRST show me a plan and WAIT for my OK:
   a. For every key in INFRA-SPEC §4.1/§4.2: reuse <existing key> or add <new key>, from
      DISCOVERY §17.2. Never add a key that duplicates an existing one.
   b. lib/infra/infraConfig.ts at the repo's path convention (e.g. apps/web/lib/infra/),
      shaped like relationshipImpactRules (DISCOVERY §17.5): runtimeKinds, locations,
      platformKinds, platformHostingLabels, status.endsSoonDays, eolOs (with a source URL
      comment per entry), noHostLinked {types, hostingModels, edgeKinds}, hostEdgeKinds,
      using the REAL type ids and hosting_model values.
   c. computeRuntimeKindMap from DISCOVERY §17.3 (every real value -> runtime_kind or null)
      and the platform_kind inference from hosting_model (INFRA-SPEC §4.2, read-only).
   d. lib/infra/schema.ts: zod schemas (INFRA-SPEC §4.5 rules and messages), applied in
      the existing properties write path for platform and runtime objects only.
   e. The flag infra.split.v1 with the existing flag helper, default off.
   f. lib/infra/read.ts: readRuntimeInfra(obj) / readPlatformInfra(obj) that return the
      normalized view (kind via runtime_kind ?? map(compute_runtime_kind), location, os,
      dates, vendor display, provider) so no component reads raw keys.
   g. Anything you'd do differently from INFRA-SPEC and why.
2. After OK: add infraConfig.ts, schema.ts, read.ts, the flag and the validation hook.
   Stub status.ts with TODO(I2).
3. Tests: INFRA-SPEC T7 (map) and T8 (zod).

ACCEPTANCE
- No new table, column or migration file in the diff.
- Typecheck, lint and existing tests pass; new tests pass.
- Writing runtime_kind "mainframe" is rejected server-side with "Pick a kind from the list."
- Flag off: nothing visible changes.

DO NOT
- Write any properties on existing objects (that's I1b, on request).
- Change the catalog label function (DISCOVERY §17.6); it keeps working as today.
- Add a package without asking (zod is assumed present; if not, stop and ask).
```

**Check:** compare 1a against DISCOVERY §17.2 before saying OK. Commit `infra.split.v1: I1 config + schema`.

---

### Prompt I1b (optional, only when you want it): Backfill runtime_kind / platform_kind

Attach: nothing. Mention `@docs/design/INFRA-SPEC.md` (§4.1, §4.2), `@docs/design/DISCOVERY.md` (§17.3).

```text
Add npm run infra:backfill-kinds with --workspace <id> and --dry-run.
For each runtime WITHOUT runtime_kind whose compute_runtime_kind maps (infraConfig
computeRuntimeKindMap), set properties.runtime_kind; for each platform WITHOUT platform_kind
whose hosting_model infers one (saas -> saas_suite, paas -> paas, self_hosted -> self_hosted),
set platform_kind. Write through the existing properties write path (zod runs), History
actor "BuboMap backfill". Skip unmapped values and objects that already have the key.
Idempotent. Write backfill-report-infra.md: counts per value, the skipped list with reasons,
and status counts before/after (must be equal, since reads already use the map).
First show me the dry run output for my LOCAL database; do not run it for real until I say so.
Test: running twice changes nothing.

DO NOT run it against anything but my local database, or wire it into startup/CI.
DO NOT touch compute_runtime_kind or hosting_model.
```

**Check:** read the dry-run report. The status counts before and after must match. Commit `infra.split.v1: I1b kind backfill script`.

---

### Prompt I2: Status module, tests, Infra eval fixture

Attach: nothing. Mention `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`.

```text
Read INFRA-SPEC.md §5, §8, §9.

GOAL
lib/infra/status.ts is the ONLY place that decides support status.

1. infraStatus(obj, today, cfg?) and infraStatusMany(objs, today) exactly per §5: rules in
   order (out_of_support -> unsupported_os -> ends_soon -> ok -> unknown), the result
   shape (status, severity, label, daysLeft, effectiveDate, dateSource, osMatch, reason),
   OS matching case-insensitive and whitespace-collapsed, `prefix` entries, managed kinds.
   today is passed in (never new Date() inside); days are whole calendar days in the
   workspace timezone.
2. agingSummary(workspaceId, today): counts + items sorted bad first, then warn by daysLeft,
   one query for the runtimes.
3. lib/infra/hosts.ts: dependentsCount(ids[]) and dependents(id) over hostEdgeKinds
   (distinct sources, one query for a page of ids), hostsOf(id), noHostLinked(obj, hosts)
   from infraConfig.noHostLinked. Reuse the relationship query helpers from DISCOVERY §17.5.
4. Fixture: seed "Meridian Fasteners / Infra eval" = Cost eval (if it exists, else the base
   Meridian fixture + COST-SPEC §9) + INFRA-SPEC §8 (map types to the real ones; firewall as
   a runtime network_device). Command e.g. npm run seed:meridian -- --with-infra.
   Base Meridian and Cost eval workspaces are unchanged.
5. Tests: INFRA-SPEC T1-T6, T9, T10, T14 (grep test), T16 (cost parity if lib/cost exists).

ACCEPTANCE
- All tests pass. At TODAY 2026-09-25: out_of_support 2, unsupported_os 2, ends_soon 2
  (66 and 46 days), ok 4, unknown 0; agingSummary 4 / 2.
- AS400 reason "IBM i 7.3 standard support ended Sep 30, 2023"; FS01 effectiveDate
  2023-10-10 with dateSource "os".
- Runs: AS400 3, SQL01 1; Built on it: Microsoft 365 tenant 4, AWS account 4.
- noHostLinked: Shop Floor Label Printing only.

DO NOT
- Compare support dates anywhere else (T14 enforces it).
- Use hosting_model except inside noHostLinked.
- Change the base Meridian or Cost eval fixtures, or G01-G44.
```

**Check:** run the tests and open the Infra eval workspace with the flag off. Nothing should look different. Commit `infra.split.v1: I2 status module + fixture`.

---

### Prompt I3: Nav split, routes, both tables, 1280 width

Attach: `19-platforms.png`, `20-servers-devices.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`.

```text
Read INFRA-SPEC.md §3, §6.1-§6.3 and, in the mockup, ESTATE, viewPlatforms, viewServers,
rtStatus/stBadge (rendering only), RT_FILTERS and the CSS table.t.fixed .el .dash .vcode
.st .st-ok .st-warn .st-bad .st-none .dt-bad .dt-warn .runs. Match shots 19 and 20.

GOAL
Behind infra.split.v1:

1. Nav "Your estate": Overview, Applications, Platforms & cloud {n}, Servers & devices {n},
   Connections, Vendors & contracts, Owners & teams. Remove the single Infrastructure item.
   Architecture group unchanged. "Model {pct}% complete" unchanged in meaning.
2. Routes {base}/platforms[/id], {base}/servers[/id][?status=] and the redirects in
   INFRA-SPEC §3.2 (by type, server-side, query strings kept), in the redirect location
   from DISCOVERY §17.7. Retarget the P2 legacy redirects for platforms/runtimes.
3. Platforms & cloud table (§6.1): columns, Vendor display name + mono code sub-line, Kind,
   Hosting pill, Owner (amber + Add), Built on it (count + "{a} apps · {s} servers"),
   Annual cost via the cost module cell (COST-SPEC §7.1; legacy cell + TODO(cost) if C3 is
   not done), Renewal. Only owner and cost blanks are amber; other blanks are a grey dash.
   Footer per §6.1 with portfolioTotals for the platform type.
4. Servers & devices table (§6.2): status chips with counts from ONE infraStatusMany call,
   columns per §6.2, Support ends coloured by severity, Status badge, footer counts.
   Row links keep ?status=. Sort by name, kind, owner, support date, status severity.
5. Counts from dependentsCount(ids) once per page (no per-row fetch).
6. Width (§6.3): table-layout fixed with the % columns, 2-line clamps, badges nowrap,
   top bar fits at 1280 (search 180px under 1380px). No horizontal scroll at 1280x800.
7. Reuse the P2 table component, toolbar and header; don't fork them.
8. Flag off: the single Infrastructure list and routes exactly as before.

ACCEPTANCE (Infra eval workspace, TODAY 2026-09-25)
- Nav counts Platforms & cloud 6, Servers & devices 10.
- Platforms: AWS account owner amber "+ Add", Built on it "4" / "2 apps · 2 servers",
  $18,600; Microsoft 365 tenant "microsoft · Microsoft 365", Built on it 4, $51,840 +
  "Allocated to 4 apps"; footer "Total $70,440".
- Servers: chips All 10 · Needs attention 6 · Out of support / unsupported OS 4 · Ends in
  90 days 2 · OK 4; AS400 "Sep 30, 2023" red + "Out of support"; FS01 OS red +
  "Unsupported OS"; firewall "Ends in 66 days" amber; footer "10 of 10 shown · 4 out of
  support or on an unsupported OS · 2 ending in 90 days".
- /…/infrastructure/<as400 id> lands on /…/servers/<as400 id>; ?source=platform lands on
  /…/platforms.
- 1280x800: no horizontal scroll on either table, avatar visible in the top bar.

DO NOT
- Build a union read model for the two lists, or merge types.
- Compute status or day counts in components (call lib/infra).
- Change the catalog label function or the Applications table (except its nav link).
- Add a cost column to Servers & devices.
```

**Check:** shots 19–20 side by side at 1280×800. The mockup's day counts (63/43) and $18,600 footer differ on purpose (§5). Commit `infra.split.v1: I3 nav split + tables`.

---

### Prompt I4: Runtime panel and platform panel

Attach: `21-server-panel-as400.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`, `@docs/design/CURSOR-ASK-FIXES.md`.

```text
Read INFRA-SPEC.md §6.4, §6.5 and in the mockup serverBody, builtOnSection and the CSS
.supp .who2 .wb .wl .wv .ws .impact .alsodep. Match shot 21.

GOAL
Behind infra.split.v1, in the existing detail panel:

1. Runtime panel (§6.4), in order: Server & device (Kind with icon, Location, OS & version,
   Support ends + badge + reason, End of life, Runs on {host} if any) -> Supplier and
   provider (two boxes: Supplier = vendor, Provider = runtime_provider, each with its
   helper text; blank -> "Add supplier"/"Add provider" inline edit) -> Runs on it {n} apps
   (cards from the SHARED impact builder from CURSOR-ASK-FIXES A, direct runs_on/built_on
   rows; "Also affected indirectly: …" from its indirect rows) -> "Impact if down" bar ->
   Cost (cost module section, unchanged) -> Governance.
2. "Impact if down" opens Ask with "What breaks if the {name} goes down?" and submits it,
   using the same Ask entry the global search uses.
3. Field edits (kind select, location select + detail, OS name/version, dates) save through
   the properties write path (zod from I1), write History, and re-render from the server.
4. Platform panel (§6.5): Platform (Kind, Hosting, Region) -> Vendor (display name + mono
   code, Product) -> Built on it {n} records (shared builder) -> Cost (cost module, incl.
   "Shared by {n}" host block) -> Governance.
5. Header line "Server & device · {kind}" / "Platform · {kind}", status chip on runtimes.

ACCEPTANCE (Infra eval workspace)
- AS400: Physical server; "Office · Fremont plant · server room B"; IBM i 7.3; "Sep 30,
  2023" + "Out of support" + "IBM i 7.3 standard support ended Sep 30, 2023"; Supplier IBM,
  Provider "Meridian (on-prem)"; Runs on it 3 apps (Order Entry, Inventory, EDI Gateway);
  "Also affected indirectly: Invoicing (through EDI Gateway)"; Cost $71,400/yr.
- "Impact if down" -> Ask answers "What breaks if the AS400 goes down?" with the same rows
  as the panel's Runs on it list (one builder).
- Microsoft 365 tenant: Built on it 4 records; Cost shows "Shared by 4".
- Editing the AS400's support_ends: 2027-01-10 -> "OK" (107 days, not < 90);
  2026-12-01 -> "Ends in 67 days" (amber). Then put it back.

DO NOT
- Show runtime_provider as the vendor anywhere, or merge the two boxes.
- Write a second "what depends on X" query; use the shared builder.
- Change cost maths or the Cost section.
```

**Check:** shot 21 at 1280×800 (panel open) and 1440×900. Commit `infra.split.v1: I4 panels`.

---

### Prompt I5: "No host linked" + host picker

Attach: `22-no-host-linked.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`.

```text
Read INFRA-SPEC.md §6.6 and in the mockup appHostingSection, hostPicker, hostLink and the
CSS .nohost .nh-h .nh-s .hpick .hp-s .hp-g .hp-i .sug .sugtag .hp-f. Match shot 22.

GOAL
Behind infra.split.v1:

1. Application/solution panel, Hosting section: hosting_model label "(label)"; "Runs on
   {host}" links from hostsOf(); when noHostLinked(obj) the amber box with the exact copy
   from §6.6 and "+ Add host".
2. "+ Add host" opens the inline picker: search, Suggested group (runtime names found in
   the object's note/description/hosting text, tag "Suggested · matches “{text}”"),
   Servers & devices group with kind icon, "{kind} · {location} · {detail}" and the status
   badge from infraStatusMany, collapsed "Platforms & cloud" group, footer "+ Add a new
   server or device" (goes to the quick-add row with the search text) and "Creates a
   runs-on link". Keyboard: arrows + Enter, Esc closes.
3. Picking creates runs_on (or built_on for a platform) via the EXISTING relationship API
   from DISCOVERY §17.5 (auth + History). Toast "{app} now runs on {runtime}". The panel,
   the table's "On-prem · no host linked" sub-line and host counts update from the server.
4. Make COST-SPEC's hostHint (C5) call noHostLinked from lib/infra so there is one rule. If
   C5 isn't done, leave a TODO(cost) where hostHint will call it.
5. Deep link ?host=pick opens the picker (for the shot).
6. Tests: INFRA-SPEC T10, T11.

ACCEPTANCE (Infra eval workspace)
- Shop Floor Label Printing: "No host linked" box; picker shows Plant PC (label station)
  first with "Suggested · matches “Plant PC”" and "Ends in 46 days"; picking it shows
  "Runs on Plant PC (label station)", the box disappears, Plant PC's Runs becomes 1.
- Undo by deleting the edge with the existing relationship UI; the box returns.
- An application with hosting_model cloud and no edge shows no box.

DO NOT
- Write hosting_model, or infer a host automatically.
- Create edges any way except the existing relationship API.
- Show the box on platforms or runtimes.
```

**Check:** shot 22 with the panel scrolled to Hosting. Commit `infra.split.v1: I5 no host linked + picker`.

---

### Prompt I6: Quick-add row

Attach: `20-servers-devices.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`.

```text
Read INFRA-SPEC.md §6.2 (quick-add) and in the mockup the qa-row markup, qaSave and the CSS
tr.qa-row .qa. Match the last row of shot 20.

GOAL
Behind infra.split.v1, for users allowed to create objects:

1. Last row of the Servers & devices table: "+", input "Add a server or device, e.g. ESX01
   VMware host", Kind select (runtime kinds, default Physical server), Save, hint "Only a
   name and kind are needed. Fill in the rest later."
2. Enter/Save creates a runtime via the existing create path (DISCOVERY §17.9) with name +
   properties.runtime_kind only (zod validated), History entry. The table and nav count
   re-render from the server; the new row shows dashes, owner amber "+ Add", status
   "Not set". Toast "Added {name} ({kind}). Open it to fill in the rest."
3. Empty name: inline "Type a name first". Duplicate name: saved, hint "There's already a
   “{name}”. Saved anyway."
4. ?add=<text> prefills the input (used by the picker footer in I5).
5. Test: INFRA-SPEC T12.

ACCEPTANCE
- Adding "ESX01 VMware host" / Physical server: 11 rows, nav 11, chips "All 11", status
  "Not set", nothing else set on the object.

DO NOT
- Require any field besides name and kind.
- Add a quick-add row to Platforms & cloud (v1).
```

**Check:** add a stub, open it, fill Location and OS, and watch the status change. Delete it with the existing UI. Commit `infra.split.v1: I6 quick-add`.

---

### Prompt I7: Overview tile, Aging report, Ask "aging" intent

Attach: `23-aging-tile-or-report.png`. Mention `@docs/design/bubomap-ui.html`, `@docs/design/DISCOVERY.md`, `@docs/design/INFRA-SPEC.md`, `@docs/design/CURSOR-ASK-FIXES.md`, `@docs/design/ASK-GROUNDING-SPEC.md`.

```text
Read INFRA-SPEC.md §6.7 and §7, CURSOR-ASK-FIXES.md section B, and in the mockup agingTile
and the CSS .aging .ai .an .ait .go2 .kpis.k5. Match shot 23.

GOAL
Behind infra.split.v1:

1. Overview: five KPI cards (Applications, Platforms & cloud "{k} in pilot", Servers &
   devices "{k} critical", Annual spend, Missing fields) and the Aging infrastructure tile
   from agingSummary(): "{x} items out of support or on an unsupported OS · {y} ending in
   90 days", item chips (bad first), "Review in Servers & devices →" to
   {base}/servers?status=attention. Hidden when x = y = 0.
2. Reports: card "Aging infrastructure" (Risk) and its detail page grouped by status with
   columns Name, Kind, OS & version, Support ends, Runs, Owner, Reason; rows open the panel;
   CSV export. Uses agingSummary only.
3. Ask: add intent "aging" to apps/web/lib/ask/answerStrategies.ts (CURSOR-ASK-FIXES B):
   triggers per INFRA-SPEC §7; a handler/tool infra_status that returns agingSummary items
   with object ids; answer = verdict line + grouped table + reason bullets + gaps ("{n}
   servers & devices have no support date"); every row cited; numbers registered for the
   validator. Regenerate the strategy JSON artifact (npm run ask:strategies or the script
   B added) so the /ai/ask loop sees the intent; the staleness test must pass.
4. Impact answers add the gap "No host linked for {name}: hosting says {label} but no
   runs-on link" using noHostLinked.
5. Tests: INFRA-SPEC T15; Ask routing cases "what's out of support?", "which servers are
   end of life", "is the AS400 supported?" (single-item).

ACCEPTANCE (Infra eval workspace, TODAY 2026-09-25)
- Tile: "4 items out of support or on an unsupported OS · 2 ending in 90 days"; link opens
  Servers & devices with "Needs attention" selected (6 rows).
- Report: 2 Out of support, 2 Unsupported OS, 2 Ends in 90 days; CSV 6 rows.
- Ask "What's out of support?" -> 4 + 2, each row cited to its object; no number that
  isn't from infra_status.

DO NOT
- Compute status in the report, the tile or Ask (call lib/infra/status.ts).
- Put raw support dates in the prompt for the model to compare.
- Add a new Ask flag (there is no ask.llm.v1).
```

**Check:** shot 23 at 1280×800. Ask the three questions in the UI. Commit `infra.split.v1: I7 aging tile + report + ask`.

---

## 3. Fidelity checklist (infra)

Mockup and app side by side at **1280×800** (and 1440×900), Infra eval workspace, `infra.split.v1` on. The mockup TODAY is 2026-09-28 and the eval TODAY is 2026-09-25, so the day counts differ by 3.

**19 Platforms & cloud** (`#/model/platforms`)
- [ ] Nav: Overview, Applications, Platforms & cloud, Servers & devices, Connections, Vendors & contracts, Owners & teams; no Infrastructure item; Architecture unchanged
- [ ] Eyebrow `Suites and clouds you build on`; columns Name, Vendor (display name + mono code sub-line), Kind, Hosting pill, Owner, Built on it, Annual cost (US$), Renewal
- [ ] Amber `+ Add` only for owner (AWS account) and cost; other blanks are a grey dash
- [ ] `Built on it` "2 apps · 2 servers" on AWS; `within 90 days` under Oct 31, 2026
- [ ] Footer `… amber = missing owner or cost · a dash means not set` + Total (product $70,440; mockup $18,600)

**20 Servers & devices** (`#/model/servers`)
- [ ] Eyebrow `Where things run`; chips All / Needs attention / Out of support / unsupported OS / Ends in 90 days / OK with counts
- [ ] Kind icons for all 7 kinds; Location two lines; OS red when unsupported; Support ends red/amber; badges never wrap
- [ ] Quick-add row with `Only a name and kind are needed. Fill in the rest later.`
- [ ] Footer `10 of 10 shown · 4 out of support or on an unsupported OS · 2 ending in 90 days`
- [ ] No horizontal scroll at 1280×800; avatar visible

**21 Runtime panel** (`#/model/servers/as400`)
- [ ] Header `Server & device · Physical server` + chips (kind, Out of support, Active, Critical)
- [ ] Server & device section incl. reason line and End of life
- [ ] Supplier box (IBM) and Provider box (Meridian (on-prem)) separate, with helper text
- [ ] Runs on it: 3 apps + `Also affected indirectly: Invoicing (through EDI Gateway)`
- [ ] Impact if down bar → Ask prefilled and submitted
- [ ] Cost section unchanged ($71,400/yr)

**22 No host linked** (`#/model/applications/labels?host=pick`)
- [ ] Table sub-line `On-prem · no host linked`; header chip the same
- [ ] Amber box: `No host linked` + `+ Add host`; text with `Your note says "Plant PC".`
- [ ] Picker: search, Suggested (Plant PC, tag), Servers & devices with badges, footer `+ Add a new server or device` / `Creates a runs-on link`

**23 Aging tile** (`#/model/overview`)
- [ ] 5 KPI cards; tile `AGING INFRASTRUCTURE`, `4 items out of support or on an unsupported OS · 2 ending in 90 days`, 6 chips (4 red, 2 amber), `Review in Servers & devices →`
- [ ] Reports: `Aging infrastructure` card + detail page (no mockup shot; follow INFRA-SPEC §6.7)

---

## 4. If Cursor drifts (infra)

General prompts in CURSOR-UI-INSTRUCTIONS §5 still apply.

**It wants a table, column or migration**
```text
Stop. No new tables or migrations. The new facts are keys in objects.properties for the
platform and runtime types (INFRA-SPEC §4), validated by lib/infra/schema.ts in the existing
properties write path. Revert the table/column/migration and use DISCOVERY §17.1.
```

**It added a key that already exists**
```text
DISCOVERY §17.2 lists the existing keys. Reuse them (map them in infraConfig/read.ts) and
remove the duplicate key. Show me the reuse/new table again.
```

**It computed status in a component, report or Ask**
```text
Only lib/infra/status.ts compares support dates. Replace your date logic with
infraStatus / infraStatusMany / agingSummary and run the grep test (INFRA-SPEC T14).
```

**It used hosting_model to decide where something runs**
```text
hosting_model is a label. "Runs", "Built on it", "Runs on it", impact and cost shares come
only from runs_on / built_on edges. The only use of hosting_model is noHostLinked().
Remove every other use.
```

**It merged Platforms and Servers back into one list (or a union read model)**
```text
Two lists, two types: Platforms & cloud = platform, Servers & devices = runtime, each with
its own columns (INFRA-SPEC §6.1, §6.2). Remove the union and the type chips.
```

**It showed runtime_provider as the vendor**
```text
Supplier = properties.vendor; Provider = properties.runtime_provider. They're separate
boxes in the panel, and only vendor feeds vendor spend (COST-SPEC T18). Fix the mapping.
```

**It created edges or objects its own way**
```text
Edges go through the existing relationship API (DISCOVERY §17.5) and objects through the
existing create path (§17.9), so auth and History apply. Delete the custom write.
```

**It wrote kinds onto every object**
```text
Objects nobody edited must not change. runtime_kind is read through the
compute_runtime_kind map; writing it in bulk is the opt-in I1b backfill. Revert.
```

**It broke the width at 1280**
```text
At 1280x800 neither table nor the top bar may scroll horizontally (INFRA-SPEC §6.3): fixed
layout, the % columns, 2-line clamps, nowrap badges, search 180px under 1380px. Fix and
show me a 1280 screenshot.
```

**It hard-coded Meridian data**
```text
AS400, Plant PC, 63/66 days, $70,440 and the other INFRA-SPEC §8 values belong in fixtures
and tests only. Replace them with values from lib/infra and lib/cost.
```

---

## 5. Notes

- **Mockup vs product.** The mockup TODAY is 2026-09-28, so the firewall and Plant PC badges read 63 and 43 days; the eval says 66 and 46. The mockup's Platforms footer is $18,600 because it attributes the M365 E3 line to apps; the product shows $70,440. The mockup's text cost cells for pilot/trial platforms become the cost module's blank state (INFRA-SPEC Q1). Old `#/model/infrastructure` routes redirect in the mockup too.
- Shots 05, 06, 14 and 15 were retaken with the new nav (05/06 now show Servers & devices and the AS400 runtime panel). The other older shots still show the single Infrastructure item in the sidebar. Ignore that.
- The mockup has no Aging report detail page and no platform group in the host picker. Build them from INFRA-SPEC §6.6–§6.7.
- New copy not in the mockup is marked *(new)* in INFRA-SPEC. Open questions: INFRA-SPEC §11.
