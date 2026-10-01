# BuboMap UI: Cursor build instructions

Paste these prompts into Cursor, one at a time, so the BuboMap app in `D:\Users\hminhas\WebstormProjects\minEA` ends up looking and behaving like the mockup `docs/design/bubomap-ui.html`.

The mockup decides the UI: layout, colors, copy, and states. `docs/design/REPOSITORY-MVP-SPEC.md` decides data rules: the six shared fields, the migration, vendor normalization, and money rules. `docs/design/ASK-GROUNDING-SPEC.md` decides how the LLM-backed Ask (P7) is grounded: tools, prompt, validation, security, and the eval set. Where they disagree, this file says which one wins.

Everything ships behind the workspace feature flag `repository.mvp.v1`. With the flag off, the app must look and behave exactly as it does today. The LLM-backed Ask has its own flag, `ask.llm.v1`, which is off by default.

> **Correction (Sep 30, 2026): there is no `ask.llm.v1` flag in minEA.** The model path is the existing `/ai/ask` loop (possibly Python). It loads `strategyPrompt` from `apps/web/lib/ask/answerStrategies.ts`, through a generated JSON artifact if needed. Wherever this kit says "`ask.llm.v1` on/off", read "the `/ai/ask` path vs the deterministic path". Today's Ask fixes are in `CURSOR-ASK-FIXES.md`.

> **Update (Sep 30, 2026): Infrastructure is now two lists.** With `infra.split.v1`, the single Infrastructure item is replaced by **Platforms & cloud** (platform type) and **Servers & devices** (runtime type), and old Infrastructure routes redirect. Spec: `INFRA-SPEC.md`. Prompts: `CURSOR-INFRA-INSTRUCTIONS.md` (I0–I7). Shots: 19–23. Where this file describes the single Infrastructure page, its type chips or the unified read model, INFRA-SPEC wins once that flag is on.

Run order for the whole kit: `docs/design/README.md`.

---

## 1. How to use this

### 1.1 Put the kit in the repo

Download `bubomap-cursor-kit.zip` to your Downloads folder, then in PowerShell:

```powershell
cd D:\Users\hminhas\WebstormProjects\minEA
git status                      # should be clean before you start
git checkout -b ui/repository-mvp-v1
Expand-Archive -Path "$HOME\Downloads\bubomap-cursor-kit.zip" -DestinationPath . -Force
Get-ChildItem -Recurse docs\design | Select-Object FullName
```

If your Downloads folder is somewhere else (for example `D:\Users\hminhas\Downloads`), change the `-Path`. You should now have:

```
docs/design/CURSOR-UI-INSTRUCTIONS.md   (this file)
docs/design/REPOSITORY-MVP-SPEC.md
docs/design/ASK-GROUNDING-SPEC.md       (P7: grounded LLM Ask, tools, validation, eval set; §10 cost questions)
docs/design/COST-SPEC.md                (cost lines in properties.cost_lines, infrastructure share; flag cost.lines.v1)
docs/design/CURSOR-COST-INSTRUCTIONS.md (prompts C0-C6b + optional C2b for cost, run after this file's P3)
docs/design/CURSOR-ASK-FIXES.md        (prompts A + B: impact answer table, answerStrategies.ts; run before cost)
docs/design/INFRA-SPEC.md               (Platforms & cloud + Servers & devices split; flag infra.split.v1)
docs/design/CURSOR-INFRA-INSTRUCTIONS.md (prompts I0-I7 + optional I1b, run after cost)
docs/design/README.md                   (run order, one line per doc)
docs/design/bubomap-ui.html             (the mockup: one file, inline CSS and JS)
docs/design/shots/01-ask-home.png
docs/design/shots/02-ask-answer.png
docs/design/shots/03-reports.png
docs/design/shots/04-report-detail.png
docs/design/shots/05-model-table.png
docs/design/shots/06-model-detail.png
docs/design/shots/07-app-components.png
docs/design/shots/08-component-detail.png
docs/design/shots/09-ask-home-centered.png
docs/design/shots/10-ask-loading.png
docs/design/shots/11-ask-answer-gaps.png
docs/design/shots/12-ask-answer-impact.png
docs/design/shots/13-ask-answer-spend.png
docs/design/shots/14-cost-table.png
docs/design/shots/15-cost-panel-onprem.png
docs/design/shots/16-cost-panel-shared-saas.png
docs/design/shots/17-cost-add-line.png
docs/design/shots/18-spend-report.png
docs/design/shots/19-platforms.png
docs/design/shots/20-servers-devices.png
docs/design/shots/21-server-panel-as400.png
docs/design/shots/22-no-host-linked.png
docs/design/shots/23-aging-tile-or-report.png
```

Commit the design files by themselves so later diffs only show code:

```powershell
git add docs/design
git commit -m "docs: add BuboMap UI mockup, screenshots, and Cursor instructions"
```

To look at the mockup yourself, open it in a browser (`start docs\design\bubomap-ui.html`). It uses hash routes: `#/ask`, `#/ask/answer?q=...`, `#/reports`, `#/reports/spend`, `#/model/platforms`, `#/model/servers`, `#/model/servers/as400`, `#/model/applications`, `#/model/applications/order-entry` (Components section at the bottom of the panel), `#/model/applications/order-entry/components/oe-api` (a component's own detail view), `#/model/overview`, `#/model/capabilities`, `#/model/data/domains` (an empty section), `#/views`. The legacy routes `#/model/products` and `#/model/components` redirect (to Roadmaps and Applications). All its data is made up (Meridian Fasteners). The real app must use real data.

### 1.2 How to run each prompt

1. Open a **new Cursor Agent chat** for each prompt. Don't reuse a chat between phases.
2. Attach the screenshot named in the prompt (drag the PNG from `docs/design/shots/` into the chat). Mention `@docs/design/bubomap-ui.html` and `@docs/design/DISCOVERY.md` too, so Cursor reads them. For 7a, 7b, and 7c, also mention `@docs/design/ASK-GROUNDING-SPEC.md`.
3. Paste the prompt from its code block exactly as written.
4. When Cursor finishes, **review the diff** file by file. Reject anything outside the phase's scope.
5. Run the app as you normally do and check `http://localhost:3001` with the flag **on** and **off**. For P7, also check `ask.llm.v1` on and off, and run `npm run ask:eval -- --provider=fake` after 7c.
6. Walk the phase's acceptance criteria and the matching part of the Fidelity checklist (section 4).
7. Commit before you start the next prompt:

```powershell
git add -A
git commit -m "repository.mvp.v1: P1 app shell"   # change the message per phase
```

If a phase goes badly wrong: `git restore .` and `git clean -fd` throw away the uncommitted work (this deletes new files too), and you can start that phase again in a fresh chat.

### 1.3 Phase list

| # | Prompt | Screenshot to attach | Changes schema? |
|---|---|---|---|
| 0 | Discovery (read-only) | none | No |
| 1 | Design tokens + app shell + routes | 01, 05 | No |
| 2 | Model section: nav ("Your estate" + "Architecture"), table, cards, legacy redirects | 05 | No |
| 3 | Detail side panel + Components section and component detail | 06, 07, 08 | No |
| 4 | Schema additions + migration | 06 | **Yes** (only gaps from discovery) |
| 5 | Reports grid + Spend by vendor | 03, 04 | No |
| 6 | Ask UI + deterministic answer service | 01, 02 | No |
| 7a | Grounded Ask: query tools + metamodel prompt + dev fixture (no LLM yet) | none | No |
| 7b | Grounded Ask: provider wrapper, orchestration loop, validation, UI wiring | 02 | Only if you approve an audit table |
| 7c | Grounded Ask: golden eval set + test runner | none | No |

**Cost (C0–C6b):** cost lines and the infrastructure share for Applications and Infrastructure are a separate prompt set in `docs/design/CURSOR-COST-INSTRUCTIONS.md` (flag `cost.lines.v1`, spec `COST-SPEC.md` v2, shots 14–18). Cost lives in `objects.properties` (`cost_lines`, with `annual_cost` written back), so there are no cost tables. Run C0–C5 after P3 (P4 isn't needed for cost), C6a after P5, C6b after P7c. C2b (backfill) only on request.

**Ask fixes (A, B):** `docs/design/CURSOR-ASK-FIXES.md`, run after P7 and before cost. **Infra (I0–I7):** `docs/design/CURSOR-INFRA-INSTRUCTIONS.md` (flag `infra.split.v1`, spec `INFRA-SPEC.md`, shots 19–23) splits Infrastructure into Platforms & cloud and Servers & devices. Run it after cost.

P7 is a full phase now, not an optional add-on. Run 7a, 7b, and 7c in order, each in a new chat, and mention `@docs/design/ASK-GROUNDING-SPEC.md` every time. 7a and 7c add no model provider, and 7b asks you to pick one before it adds an SDK. The LLM path stays behind `ask.llm.v1` (off by default) until the 7c eval passes.

---

## 2. Design tokens (from the mockup CSS)

Every build prompt points Cursor back to this section. These are the `:root` variables from `bubomap-ui.html`:

| Token | Hex | Used for |
|---|---|---|
| `--nav` | `#0f172a` | Top bar background, dark text |
| `--nav2` | `#111827` | Left sidebar background |
| `--navline` | `#1e293b` | Sidebar dividers |
| `--navtext` | `#cbd5e1` | Sidebar item text |
| `--navmuted` | `#64748b` | Sidebar header, counts |
| `--accent` | `#5b4ce6` | Active tab, active nav item, primary buttons, citations |
| `--accent-600` | `#4c3fd1` | Primary hover, accent text on light backgrounds |
| `--accent-50` | `#f1efff` | Selected row, chip hover, light accent fill |
| `--accent-100` | `#e4e0ff` | Citation badge background |
| `--text` | `#0f172a` | Main text |
| `--text2` | `#334155` | Secondary text, table cells |
| `--muted` | `#64748b` | Labels, table headers |
| `--faint` | `#94a3b8` | Captions, icons |
| `--line` | `#e5e7eb` | Borders |
| `--line2` | `#f1f5f9` | Row dividers |
| `--bg` | `#ffffff` | Page |
| `--bg2` | `#f8fafc` | Table header, footers |
| `--amber-bg` | `#fff8eb` | Blank cells, Gaps box, "Add" prompts |
| `--amber-line` | `#fde7b8` | Amber borders |
| `--amber-text` | `#b45309` | "Add" text, "{n} missing" |
| `--radius` | `12px` | Cards, table wrapper |
| `--font` | `Inter, "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif` | Everything, base size 14px, line-height 1.45 |

**Pills** (12px, weight 600, padding 2px 9px, fully rounded):

| Value | Background | Text |
|---|---|---|
| Pilot | `#e0f2fe` | `#0369a1` |
| Active | `#dcfce7` | `#15803d` |
| Retiring | `#ffedd5` | `#c2410c` |
| End of life | `#fee2e2` | `#b91c1c` |
| Critical | `#fee2e2` | `#b91c1c` |
| High | `#ffedd5` | `#c2410c` |
| Medium | `#fef9c3` | `#a16207` |
| Low | `#dcfce7` | `#15803d` |
| Neutral / other (Planned, hosted-where chip, "indirect") | `#f1f5f9` | `#475569` |
| Accent ("Re-runs on open") | `#f1efff` | `#4c3fd1` |

**Other fixed values:** top bar 56px tall; sidebar 232px; logo 28px square, radius 7px, gradient `#f97316` → `#ea580c`; top-bar border `#020617`; hover/border accent `#c7c2fb`; table header 44px, rows 46px, cell font 13px, header font 12px; buttons 34px tall (small 28px), radius 8px; detail panel 470px wide; scrim `rgba(15,23,42,.28)`; focus ring `0 0 0 3px rgba(91,76,230,.35)` on dark, `rgba(91,76,230,.12)` on light. Amber strong text in boxes: `#92400e` (title) and `#78350f` (body); amber icon `#d97706`.

**Report card icon colors** (icon color on background): Renewals `#5b4ce6` on `#f1efff`; Spend `#0f766e` on `#ccfbf1`; Impact `#c2410c` on `#ffedd5`; End of life `#b45309` on `#fef3c7`; Ownership gaps `#be185d` on `#fce7f3`; Sensitive data `#1d4ed8` on `#dbeafe`; Single points of failure `#b91c1c` on `#fee2e2`; Tech debt `#475569` on `#f1f5f9`.

**Icons:** the mockup draws Lucide-style 24×24 stroke icons from the `I` object in its first `<script>`. Use the icon set the app already has if its icons are close; otherwise copy those SVG paths into one small `Icon` component. Don't add an icon package without asking.

---

## 3. The prompts

### Prompt 0: Discovery (read-only)

Attach: nothing. Mention `@docs/design/bubomap-ui.html` and `@docs/design/REPOSITORY-MVP-SPEC.md`.

```text
You are working in the BuboMap Next.js repo (Windows, PowerShell, dev server on localhost:3001).
This task is READ-ONLY. Do not change, create, or delete any code, config, or dependency.
The only file you may create is docs/design/DISCOVERY.md.

Context: we are going to rebuild the UI to match docs/design/bubomap-ui.html (a static
HTML mockup with inline CSS/JS and made-up data) behind the feature flag repository.mvp.v1.
Data rules are in docs/design/REPOSITORY-MVP-SPEC.md. Before anyone writes code, I need
facts about this codebase. Do not guess. If you can't find something, write "Not found"
and list where you looked.

Inspect the repo and write docs/design/DISCOVERY.md with these sections:

1. Stack: Next.js version, React version, TypeScript or not, package manager, the dev script and port (confirm 3001), test and lint commands, Node version if pinned.
2. Routing: App Router (app/) or Pages Router (pages/) or both. List every route that serves the current Repository and Views UI, including detail routes with ids and any query params they use. Note where redirects live today (next.config redirects(), middleware, or none).
3. Styling: Tailwind (version, config path, theme extensions), CSS Modules, styled-components, Emotion, plain CSS, or other. Where global styles and any theme or color tokens live. How fonts are loaded (next/font or other) and whether Inter is loaded.
4. UI components: any component library (shadcn/ui, Radix, MUI, Chakra, Mantine, Ant, Headless UI, other) and the icon set. List the current components for: top tabs (Repository / Views), the dark navy left nav, card grids, the right-side detail panel with tabs Details / Tech debt / History, tables if any, search, toasts, modals/drawers. Give file paths.
5. Data layer: ORM or query layer (Prisma, Drizzle, TypeORM, raw SQL, Supabase, REST, tRPC, server actions, other). Where reads and writes happen (server components, API routes, route handlers, client fetching, React Query/SWR).
6. Data models: for System (and Component), Platform, Runtime, Integration/Flow (and API, Event, Integration Infra), People/Team/contact, Business (Capability, Process), Strategy (Product, Roadmap, roadmap items), Data (Data Entity, Data Store, Data Domain), and Tech debt, list the fields with types and enum values. Give the schema file path and line numbers. Say whether any Product records exist and what references them (Products will leave the nav and redirect to Roadmaps).
7. Shared fields gap table. One row per object (System, Platform, Runtime), one column per field. Mark each cell EXISTS (give the real field name), SIMILAR (name it and say how it differs), or MISSING:
     owner team | owner person | vendor | annual cost | currency | renewal date | notice period | lifecycle | criticality | cost model | hosted where | SLA target | location/region
   Note existing overlaps the spec calls out: Provider vs vendor, Type + Hosting model vs hosted where, costPerYear, pointOfContactId, status vs lifecycle, criticalityLite vs criticality. List the real enum values for Criticality, Lifecycle/status, and Cost model.
8. Relationships: does any "runs on" link exist between an application (System) and infrastructure (Platform/Runtime)? Check direct fields, join tables, and Components deployed to Runtimes. Also list how Integrations/Flows link two records. Say exactly how you would compute "what depends on X" today, or "not possible without a schema change". Then list EVERY relationship between object types as a table (source type, target type, direction, table/field or join table, cardinality): Component→System, Component/System→Runtime or Platform, flow from/to, System exposes API, API consumers, Event publisher/consumers, System realizes Capability, System supports Process, System reads/writes Data Entity, Data Entity stored in Data Store, Data Store hosted on Platform/Runtime/System, Data Entity in Data Domain, owner team/person, vendor/provider, roadmap item affects X, tech debt on X. Write "Not modeled" for any that don't exist. P7 generates its metamodel prompt from this table (see docs/design/ASK-GROUNDING-SPEC.md §1.2).
9. History and tech debt: how History entries are written (function name and path) and what a Tech debt record looks like.
10. Feature flags: the flag mechanism and helper (look for onboarding.day1.v1 first). Is it per workspace or per user? How do I turn repository.mvp.v1 on locally?
11. Workspace/org context: how the current org name ("Meridian Fasteners") and workspace name ("Default") are loaded, and whether a workspace switcher exists. Is there a workspace currency setting?
12. AI/LLM: any LLM SDK, API keys in env files (names only, never values), prompt files, embeddings, or vector store. If none, say "None".
13. Search: any existing global search or command palette, and any keyboard shortcut handling.
14. Risks: anything that will make matching the mockup hard (for example, a component library that fights custom styles, or a missing relationship).
15. Mapping table: for each mockup screen (Ask home, Ask answer, Reports, Report detail "Spend by vendor", Model table, Model detail panel), list the existing files that are the closest equivalents, or "new".

Finish by printing a 10-line summary in the chat. Change no code.
```

**Check:** `git status` should show only `docs/design/DISCOVERY.md`. Read it. Fix anything wrong by hand before you go on; every later prompt trusts it. Commit it.

---

### Prompt 1: Design tokens + app shell + routes

Attach: `01-ask-home.png` and `05-model-table.png`.

```text
Read docs/design/DISCOVERY.md first and follow what it says about the stack. Then read
the <style> block and the <header class="topbar"> markup in docs/design/bubomap-ui.html,
and section 2 of docs/design/CURSOR-UI-INSTRUCTIONS.md.

GOAL
Behind the workspace flag repository.mvp.v1 (use the existing flag helper named in
DISCOVERY.md), add the new app shell: design tokens, the dark top bar, and the new
top-level routes. Flag off = today's UI, unchanged.

1. Design tokens
   - Add the mockup's :root tokens with their exact hex values (--nav #0f172a, --nav2 #111827, --navline #1e293b, --navtext #cbd5e1, --navmuted #64748b, --accent #5b4ce6, --accent-600 #4c3fd1, --accent-50 #f1efff, --accent-100 #e4e0ff, --text #0f172a, --text2 #334155, --muted #64748b, --faint #94a3b8, --line #e5e7eb, --line2 #f1f5f9, --bg #ffffff, --bg2 #f8fafc, --amber-bg #fff8eb, --amber-line #fde7b8, --amber-text #b45309, --radius 12px).
   - Put them where the styling system expects them: Tailwind theme extension if the repo uses Tailwind, CSS variables in the global stylesheet if not. Scope them so the flag-off UI is not affected.
   - Add shared primitives matching the mockup classes: Button (.btn, .btn.primary, .btn.amber, .btn.ghost, .btn.sm), Pill (.pill with the p-* colors in section 2), Card (.card), Chip (.chip). If the repo already has Button/Badge/Card components, add variants to them instead of making new ones.
   - Font: use the mockup stack (Inter, "Segoe UI", system-ui, ...). If Inter isn't already loaded, don't add a font package; the fallbacks are fine.

2. Top bar (56px, background #0f172a, bottom border #020617), left to right:
   - Brand: orange owl logo (copy the SVG from the mockup), "BuboMap", and a "beta" badge. Links to /ask.
   - Breadcrumb: "{org name} / {workspace name}" with a chevron, workspace name bold white. Use the real org/workspace names and the existing switcher if one exists.
   - Segmented tabs with icons: "Ask", "Reports", "Model", "Views". The active tab uses the accent background. Model links to /model/infrastructure.
   - Spacer, then global search, 340px: placeholder "Ask or jump to...", a "Ctrl K" hint on the right. Ctrl+K (Cmd+K on Mac) focuses it. Typing opens a dropdown: first row `Ask: "{query}"` with "Enter" on the right (Enter goes to /ask?q={query}); a "Jump to" group with up to 5 matching real records (name + "Infrastructure" or "Application" on the right); a "Reports" group with up to 3 matching report titles. Match the .gsearch / .gdrop CSS.
   - Help icon button, then an avatar circle with the current user's initials.
   - Do NOT include the mockup's "Prototype · example data" tag.

3. Routes (adapt to the router in DISCOVERY.md):
     /ask                      Ask home; /ask?q=... shows an answer (built in P6)
     /reports                  Reports grid (P5)
     /reports/[id]             Report detail (P5)
     /model/[section]          overview | applications | infrastructure |
                               connections | vendors | owners        (Your estate, P2)
                               capabilities | processes | roadmaps |
                               apis-events | data | data/entities |
                               data/stores | data/domains             (Architecture, P2)
     /model/[section]/[id]     same list with the detail panel open (P3)
     /model/applications/[id]/components/[componentId]
                               a component's own detail view, opened from its
                               application's panel (P3)
     /views                    the EXISTING Views UI, inside the new shell
   For now /ask and /reports render a simple empty page inside the shell with the page title only. /model/* renders the existing Repository content inside the new shell until P2 replaces it.

4. Redirects (only when the flag is on): permanent redirects from every existing Repository route in DISCOVERY.md to its /model equivalent, keeping ids, query strings, and hashes. Use the old-to-new table in REPOSITORY-MVP-SPEC.md section 6.2, but with /model/... as the new base path instead of /repository/... (the mockup's routes win). Also: every old Products route (list and detail) redirects to the Roadmaps route, and every old Components route redirects to /model/applications (a component detail id redirects to /model/applications/{its systemId}/components/{id}; a component with no parent redirects to /model/applications?view=components). Put the mapping in one shared legacyRoutes file so links and redirects use the same source. Put redirects wherever the repo already has them (next.config or middleware); if the flag can't be read there, redirect in the old route's page component instead, and tell me which you picked. With the flag on, "/" goes to /ask.

FILES LIKELY TOUCHED (find the equivalents; don't create parallel copies)
the root layout, the current top tabs component, global styles or tailwind config,
the flag helper, next.config or middleware, a new shell/topbar component folder.

ACCEPTANCE
- Flag off: every existing page looks and works exactly as before (check Repository, Views, and one detail panel).
- Flag on: top bar matches 01-ask-home.png and 05-model-table.png: height, colors, tab pill, search width, Ctrl K hint.
- Ctrl+K focuses the search; typing shows Ask / Jump to / Reports groups with real records; Enter goes to /ask?q=...
- Every old Repository URL redirects to its /model URL with the same id, including Products (to Roadmaps) and Components (to Applications or the parent application).
- No TypeScript or lint errors.

DO NOT
- Change the database schema, API types, or persisted enum names.
- Add a UI, icon, or CSS library without asking me first.
- Delete or restyle the old UI. It must keep working with the flag off.
- Hard-code "Meridian Fasteners" or any mockup data.
- Delete Product or Component records or tables. Only the nav entries and routes change.
```

---

### Prompt 2: Model section UI (nav, table, cards)

> Already done. The single Infrastructure list built here is split by CURSOR-INFRA-INSTRUCTIONS I3 (INFRA-SPEC §3, §6). Don't re-run P2 to change it.

Attach: `05-model-table.png`.

```text
Read docs/design/DISCOVERY.md, then the mockup functions modelSide(), navItem(),
archOpen(), toggleArch(), the ESTATE / ARCH / DATA_SUB arrays, viewModel(), cell(),
sortVal(), and modelPlaceholder() in docs/design/bubomap-ui.html, plus the .side,
.side-g, .nv, .nv .hint, .nv.empty, .t, .toolbar, .typechips, .tablewrap, .tablefoot,
.cgrid and .icard CSS. Match 05-model-table.png. All behind repository.mvp.v1. Use
REAL data only.

GOAL
Replace the old card grids under /model/* with the mockup's left nav and dense table.

1. Left nav (232px, background #111827). Header "MODEL", then two groups. There is
   no "Advanced" group any more, and nothing is hidden.
   a) "YOUR ESTATE" (small uppercase group label, always open, not collapsible), items
      with icons and counts:
        Overview | Applications {n} | Infrastructure {n} | Connections {n} |
        Vendors & contracts {n} | Owners & teams {n}
   b) "ARCHITECTURE" (group header with a chevron and a total count, divider above it).
      Shown by default and collapsible. Remember open/closed per user in localStorage
      under a key that includes the user id (mockup: "bubomap:{userId}:nav.architecture.open").
      Default open. Auto-expand when the active route is inside the group. Items:
        Capabilities {n} | Processes {n} | Roadmaps {n} | APIs & events {n} |
        Data {n}, with indented children Entities {n}, Stores {n}, Domains {n}
      Each links to the EXISTING page for that section rendered inside the new shell
      (routes from P1: /model/capabilities, /model/processes, /model/roadmaps,
      /model/apis-events, /model/data, /model/data/entities, /model/data/stores,
      /model/data/domains). Keep each page's existing create/edit flows.
      APIs & events sits here by default. OPTION (don't build unless I ask): nest them
      under Connections instead (as the spec's Connections "Advanced" kind chips). Keep
      the nav config in one file (e.g. nav/modelNav.ts) so moving them is a one-line change.
   - Products is removed from the nav. Its routes redirect to Roadmaps (P1 legacyRoutes).
   - Components is NOT a nav item. Components live in the application's detail panel
     (P3). The old Components routes redirect (P1).
   - Empty sections are never hidden. A section with 0 records shows a muted count
     (#475569) and, under its label, a one-line purpose hint (11px, #64748b), with
     a title tooltip "Nothing here yet. {hint}." Hints (exact copy):
       Capabilities "What the business must be able to do"
       Processes "How work moves across teams"
       Roadmaps "Planned changes and when they land"
       APIs & events "How systems expose and share data"
       Data "The information you keep and where"
       Entities "Things you track, e.g. Customer"
       Stores "Databases and files that hold it"
       Domains "Groups of related entities"
     Your-estate items never show a hint; they show their count (0 is fine).
   - Active item: background #5b4ce6, white text, 3px left border #a5b4fc (an empty
     active item's hint turns #e0e7ff).
   Counts: Applications = Systems; Infrastructure = Platforms + Runtimes;
   Vendors = distinct normalized vendor names (spec 7.5); Roadmaps = roadmap items (or
   roadmaps if items don't exist, per DISCOVERY.md); APIs & events = APIs + Events;
   Data = Entities + Stores + Domains; Architecture total = sum of its items.
   Components are not counted in the nav.
   Footer card: "Model {pct}% complete", a 6px progress bar, then "{n} key fields missing · Fill them" (Fill them turns on the missing filter). pct = filled cells / (items x 6) over Applications + Infrastructure for the six key fields: owner (team OR person), vendor, annual cost, renewal date, lifecycle, criticality.

2. Infrastructure list = one read model over Platform + Runtime rows with a source discriminator. Do not merge tables. Applications = System rows.

3. Page header (sticky, white, bottom border): eyebrow tag ("Where things run" for Infrastructure, "Software the business uses" for Applications), h1 title, "{n} records", spacer, amber button "Fill missing ({n})" (n = blanks across Applications AND Infrastructure; title attribute "{n} key fields are blank across Applications and Infrastructure"; it toggles the missing filter), primary button "Add" with a plus icon that opens the existing create flow.

4. Toolbar: search input "Search by name, vendor, or owner" (matches name, vendor, owner team, owner person); selects "All owners", "Any lifecycle", "Any criticality" filled from real values (add "No owner" to owners); button "Missing fields" that becomes amber and reads "Missing fields: on" when active;
   right-aligned segmented toggle "Table" | "Cards".
   Infrastructure only: type chips "All", "Cloud", "On-prem server", "SaaS platform", "Network", each with its count. Until P4 adds hosted-where, derive the chip from the existing Type / Hosting model fields with spec Appendix A, and put anything unmapped under All only. Put search, filters, sort, and view in the URL query string.

5. Table columns, in this order, all sortable (arrow on the active column, a faint sort icon on the others):
     Infrastructure: Name | Type · hosted where | Owner | Vendor | Annual cost |
                     Renewal | Lifecycle | Criticality
     Applications:   Name | Type · runs on | Owner | Vendor | Annual cost |
                     Renewal | Lifecycle | Criticality
   - Name: 28px icon tile (#f1f5f9, border #e2e8f0, radius 7) + bold name.
   - Type: kind on line 1; line 2 in 12px muted text: location for infrastructure, "Runs on {X}" or "Hosted by vendor" for applications (only if runs-on data exists; otherwise leave line 2 empty).
   - Owner: team in bold, person on line 2 in muted text.
   - Annual cost: right-aligned, tabular numbers, bold, formatted "$31,500" with the record's currency. Built-in-house apps with no cost show muted "No license cost"; capital assets with no cost show muted "Capital asset". Neither counts as blank.
   - Renewal: "Jan 14, 2027". Add a small orange "soon" pill if it's within 90 days. "Monthly" and "No contract" render muted.
   - Lifecycle and Criticality: pills with the section 2 colors.
   - Blank key-field cell: amber background #fff8eb and an amber "+ Add" button (#b45309, 12.5px, weight 600). Clicking it starts inline edit if the field exists today. If the field doesn't exist yet in the schema (see DISCOVERY.md), show the cell greyed out with the tooltip "Coming soon" and don't count it as missing.
   - Header for each key field with blanks: a second line "{n} missing" in 10.5px amber with a 5px #f59e0b dot.
   - Row click goes to /model/{section}/{id} (the panel comes in P3). Row hover #fafaff. Empty result: one row "No matches."
   - Footer bar (#f8fafc): left "{shown} of {total} shown · amber cells are blank. Click one to fill it in."; right "Tracked annual cost: {sum}" (sum numeric costs only, one total per currency; never add currencies together).

6. Cards view: 3-column grid. Each card: icon tile, name (15px bold), "{kind} · {location or runs on}", lifecycle pill top-right, then rows Owner, Vendor, Annual cost, Renewal, Criticality. Blank rows show an amber "Add owner", "Add vendor", "Add annual cost", "Add renewal", "Add criticality" tag. Remember the view choice per list in localStorage.

7. /model/overview: header "Overview" with "{org name} at a glance". Four KPI cards: "Applications" {n} / "{k} critical"; "Infrastructure" {n} / "{k} critical";
   "Annual spend tracked" {sum} / "{v} vendors"; amber card "Missing fields" {n} / "Model {pct}% complete". Below, a 3-column grid of report cards. Leave that grid empty with a TODO for P5, which computes the numbers. The full Overview panels in spec 8.1 are a later follow-up, not this phase.

8. /model/connections, /model/vendors, /model/owners: for now, the mockup's centered placeholder card (64px accent icon tile, title, one line of text) using these strings with real counts:
     Connections: "How your systems talk to each other: {n} connections."
     Vendors & contracts: "Every company you pay, what you pay them, and when each
       contract renews."
     Owners & teams: "Who is accountable for what. {t} teams own {o} of {n} items;
       {m} have no owner."
   Replace the button with a link to the old list page. Do not show the mockup's "Not built out in this prototype" line.
   Architecture routes render the existing pages inside the shell (not placeholders).
   If one of them is empty, show its existing empty state plus the purpose hint above
   as the subtitle, and its existing "Add" action.

ACCEPTANCE
- Side by side with 05-model-table.png at 1440x900: same nav groups and order, same columns, order, header text, amber blanks, "{n} missing" lines, chips, footer text.
- Nav: "Your estate" always open; "Architecture" collapses and stays collapsed after a reload; it re-opens by itself when you navigate to one of its routes; empty sections show "0" plus the hint and are not hidden; there is no Products, Components, or Advanced entry.
- /model/products (and old Products URLs) land on Roadmaps; old Components URLs land on Applications (or the parent application's component view).
- Infrastructure count = Platforms + Runtimes. Sorting works on every column;
  blanks sort last. Search and filters combine. Refreshing keeps the state (URL).
- The missing counts in the header, sidebar footer, and column headers agree.
- Flag off: old card grids unchanged.

DO NOT
- Change the DB schema. Missing fields are "Coming soon" until P4.
- Invent data or show mockup records.
- Add a table/grid library without asking; a plain <table> is expected.
- Delete Product or Component data, or hide any Architecture section because it's empty.
```

---

### Prompt 3: Detail side panel

Attach: `06-model-detail.png`, `07-app-components.png`, and `08-component-detail.png`.

```text
Read docs/design/DISCOVERY.md, then openPanel(), fv(), closePanel(), componentsSection(),
openComponentPanel(), the ADDP object, and the .panel/.ph/.ptabs/.psec/.fr/.addlink/
.suggest/.dep/.comp/.backlink/.debt/.tl CSS in docs/design/bubomap-ui.html. Match
06-model-detail.png, 07-app-components.png, and 08-component-detail.png. Behind
repository.mvp.v1.

GOAL
When the URL is /model/{section}/{id}, open a 470px panel from the right (below the
56px top bar) over the list, with a scrim rgba(15,23,42,.28). Highlight the row
(#f1efff). Esc, the X button, or a click on the scrim goes back to /model/{section}.
Reuse the existing detail panel's data loading and its Tech debt and History logic.
This is a new layout on the same data, not new data.

HEADER
- 36px icon tile, name (18px bold), under it "{Infrastructure|Application} · {kind}".
- Right: icon buttons Edit (pencil), Delete (trash), Close (X). Edit and Delete call the existing update and delete logic, including any existing confirmation.
- Chips row: neutral hosted-where / runs-on chip, lifecycle pill, criticality pill, and an amber "{n} missing" pill if any key field is blank.
- Tabs: "Details", "Tech debt" (with a count badge when > 0), "History". Active tab: #4c3fd1 text with a 2px #5b4ce6 underline.

DETAILS TAB (section headings 11px uppercase, #475569, letter-spacing .08em)
- HOSTING: "Hosted where", "Location".
- CONTRACT: "Vendor", "Annual cost", "Cost model", "Renewal date", "Notice period". If there's a pending vendor suggestion (P4), show under Vendor, right-aligned: "Suggested: {name} · Accept · Dismiss". Accept writes the vendor; Dismiss clears the suggestion. Neither happens automatically.
- GOVERNANCE: "Owner" shown as "{team} · {person}" (person in muted text). If there's no owner, show two rows, "Owner team" and "Named owner", each with its prompt. Then "Lifecycle" (pill), "Criticality" (pill), "SLA target".
- DEPENDS ON THIS, with "{n} apps" (or "1 app") on the right of the heading. One card per dependent: icon, name, a line of text, criticality pill. Line text: "Runs on {name}" for infrastructure, "Uses data from {name}" for connections, "Indirectly, through {name}" for second-hop dependents. Build it from whatever DISCOVERY.md says exists (runs-on and/or Integrations). Empty: "Nothing is linked to this yet. Link an app". If no relationship data exists at all, show the empty state and add a TODO for P4.
- COMPONENTS (applications only, after Depends on this; see 07-app-components.png),
  with "{n} parts" (or "1 part") on the right of the heading. One card per Component
  whose parent is this System: cube icon, name, "{kind} · Runs on {infrastructure
  name}" (or "Runs on (not set)"), lifecycle pill, chevron. Card click opens the
  component's own detail view (below). Under the cards, a small "Add component"
  button that uses the EXISTING Component create flow with the parent preset to this
  System. Empty: "No components. Break this application into parts only if it helps
  you track hosting or ownership." plus the same button. Support
  /model/applications/{id}?sec=components to open the panel scrolled to this section.
- Footer: clock icon + "Updated by {user} · {relative time}" from existing data.

COMPONENT DETAIL VIEW (/model/applications/{appId}/components/{componentId}; see
08-component-detail.png)
Components stay real records with their own detail view. Open the same 470px panel
over the Applications list (parent row highlighted) with:
- A "← Back to {application}" link above the header (goes to /model/applications/{appId}).
- 36px cube icon tile, name, "Component of {application} · {kind}", Edit / Delete /
  Close buttons wired to the EXISTING component update/delete logic, chips (runs-on,
  lifecycle), and tabs Details / Tech debt / History (reuse the existing ones if
  components have them; otherwise show only Details).
- Details: PART OF (a card for the parent application), HOSTING ("Runs on" linking to
  the infrastructure record), GOVERNANCE (Owner = the component's own owner if the
  schema has one, else "{team} · from {application}"; Lifecycle), DESCRIPTION, footer.
- Components must be findable: add them to the global search "Jump to" group
  ("{name}" with "Component · {application}" on the right) and include them in the
  record index Ask uses (P6/P7). A result click opens the component detail view.

EMPTY FIELDS
Show an amber dashed pill with a plus icon, never a blank or "—". Use these exact
strings:
  Hosted where "Set where it's hosted" | Vendor "Add vendor" | Annual cost "Add annual cost" | Cost model "Add cost model" | Renewal date "Add renewal date" | Notice period "Add notice period" | Owner team "Add owner team" | Named owner "Add a named owner" | Lifecycle "Set lifecycle" | Criticality "Set criticality" | SLA target "Add SLA target"
Clicking one opens an inline editor for that field and saves through the existing
update logic, writing a History entry the same way the old panel does. Fields that
don't exist in the schema yet show the prompt disabled with a "Coming soon" tooltip.
Until P4 moves the data, label the old Provider field "Vendor (was Provider)" and
keep showing Type / Hosting model values under "Hosted where". Don't move data yet.

TECH DEBT TAB: one bordered card per item: title, severity pill, description (13px
muted). Then a small "Log an item" button that uses the existing create flow. Empty:
"No tech debt logged. Log an item".
HISTORY TAB: vertical timeline (2px #e5e7eb line, 10px circles with a #5b4ce6
border). Each entry: "{date} · {actor}" in 12px faint text, then the change text.
Real entries only.

ACCEPTANCE
- /model/infrastructure/{real id} opens straight into the panel; refresh keeps it open.
- Side by side with 06-model-detail.png: widths, section order, labels, amber prompts, chips, tab styling.
- Editing a field updates the panel and the table row, and adds a History entry.
- Tech debt and History show the same records as the old panel.
- An application's panel lists its real Components; "Add component" creates one with the parent preset, and it appears in the list without a reload.
- A component card opens its detail view; refresh keeps it open; "Back to {application}" returns to the application's panel; searching a component's name in the top bar finds it.
- Flag off: old panel unchanged.

DO NOT
- Change the DB schema or move data between fields (that's P4).
- Drop any existing tab or data the old panel shows. Put anything that doesn't fit in a collapsed "More details" section at the bottom.
```

---

### Prompt 4: Schema additions + migration

Attach: `06-model-detail.png`. Run this only for fields DISCOVERY.md marked MISSING or SIMILAR.

**Cost fields:** minEA keeps cost in `objects.properties` (`annual_cost`, `cost_model`, `contract_renewal` / `commitment_ends`). Leave all money and contract fields OUT of this phase: tell Cursor "skip annualCost, annualCostCurrency, renewalDate, noticePeriodDays and cost model; COST-SPEC.md handles cost through properties.cost_lines and lib/cost". No cost columns are ever added.

```text
Read docs/design/DISCOVERY.md (section 7, the shared fields gap table) and
docs/design/REPOSITORY-MVP-SPEC.md sections 7.1-7.6 and Appendices A and B.

GOAL
Add ONLY the missing shared fields, migrate existing values, and turn on the
"Coming soon" cells and prompts from P2/P3.

1. Start by showing me a plan and wait for my OK: for each of System, Platform, and Runtime, which of these you'll add and with what type, based on the gap table:
     vendor (string) | annualCost (number) | annualCostCurrency (ISO 4217, default = workspace currency, else USD) | renewalDate (date) | noticePeriodDays (int) | ownerPersonId (ref to the existing person/contact model) | hostedWhere (enum: cloud, on_prem, colocation, saas_platform, network, unknown) | runsOnIds or a join table (only if no runs-on relationship exists) | vendorSuggestion (string, nullable)
   Reuse existing fields when they mean the same thing (costPerYear, pointOfContactId, lifecycle, criticality). Don't rename or drop any existing column.
2. After I approve: write the schema change and migration with the repo's existing tool (DISCOVERY.md section 5). Keep old columns.
3. Data migration script, per workspace, behind the flag:
   - Hosted where: from Hosting model, else the Type suffix, else a hosting term in Provider, using Appendix A. If a known cloud vendor conflicts with an on-prem term (e.g. DigitalOcean Box marked on-prem), use cloud and mark it for review with reason "conflict". Nothing found = unknown.
   - Vendor: copy Provider when it's a company name. If Provider is a hosting term or empty, leave vendor empty and, if the item name matches Appendix B (AS400 -> IBM), store it in vendorSuggestion. Never auto-apply a suggestion.
   - Write one History entry per changed item, actor "BuboMap migration", text 'Moved "{value}" from Provider to Hosted where' or "Provider renamed to Vendor".
   - Idempotent: a second run changes nothing and writes no History.
   - A --dry-run mode that prints a per-item diff without writing. Tell me the exact PowerShell command to run it.
4. UI: enable the cells and prompts that were "Coming soon". Show the Vendor suggestion line in the panel ("Suggested: IBM · Accept · Dismiss"). Annual cost editor helper text: "For owned hardware, use yearly depreciation plus support." Never add amounts in different currencies together.
5. Add a test (with the repo's test runner, if it has one) that runs the migration twice on fixture data and checks the second run writes nothing, and that AS400 gets vendorSuggestion "IBM" and an empty vendor.

ACCEPTANCE
- Dry run on my local DB prints a sensible diff; the real run applies it; a second run reports 0 changes.
- AS400 shows "Add vendor" with "Suggested: IBM". DigitalOcean Box is hosted where = Cloud, vendor = DigitalOcean.
- All six key columns are editable in the table and panel; blanks count as missing.
- Flag off: old UI still reads the old columns and works.

DO NOT
- Drop, rename, or repurpose existing columns or enum values.
- Add any field that already exists under another name.
- Run the migration against anything but my local database.
```

---

### Prompt 5: Reports

Attach: `03-reports.png` and `04-report-detail.png`.

```text
Read docs/design/DISCOVERY.md, then the REPORTS and VENDORS data, reportsSide(),
viewReports(), barChart(), and viewReportDetail() in docs/design/bubomap-ui.html, plus
the .rgrid/.rcard/.kpis/.kpi/.filters/.chart-card CSS. Match 03-reports.png and
04-report-detail.png. Behind repository.mvp.v1. Every number is computed from real
data; nothing is copied from the mockup.

1. Put the calculations in one module (e.g. reports/queries.ts) that fetches each object type once and computes in memory (workspaces are small). "Today" = the server date. "Next 90 days" = today through today + 90.

2. /reports: left nav header "REPORTS" with items and counts: "All reports" 8, "Cost & contracts" 2, "Risk & resilience" 4, "Ownership & upkeep" 2, "Saved from Ask" {n}. Footer card: "Reports refresh from your model automatically. Last refresh {today, h:mm AM}."
   Page header: "Reports", "Ready-made answers to the questions you get asked most", and on the right a button "Ask a new question" (goes to /ask). A 4-column grid of 8 cards (icon tile, title, question, big number with small suffix, then "Updated {when}" under a divider). Titles and questions exactly:
     renewals  "Renewals next 90 days" / "What contracts come up before {today+90, Mon D}, and what do they cost?" -> "{n}" + "renewals · {sum}"
     spend     "Spend by vendor & category" / "Where is our money going, and to whom?" -> "{total}" + "/ yr"
     impact    "Impact analysis" / "What breaks if a system or vendor fails?" -> "{infra item with most dependents}" + "→ {n} apps"
     eol       "End of life & retiring" / "What is being phased out or losing vendor support?" -> "{n}" + "items" (lifecycle Retiring or End of life)
     owners    "Ownership gaps" / "Which systems have nobody accountable for them?" -> "{n}" + "with no owner" (no team and no person)
     sensitive "Vendors holding sensitive data" / "Which vendors store customer,
               employee, or financial data?" -> "{n}" + "vendors"
     spof      "Single points of failure" / "Where would one failure stop critical work?" -> "{n}" + "{names, comma-separated}" (spec 8.1 definition)
     debt      "Tech debt summary" / "What known problems are we carrying, and where?" -> "{n}" + "open items"
   Categories: cost = renewals, spend; risk = impact, eol, sensitive, spof;
   own = owners, debt. Icon colors are in section 2 of CURSOR-UI-INSTRUCTIONS.md. If the data for a card doesn't exist (for example there's no data-sensitivity field, or no runs-on link), show "—" with the suffix "not tracked yet" instead of a made-up number, and tell me which cards did this.
   Below the grid: "Saved from Ask · {n}" with saved answer rows (P6 fills this; show nothing when there are none).
   Clicks: spend opens /reports/spend; renewals and impact open /ask?q=... with the matching question (after P6); the others open /reports/{id} with a simple "This report is coming soon." page for now.

3. /reports/spend ("Spend by vendor & category"):
   - Header: muted "Reports" link, "/", h1 "Spend by vendor & category"; right: button "Save view" (stub toast for now) and primary "Export" (downloads a real CSV of the table as spend-by-vendor.csv).
   - Sentence: "You spend {total} a year across {n} vendors. {A}, {B}, and {C} make up {p}% of it." (bold the numbers the same way the mockup does).
   - 4 KPI cards: "Annual spend tracked" {total} / "about {total/12} a month";
     "Largest vendor" {name} / "{cost} · {p}% of spend"; "Renewing in 90 days" {sum}
     / "{n} contracts · first on {Mon D}"; amber card "Not counted yet" "{n} items" / "{item (reason)}, ..." for items with no annual cost or capital assets with no support cost.
   - Filters row: search "Search vendors or items", selects "All categories", "All owners", "Any renewal date" (options "Next 30 days", "Next 90 days", "Next 12 months", "No date"); on the right "{n} vendors · {total}".
   - Chart card "Annual cost by vendor" with legend "Top 3" (#5b4ce6) and "Others" (#a5a0f3). Horizontal bars as inline SVG, no chart library: viewBox width 1100, label column 170 right-aligned (13px #334155), 25px rows, 15px bars with radius 4, value label "{cost}" (12.5px bold) plus "{p}%" in #94a3b8, gridlines #f1f5f9 at 25/50/75/100%.
   - Table: "Vendor" | "Category" | "Annual cost" (right) | "Renewal date" | "Owner" | "Items covered". Renewal within 90 days gets an orange "within 90 days" pill. Blank Renewal/Owner cells are amber with "+ Add", and the header shows "{n} missing". Items covered = "{count} · {names}". Row click goes to the item in /model (the item with the highest cost if there are several).
     Footer: "Built-in-house apps have no license cost and are not included." and "Total {total}".
   - Vendors come from normalizeVendor (spec 7.5). Exclude "Built in-house" and empty. Vendor cost = sum of its items per currency; renewal = earliest upcoming; owner = most common owner team; category = most common existing Category value among its items, or blank. Never add amounts in different currencies together.
4. Fill the /model/overview report grid from P2 with the first 6 cards (no icon or footer, min-height 0), using the same calculations.

LATER (don't build now; list them in a TODO): report detail pages for Renewals next
90 days, Impact analysis, End of life & retiring, Ownership gaps, Vendors holding
sensitive data, Single points of failure, Tech debt summary.

ACCEPTANCE
- Side by side with 03 and 04: grid, card anatomy, KPI row, chart, table, footer.
- Every headline number matches a count you can reproduce by filtering /model.
- Spend total = sum of the vendor table = the chart; CSV opens in Excel.

DO NOT
- Add a chart or table library.
- Change the schema.
- Show mockup numbers ($107,820, AS400, etc.) unless the real data produces them.
```

---

### Prompt 6: Ask UI + deterministic answer service

Attach: `01-ask-home.png` and `02-ask-answer.png`.

```text
Read docs/design/DISCOVERY.md, then viewAskHome(), askBox(), viewAnswer(), recRow(),
cite(), SUGGESTED, and the .ask-home/.bigsearch/.chips/.tiles/.health/.ans-*/.answer/
.cite/.caption/.gaps/.actions/.follow CSS in docs/design/bubomap-ui.html. Match
01-ask-home.png and 02-ask-answer.png. Behind repository.mvp.v1. No LLM in this
phase.

1. ANSWER SERVICE CONTRACT (e.g. ask/types.ts). Both the UI and any future LLM version must use this:

   type AskRequest = { workspaceId: string; question: string };
   type Citation = {
     n: number;                          // 1-based, matches [n] markers
     recordId: string;
     recordType: "application" | "infrastructure";
     relationship: string;               // e.g. "Runs on AS400"
     relationshipIcon: "target" | "link" | "arrow" | "dollar" | "cal";
     badge?: string;                     // e.g. "indirect"
   };
   type AskAnswer = {
     handler: "impact" | "spend" | "renewals" | "unsupported" | "llm";
     answerText: string;                 // **bold** and [n] citation markers only
     citations: Citation[];
     gaps: { text: string; fillHref: string }[];
     followUps: string[];                // exactly 3
     caption: { generatedAt: string; recordCount: number; gapCount: number;
                extra?: { label: string; href?: string; detail?: string } };
   };
   interface AnswerService { answer(req: AskRequest): Promise<AskAnswer> }

   Implement DeterministicAnswerService. Expose it through the repo's server pattern (route handler, server action, or API route, per DISCOVERY.md). Add a clearly marked seam, // LLM SEAM: see P7, where an LlmAnswerService can be swapped in by config later. Every cited recordId must exist in the workspace.
   Keep the math out of the handlers: put impact traversal in a pure function (e.g. ask/graph/impact.ts, computeImpact(graph, id, depth)) and the spend/renewal math in ask/graph/aggregate.ts, shared with P5's reports/queries.ts. P7 exposes these exact functions as the impact_of and aggregate tools.

2. HANDLERS (computed from real data; route by keywords and record-name matching):
   impact   ("breaks", "fail", "goes down", "down", "outage", "impact" + a record name)
     Text: "If the {X} goes down, **{n} applications stop working**: {A}[2], {B}[3], and {C}[4]. **{k} of them are critical.** {D}[5] is affected indirectly, because it depends on {C}. The {X}[1] has no backup system recorded, so today it is a single point of failure." (drop sentences that don't apply; the last one only when the SPOF rule is true.)
     Rows: X "The system you asked about" (target icon); direct "Runs on {X}" (link icon); indirect "{relationship} {C}" with badge "indirect" (arrow icon).
     Follow-ups: "Who can fix the {X} if it fails?", "What would it cost to move off the {X}?", "What else has no backup?"
   spend    ("money", "spend", "cost", "pay")
     Text: "You spend **{total} a year** across {n} vendors. **{p}% goes to three**: {A}[1] ({a}), {B}[2] ({b}), and {C}[3] ({c})." Add, if a Retiring item has a cost: "{R}[4] costs {r} a year and is marked Retiring, so it is the clearest saving."
     Rows: "{cost} a year · {p}% of spend", Retiring row "{cost} a year · Retiring".
     Caption extra: "Open full spend report" -> /reports/spend.
     Follow-ups: "What can we cancel?", "Which costs went up this year?", "What renews in the next 90 days?"
   renewals ("renew", "contract", "expire")
     Text: "**{n} contracts renew in the next 90 days**, worth **{sum} a year** in total. The largest is {A}[1] at {cost} on {Mon D}. It has a {d}-day notice period, so **you have until {renewal - d, Mon D} to renegotiate or cancel**. {B}[2] renews {Mon D}, {C}[3] {Mon D}, and {D}[4] {Mon D}."
     Rows: "Renews {Mon D} · {cost}". Caption extra: "window {today} to {today+90}".
     Follow-ups: "What can we cancel?", "Who approves the {A} renewal?", "What renews in the next 12 months?"
   unsupported: "I can't answer that yet. Try one of these:" with the 6 suggested
     questions as chips, no records table. (New copy, not in the mockup.)
   Gaps: list real blanks on the cited records that could change the answer, e.g.
     "{X} has no vendor or renewal date, so this may be incomplete. {Y} also has no owner." with "Fill in" linking to the record. Hide the box when there are none.

3. ASK HOME (/ask, centered, max-width 820px, top padding 78px):
   - Pill: spark icon + "Answers come from your own records, with sources"
   - h1 (34px): "What do you want to know?"
   - Lede: "{org} · {n} systems, {v} vendors, {spend} a year in tracked spend"
   - Big search (60px tall, radius 16, accent spark icon): placeholder "Ask anything about your systems, vendors, costs, or risks", button "Ask →".
   - Chips: "What renews in the next 90 days?", "What breaks if the {top infra item} goes down?" (mockup: AS400), "Where is our money going?", "What has no owner?", "Which vendors hold customer data?", "What goes end of life next year?"
   - "Popular reports" with "All reports →" on the right; 4 tiles (renewals, spend, owners, spof) using P5's calculations.
   - Model health card (#f8fafc): 42px ring in #5b4ce6 showing {pct}%, title "Model health: {pct}% complete, {n} fields missing", text "Answers get better as you fill gaps: {top 3 missing fields with counts}, and {rest} more.", amber small button "Fill missing →" linking to /model/infrastructure with the missing filter on.

4. ANSWER (/ask?q=...):
   - Sticky top bar with the question in a 48px search box and an "Ask" button.
   - Column max-width 944px. Label: spark + "ANSWER" (12px, #5b4ce6, uppercase).
   - Answer paragraph 17.5px, line-height 1.62. Render **bold** and [n] as citation badges (18px, #e4e0ff background, #4c3fd1 text, radius 5); clicking one opens /model/{section}/{id}.
   - Caption (12.5px, #94a3b8): check icon + "Answer generated from your model on {Mon D} · {n} records · {g} gap(s) · {extra}". For impact, extra is a link "How this was worked out" that shows the path (X → direct → indirect) in a toast.
   - "Based on these records · click a row to open it in Model": table with columns (number badge) | "Name" | "Type" | "Owner" | "Criticality" | "Relationship" | (chevron). Type = "Infrastructure"/"Application" with the kind under it. No owner = amber "No owner · Add". No criticality = amber "Add".
   - Gaps box (#fff8eb, border #fde7b8, radius 12): warning icon #d97706, title "Gaps" (#92400e), text (#78350f), "Fill in" link.
   - Actions row above a top border: primary "Save as report", "Export", "Share", spacer, "Was this right?", small "Yes" and "No".
       Save as report: stores {question, date, user} and lists it under Reports > "Saved from Ask" with pill "Re-runs on open" and a summary line. Use localStorage unless DISCOVERY.md shows a place to store it; don't add a table without asking. Toast "Saved to Reports › Saved from Ask".
       Export: downloads the answer and records as CSV. Toast "Exported answer and records to CSV".
       Share: copies the /ask?q= URL. Toast "Share link copied".
       Yes/No: toast "Thanks for the feedback" / "Thanks. Tell us what was wrong."
   - "Ask next" with the 3 follow-up chips.
   - Loading state: keep the layout and show a skeleton for the paragraph and table.

ACCEPTANCE
- Side by side with 01 and 02 at 1440x900: spacing, sizes, colors, copy.
- Asking about your real top infrastructure item gives a correct impact answer; every citation opens the right record; the numbers match /model and /reports.
- Spend and renewals answers match /reports/spend and the Renewals card.
- Unknown questions give the unsupported answer, never made-up content.
- No LLM calls, keys, or SDKs added.

DO NOT
- Hard-code mockup sentences with mockup names or numbers.
- Add an LLM SDK or any network call to an AI provider.
- Show the mockup's "Prototype: this sample answer..." note.
```

---

### Prompt 7: Grounded Ask (LLM-backed, three sub-prompts)

P7 turns Ask into a grounded assistant. The AI never answers from memory. It calls workspace-scoped query tools, the server does all traversal and math, and it returns JSON with citations that the server validates before anything is shown. The full design is in `docs/design/ASK-GROUNDING-SPEC.md`. These prompts point Cursor at it section by section. Run 7a → 7b → 7c, each in a new chat, and commit after each.

Shared guardrails (repeated in each prompt):

- Everything stays behind `ask.llm.v1` (off by default) on top of `repository.mvp.v1`. With it off, Ask behaves exactly as P6.
- **Ask the user before adding any provider SDK or package.** No model or provider name is hard-coded. Provider, model, and key come from env vars (`ASK_LLM_PROVIDER`, `ASK_LLM_MODEL`, and the provider's key variable), read server-side only, never logged or sent to the client.
- The LLM gets no SQL or DB handle, only the tools. Tenant and permission checks happen in the tools, server-side.
- No schema change without asking (the only candidate is an audit table in 7b).

#### Prompt 7a: Query tools + metamodel prompt + dev fixture (no LLM yet)

Attach: nothing. Mention `@docs/design/ASK-GROUNDING-SPEC.md`, `@docs/design/DISCOVERY.md`, and `@docs/design/REPOSITORY-MVP-SPEC.md`.

```text
Read docs/design/ASK-GROUNDING-SPEC.md sections 0, 1, 2, and 7.2, then
docs/design/DISCOVERY.md sections 5, 6, 8, and 12. Find the P6 code (AnswerService,
DeterministicAnswerService, ask/graph/impact.ts, ask/graph/aggregate.ts or wherever
P6 put the impact/spend/renewals math).

GOAL
Build the read-only, workspace-scoped query tools and the metamodel system prompt.
No LLM calls, no provider, no SDK in this prompt.

1. Relation registry: ask/graph/relations.ts. One entry per RelationKey in spec §1.2
   that EXISTS in the real schema (DISCOVERY.md sections 6 and 8, plus P4 runs-on):
   key, source type(s), target type(s), plain-words label, failure-flow rule, and the
   DB mapping (table/field/join). Leave out relations the schema doesn't have, and list
   them in a comment "not modeled". Don't invent tables.
2. WorkspaceGraph: ask/graph/graph.ts. Build it from one fetch per object type for
   ONE workspace (tenant filter on every query, and the same per-user read-permission
   filter the Model pages use). Cache it per workspaceId + model version for 60 seconds.
   Vendors are derived with normalizeVendor (spec §7.5) and get ids "vendor:<normalized>".
3. Tools (spec §2.1-2.4), one file each under ask/tools/: search_records (fuzzy:
   normalized substring + trigram or Levenshtein; aliases like AS/400 -> AS400),
   get_record, traverse (depth <= 4, cycle-safe), impact_of (REUSE the P6
   computeImpact; extend it to the failure-flow rules, counts, business impact,
   SPOF flag, per-dependent path, and the tie-break in §2.4), aggregate (REUSE the P5/P6
   math; add group_by, filters incl. renewal_within_days and notice_deadline_within_days,
   per-currency sums, shares, excluded list), find_gaps, model_overview (only when
   records + edges < 1,500 and the output is under 60,000 chars; no money totals).
   - zod-validate args. Inject workspaceId/userId from the server context; never
     accept them as tool args.
   - Return RecordSummary/EdgeSummary only (no emails/phones/raw rows). Free text goes
     in description_untrusted, truncated to 280 chars with delimiter strings removed.
   - Enforce the size caps in §2.4, and set truncated/total when a cap is hit.
   - Log every call to a ToolLog: tool, args, durationMs, resultIds, numbers, dates,
     truncated, error.
   - Assert after each call that every returned id belongs to ctx.workspaceId.
   - Refactor P6's DeterministicAnswerService to call impact_of/aggregate internally
     so both paths produce identical numbers. P6 output must not change.
4. Tool specs: ask/tools/specs.ts with the JSON schemas from spec §2.3 (provider-
   neutral), derived from the same source as the zod validators.
5. Metamodel prompt: save the §1 text as ask/prompt/metamodel.template.md (keep it a
   template; don't edit the rules). Write ask/prompt/build-metamodel.ts to generate
   ask/prompt/metamodel.generated.md from relations.ts (OBJECT_TYPES and RELATIONSHIPS
   filled in; placeholders ORG_NAME/TODAY/CURRENCY stay for runtime). Add an npm
   script and a unit test that fails if the generated file is stale.
6. Dev fixture and seed: transcribe spec §7.2 into ask/eval/fixtures/meridian.ts
   (mapped to the real tables per DISCOVERY.md). Add a seed command (use the repo's
   seed mechanism; otherwise "npm run seed:meridian") that creates the workspace
   "Meridian Fasteners / Ask eval" plus the "Acme Test Co" tenant fixture. Refuse to
   run when NODE_ENV is production. Print the slug -> id map.
7. Unit tests with the repo's test runner, against the seeded fixture with today
   frozen to 2026-09-25: every row of the "Derived facts" table in spec §7.2 (impact of
   AS400/AWS/firewall/Inventory/Salesforce, spend totals, renewal windows, no-owner
   list, capabilities without applications). Also: search_records("AS/400") finds
   AS400, "database" returns both stores, and no tool ever returns an Acme id.

ACCEPTANCE
- All tool unit tests pass; the derived facts match the spec exactly.
- P6 answers are unchanged (same text, same citations) on the seeded workspace.
- metamodel.generated.md lists only relations that exist in the schema, with plain
  words and direction; the template is unchanged.
- No LLM SDK, no network call to any AI provider, no API keys, no schema change.

DO NOT
- Add any provider SDK or package (ask me first if you think one is needed).
- Give any tool SQL passthrough, raw query strings, or write access.
- Return full DB rows, emails, phone numbers, or other workspaces' data.
- Hard-code the relationship list in the prompt instead of generating it.
```

#### Prompt 7b: Provider wrapper, orchestration loop, validation, UI wiring

Attach: `02-ask-answer.png`. Mention `@docs/design/ASK-GROUNDING-SPEC.md` and `@docs/design/DISCOVERY.md`.

```text
Read docs/design/ASK-GROUNDING-SPEC.md sections 3, 4, 5, 6, and 8, and the 7a code
(ask/tools, ask/graph, ask/prompt). Behind ask.llm.v1 (off by default).

BEFORE WRITING CODE, ask me:
- Which LLM provider and model to use, and whether I approve adding that provider's
  SDK (or should the adapter use plain fetch to its HTTP API?).
- Where to store the audit log (spec §6.5): an existing audit mechanism from
  DISCOVERY.md, or a new ask_turns table. Don't add a table unless I say yes.
Wait for my answers.

1. Provider-agnostic wrapper (spec §3.1): ask/llm/provider.ts (LLMProvider with chat
   and optional chatStream, ChatRequest/ChatResponse with tools and responseSchema),
   ask/llm/registry.ts (reads ASK_LLM_PROVIDER, ASK_LLM_MODEL, and the key env var;
   returns null when unset -> LLM path disabled), one adapter for the provider I pick,
   and FakeProvider (scripted) for tests. No provider or model name hard-coded
   anywhere else. Keys server-side only, never logged.
2. Orchestration (spec §3.2): LlmAnswerService implements the P6 AnswerService behind
   the "LLM SEAM". Loop with MAX_TOOL_CALLS 6, MAX_ROUNDS 4, a 20-second turn timeout,
   and a 9-second per-call timeout; temperature 0. System prompt = metamodel.generated.md
   with ORG_NAME/TODAY/CURRENCY filled in. Tool results are wrapped in
   <tool_result name=... call_id=...> blocks (spec §6.2). Settings: ask.llm.mode
   "all" | "unsupported_only". Fallback to DeterministicAnswerService on provider
   error, timeout, budget exhaustion, a second validation failure, or flag off.
   Optional: stream a status line from tool names only, never unvalidated answer text.
3. Answer schema (spec §4): zod + JSON schema for AskLlmAnswer; pass it as
   responseSchema when the adapter supports structured output. Map to AskAnswer with
   the additive fields in §4.2 (paths, confidence, unsupported, needsClarification,
   source; widened recordType; hydrated citation fields).
4. Validation (spec §5): ask/llm/validate.ts, pure. Cited/path/gap ids must be in this
   turn's ToolLog. Markers and citations must match. Every number and date in the text
   must appear in tool results. Uncited factual sentences are not allowed. Flags must
   be consistent. Answers that echo the canary are rejected. Retry once with a
   correction message listing the errors; then fall back. Unit-test every rule,
   including the negative cases (invented id, invented "$120,000", marker without
   citation, canary echo).
5. Hydration + UI (spec §5.4), reusing the P6 components and styles:
   - Citations are hydrated from the DB, and the records table shows any record type
     with its type label and correct /model link (components ->
     /model/applications/{appId}/components/{id}).
   - "How this was worked out" opens an inline panel under the caption with one line
     per path ("AS400 → EDI Gateway (runs on it) → Invoicing (…)") plus the tools used
     in plain words, built from paths + ToolLog.
   - needs_clarification shows the candidate records as chips that re-ask with the
     exact name.
   - unsupported shows "I couldn't find that in your model." plus the suggestions.
   - Loading keeps the P6 skeleton, with the optional status line.
6. Security and limits (spec §6): per-user 30 questions/hour and per-workspace 300/day
   (config, not code), question length <= 500, audit log per turn (ids only, no record
   contents), and a monthly token budget guard.
7. Telemetry (spec §8.3): ask_submitted, ask_tool_called, ask_answer_shown,
   ask_validation_failed, ask_feedback (wire P6's Yes/No), plus ask_rate_limited,
   ask_budget_exceeded, ask_citation_clicked, ask_path_opened. No question text or
   record contents in telemetry.

ACCEPTANCE
- Flag off, or no provider configured: Ask is byte-for-byte the P6 behavior.
- Flag on with FakeProvider: a scripted G01 answer renders with 5 citations, the path
  panel, and gaps. A scripted answer with an invented id or number is rejected,
  retried once, and then falls back to the P6 answer.
- Flag on with the real provider on the seeded "Ask eval" workspace: "What breaks if
  the AS400 goes down?" returns a validated answer whose numbers match impact_of.
- The provider can be swapped by changing env vars only; grep finds no hard-coded
  model/provider names outside the adapter file and .env.example.
- No keys in the client bundle, logs, or audit rows.

DO NOT
- Add a provider SDK or any package before I approve it.
- Show any LLM answer that hasn't passed validation.
- Let the LLM compute numbers (it must use aggregate/impact_of results).
- Store tool results or record contents in the audit log or telemetry.
- Change the Ask layout beyond the path panel, clarification chips, and status line.
```

#### Prompt 7c: Golden eval set + test runner

Attach: nothing. Mention `@docs/design/ASK-GROUNDING-SPEC.md`.

```text
Read docs/design/ASK-GROUNDING-SPEC.md section 7 (all of it) and the 7a/7b code.

GOAL
Turn the golden set into automated tests so we can prove the grounded Ask before
turning ask.llm.v1 on for a real workspace.

1. ask/eval/golden.ts: transcribe ALL 44 cases from spec §7.3 using the GoldenCase
   type (must_cite, must_not_cite, numbers, flags, gaps_include, path_any_of,
   must_mention, must_not_contain, max_citations, tools_any_of). Use fixture slugs;
   resolve them through the seed's slug -> id map at runtime.
2. ask/eval/scripts/G01.json ... G44.json: FakeProvider scripts (the tool plan and a
   correct final AskLlmAnswer) for every case, written against the real tool outputs
   on the seeded fixture (generate them with a helper that runs the tools, then commit
   the JSON). Add 4 negative scripts that validation must reject (invented id,
   invented number, marker without citation, canary echo).
3. ask/eval/run.ts, with a script "npm run ask:eval -- --provider=fake|live
   [--case=G01] [--json out.json]":
   - Seed a fresh fixture workspace plus the Acme tenant, and freeze today to 2026-09-25.
   - Call LlmAnswerService.answer() exactly like the route handler does.
   - Per-case checks and global checks from spec §7.4 (citations ⊆ Meridian ids,
     numbers grounded by re-running the validator, unsupported/needs_clarification
     flags, no canary text, <= 6 tool calls).
   - Print a results table and a summary (pass rate per category, validation-failure
     rate, fallback rate, p50/p95 latency, tokens); optionally write JSON.
4. CI: run --provider=fake in the repo's test pipeline, and require 44/44 plus all
   negative scripts rejected. --provider=live is manual only, needs env keys, and
   never runs in CI unless I opt in.
5. Document the commands (PowerShell) at the top of ask/eval/README.md, including how
   to reseed and how to run one case.

ACCEPTANCE
- npm run ask:eval -- --provider=fake passes 44/44, and the 4 negative scripts are rejected.
- Breaking a tool (e.g. changing impact tie-break) makes the relevant cases fail
  with a clear message.
- A live run prints the table and summary. Tenant (G43) and injection (G44) must pass.

DO NOT
- Loosen a golden expectation to make a test pass without telling me why.
- Call a live provider from CI or commit any key.
- Add an eval framework or package without asking.
```

**After P7:** turn `ask.llm.v1` on only for the "Ask eval" workspace, run the live eval, read 50 audit-log turns, then follow the rollout steps in `ASK-GROUNDING-SPEC.md` §8.2.

---

## 4. Fidelity checklist

Open the mockup (`docs/design/bubomap-ui.html#/...`) and the app (`localhost:3001/...`) side by side at the same window size (1440×900 matches the screenshots). If Cursor has a browser tool, ask it: *"Open docs/design/bubomap-ui.html#/model/infrastructure and localhost:3001/model/infrastructure side by side at 1440x900, screenshot both, and list every visual difference."* Do the same for each route below.

**All screens (top bar)**
- [ ] 56px, `#0f172a`, orange logo, "BuboMap" + "beta", breadcrumb with the real org/workspace
- [ ] Tabs Ask / Reports / Model / Views; active one is filled `#5b4ce6`
- [ ] Search 340px, "Ask or jump to...", "Ctrl K"; Ctrl+K focuses it; dropdown groups Ask / Jump to / Reports
- [ ] No "Prototype · example data" tag anywhere
- [ ] Flag off: old UI is back, unchanged

**01 Ask home** (`#/ask` vs `/ask`)
- [ ] Pill, 34px heading "What do you want to know?", lede with real counts
- [ ] 60px search, radius 16, "Ask →" button, 6 chips centered and wrapping
- [ ] "Popular reports" with 4 tiles; model health card with ring, amber "Fill missing →"

**02 Ask answer** (`#/ask/answer?q=What%20breaks%20if%20the%20AS400%20goes%20down%3F` vs `/ask?q=...`)
- [ ] Sticky question bar; "ANSWER" label in accent; 17.5px paragraph; citation badges
- [ ] Caption with records and gaps count; "Based on these records" table with 7 columns
- [ ] Amber "No owner · Add"; "indirect" pill; Gaps box colors; action buttons; "Ask next" chips
- [ ] Every citation and row opens the right record in /model

**03 Reports** (`#/reports`)
- [ ] Sidebar categories with counts and refresh note; header with "Ask a new question"
- [ ] 4-column grid, 8 cards, colored icon tiles, big number + small suffix, "Updated ..."
- [ ] Hover: border `#c7c2fb`, 1px lift

**04 Report detail** (`#/reports/spend`)
- [ ] Breadcrumb header, "Save view", primary "Export"
- [ ] Summary sentence, 4 KPIs (the last one amber), filter row with count on the right
- [ ] SVG bars: top 3 `#5b4ce6`, others `#a5a0f3`, percentages in grey
- [ ] Table with "{n} missing" headers, amber "+ Add", "within 90 days" pill, footer total

**05 Model table** (`#/model/infrastructure`; the mockup now redirects to `#/model/servers`. For the split lists use CURSOR-INFRA-INSTRUCTIONS §3, shots 19–20)
- [ ] Sidebar: "Your estate" group (6 items, always open), then "Architecture" group with a chevron and total (Capabilities, Processes, Roadmaps, APIs & events, Data with Entities / Stores / Domains indented); active item accent with a light left border; completeness card
- [ ] Empty sections show a muted 0 and a one-line hint (mockup: Domains "Groups of related entities"); nothing is hidden; no Products, Components, or Advanced entry
- [ ] Collapse Architecture, reload: it stays collapsed; open an Architecture route: it expands
- [ ] Eyebrow "Where things run", title, "{n} records", "Fill missing ({n})", "Add"
- [ ] Toolbar order: search, 3 selects, Missing fields, Table/Cards toggle
- [ ] Type chips with counts; 8 columns in order; amber blanks; "{n} missing" under headers
- [ ] 46px rows, 44px header, footer text and tracked cost; sort arrows work; cards view works

**06 Model detail** (`#/model/infrastructure/as400` → `#/model/servers/as400`; runtime panel per shot 21)
- [ ] 470px panel with scrim; selected row tinted; Esc/X/scrim close it
- [ ] Header chips including "{n} missing"; tabs Details / Tech debt {n} / History
- [ ] Sections Hosting, Contract, Governance, Depends on this, in that order, with exact labels
- [ ] Amber dashed "Add ..." prompts; "Suggested: IBM · Accept · Dismiss" (after P4)
- [ ] "Updated by ..." footer; edits save and show up in History

**07 Application components** (`#/model/applications/order-entry?sec=components`)
- [ ] Components section after "Depends on this" with "{n} parts", cube-icon cards ("{kind} · Runs on {X}", lifecycle pill, chevron), "Add component" button
- [ ] Empty state copy; Add component presets the parent

**08 Component detail** (`#/model/applications/order-entry/components/oe-api`)
- [ ] "← Back to {application}" link, "Component of {application} · {kind}", chips, Part of / Hosting / Governance / Description sections
- [ ] Top-bar search finds components ("Component · {application}")
- [ ] `#/model/components` and `#/model/products` redirect (Applications, Roadmaps)

**Cost (shots 14–18, `cost.lines.v1`):** the full checklist is in CURSOR-COST-INSTRUCTIONS.md §3. Two changes to the rows above when that flag is on:
- [ ] 05/06: the 06 panel's "Contract" section becomes "Vendor" + "Cost" (COST-SPEC §7.3); the table gains "Annual cost (US$)" with a footer total on **both** Applications and Infrastructure
- [ ] Infrastructure (and Applications) table at 1280×800: no horizontal scroll with the Annual cost column (COST-SPEC §7.6; this was broken in the mockup review)

---

## 5. If Cursor drifts

Paste the one that fits into the same chat.

**It's inventing things about the codebase**
```text
Stop. Don't assume anything about this repo. Re-read docs/design/DISCOVERY.md and
use only the files, components, and fields it lists. If something you need isn't
there, tell me what you'd need and wait.
```

**It changed the schema in a UI phase**
```text
This phase must not change the database schema. Revert every schema, migration, and
model change you made, and show missing fields as "Coming soon" instead.
```

**It added a library**
```text
Remove the package you just added and undo the lockfile change. Build it with what
the repo already has (see DISCOVERY.md section 4). If you think a library is really
needed, explain why and wait for my answer.
```

**It broke the flag-off UI**
```text
With repository.mvp.v1 off, the app must render exactly as it did before this branch.
Find every place you changed shared components or styles, gate the new behavior
behind the flag or move it into new components, and show me the flag-off diff.
```

**The copy doesn't match**
```text
Use the exact strings from docs/design/bubomap-ui.html and the prompt, character for
character (including "·", "→", and "&"). List every user-visible string you added,
next to the mockup string it should match, and fix any that differ.
```

**It looks close but not right**
```text
Compare your screen with docs/design/shots/{NN}.png at 1440x900. Check the CSS in the
mockup for the exact values: heights, padding, font sizes and weights, radii, and hex
colors (section 2 of CURSOR-UI-INSTRUCTIONS.md). List each difference with the mockup
value and the current value, then fix them.
```

**It used mockup data**
```text
Nothing from the mockup's example data (Meridian Fasteners records, AS400,
$107,820, Salesforce, etc.) may be hard-coded. Search the diff for those strings and
replace them with values computed from the real workspace.
```

**It's doing too much at once**
```text
Only do what this phase's prompt asks for. Undo anything that belongs to a later
phase and list it as a TODO at the end of your reply instead.
```

**P7: it answered from memory or did its own math**
```text
The AI must never answer from memory or compute numbers itself. Re-read
docs/design/ASK-GROUNDING-SPEC.md sections 0, 2.4, and 5. Every fact must come from a
tool result in the same turn, every number must come from aggregate or impact_of, and
the validator must reject anything else. Show me the failing validator test first,
then fix the code, not the test.
```

**P7: it wants to add an SDK or hard-code a model**
```text
Don't add any package until I approve it, and don't hard-code a provider or model
name. Put provider-specific code in one adapter behind the LLMProvider interface, read
ASK_LLM_PROVIDER / ASK_LLM_MODEL / the key from env vars server-side, and ask me which
provider to use.
```

**Cost: it summed money in the UI or counted a shared cost twice**
```text
All money comes from lib/cost (COST-SPEC.md §5); nothing else parses annual_cost. Remove any totals computed in
components, and make sure shared lines and infrastructure share are never added to
portfolio or vendor totals (shares are allocated, not added). More: CURSOR-COST-INSTRUCTIONS.md §4.
```

**It ignored the mockup layout and reused the old component as-is**
```text
Reuse the old component's data and logic, but the layout and styling must match the
mockup. Keep the data hooks and rebuild the markup to match the mockup's structure
for this screen.
```

---

## 6. Notes and assumptions

- The mockup uses `/model/...` routes. The spec's placeholder routes use `/repository/...`. This kit goes with `/model/...` (mockup wins); redirects cover the old paths.
- The mockup's nav labels are "Vendors & contracts" and "Owners & teams"; the spec says "Vendors and contracts" and "Owners and teams". This kit uses the mockup labels.
- Navigation (decided Sep 27, 2026): two groups replace the collapsed "Advanced" group. "Your estate" (always open): Overview, Applications, Infrastructure, Connections, Vendors & contracts, Owners & teams (updated Sep 30, 2026: Infrastructure becomes Platforms & cloud + Servers & devices, INFRA-SPEC §3). "Architecture" (shown, collapsible, open/closed remembered per user in localStorage, default open): Capabilities, Processes, Roadmaps, APIs & events, Data (Entities, Stores, Domains). Nothing is hidden: empty sections show a muted 0 and a one-line purpose hint. This replaces the spec's old "hide empty Advanced sections" rule (REPOSITORY-MVP-SPEC §6.1 is updated to match).
- Products is removed from the nav, and its routes redirect to Roadmaps. The records aren't deleted.
- Components are no longer a nav item. They appear as a Components section inside an application's detail panel, with "Add component". They stay real records with their own detail view (`/model/applications/{appId}/components/{id}`), are findable in global search and by Ask, and old Components routes redirect to Applications (or the parent application).
- APIs & events are placed under Architecture. The alternative is to nest them under Connections (as the spec's Connections "Advanced" kind chips). The nav config lives in one file so the move is a one-line change.
- Nav labels use sentence case after "&" to match "Vendors & contracts" ("APIs & events", not "APIs & Events"). Change it in the nav config if you prefer.
- "Business" and "Strategy" no longer appear as nav labels. Capabilities and Processes (Business) and Roadmaps (Strategy) are listed directly.
- The mockup's example counts for the Architecture group (7 capabilities, 4 processes, 4 roadmap items, 2 APIs + 2 events, 5 entities, 3 stores, 0 domains) come from the Meridian eval fixture in `ASK-GROUNDING-SPEC.md` §7.2. The mockup's application "Depends on this" lists follow that fixture's 11 flows.
- The mockup's "72% complete" and its 9 missing fields don't come from the same formula. Compute both with the spec's formula; the real numbers will differ.
- Only Applications, Infrastructure, Overview, the detail panel (including application Components and the component detail view), Reports, Spend by vendor, and Ask are designed. The Architecture pages reuse the existing app pages inside the new shell. Connections, Vendors & contracts, and Owners & teams tables (spec §8.2, §8.7), bulk fill (spec §8.5), the migration review banner (spec §8.6), the full Overview panels (spec §8.1), and the other 7 report pages are follow-ups.
- New copy that isn't in the mockup, and that you can change: "Coming soon", "not tracked yet", "This report is coming soon.", "I can't answer that yet. Try one of these:", the generalized "because it depends on {C}", and P7's "I couldn't find that in your model." and "Ask is busy. This answer uses the built-in reports."
- Cost lines (`cost.lines.v1`) are a separate prompt set, CURSOR-COST-INSTRUCTIONS.md (C0–C6b, optional C2b), with its own spec COST-SPEC.md v2. They are stored in `properties.cost_lines`; `properties.annual_cost` stays as the derived legacy total. P4 must not add cost fields.
- P7 is a full phase: grounded Ask with tools, server-side validation, and a 44-question eval set, split into 7a/7b/7c. The P6 contract is widened additively (paths, confidence, unsupported, needsClarification, source), so the P6 UI keeps working. The provider is chosen in 7b, and nothing is hard-coded.
