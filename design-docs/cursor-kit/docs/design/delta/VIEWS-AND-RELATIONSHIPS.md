# Delta: Views first, then the relationships they need (self-contained Cursor prompts)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001). Run `INFRA-FIXES.md` first.
- Objects keep attributes in a `properties` JSON blob; owner is a real column.
- Relationships are edges whose types are configured in `relationshipImpactRules`. That one config holds each type, its inverse label and its failure rule, and these all read it: `impact_of` (BFS, depth 4, both directions, severity `direct | degraded | loses_support`), the "Depends on this" panel, reports and the Ask metamodel prompt.
- Existing types include `runs_on`, `built_on`, `part_of`, `supports`, `calls` and `replaces` (confirm in V0). Traversal never hard-codes type names.

Shots (1280 wide; in `shots/` next to this file, or `docs/design/shots/` in the full kit): `31-locations.png`, `32-view-impact.png`, `33-view-data-flow.png`, `34-view-hosting-location.png`.

## Principle

- Each view answers ONE question a CTO asks, with a fixed layout. Nobody arranges boxes.
- Users create relationships from inside the view, in plain words ("Something else runs on it", "What does Order Entry send to Invoicing?", dragging an app onto a server). They never pick a relationship type; the view knows it.
- Each view shows its own gaps as a short to-do list next to the picture.
- A relationship type exists only if a view needs it. The generic Estate map is optional and secondary (later, if at all).

## The six views

| # | View: question | Fixed layout | Relationships it reads/creates | Gaps (to-do) |
|---|---|---|---|---|
| 1 | Impact: "What happens if X goes down?" (shot 32) | Vertical chain, bottom to top: the failed item → infra that goes with it → apps that stop → apps that slow down → capabilities hit → teams to call | runs_on / hosted_on, built_on, part_of, supports, calls (shown as "depends on" only if you later agree; stored type stays `calls`), located_at | Apps in the chain with no owner, criticality not set, item out of support, "Is this list complete?" confirm |
| 2 | Data flow: "How does our data move?" (shot 33) | Apps left → right, arrows labelled what + how · frequency; external parties at the edge | **NEW** sends_data_to {what, how, frequency}, created by dragging an arrow, then "What does it send?" | Apps with no flows ("3 apps have no flows recorded"), flows that are manual / file drops |
| 3 | Hosting & location: "Where does everything live?" (shot 34) | Grouped boxes: Location › server/device › VMs › apps, plus a "Cloud & SaaS" place (platforms › their apps; vendor-hosted SaaS) | **NEW** located_at; runs_on / built_on, created by dragging an app into a box | "Apps with no home", "Servers with no location" |
| 4 | Vendors: "Who do we depend on?" | Vendors by category with spend and renewals | none (vendor field + cost module) | Records with no vendor, renewals without notice |
| 5 | Roadmap: "What's our plan?" | Lanes by quarter: what replaces what | replaces (existing) | Retiring items with nothing replacing them |
| 6 | Protection: "How are we protected?" (**phase 2**) | Servers grouped by backup target; what sits behind each firewall | **NEW, light** backed_up_to, protected_by (replaces the earlier connects_through idea) | "No backup recorded" |

Later: `failover_for` (would downgrade impact to degraded). Not built now.

## Relationship table (only types a view needs)

| Type | Inverse label | Allowed source → target | Failure rule | Views | Status |
|---|---|---|---|---|---|
| runs_on (or hosted_on, per V0) | hosts | app, component, platform, runtime → platform, runtime (VM on host allowed) | target fails → source direct | Impact, Hosting | have it (extend infra → infra) |
| built_on | is the base for | app, platform → platform | target fails → source direct | Impact, Hosting | have it |
| part_of | has part | component → app | part fails → app direct | Impact | have it |
| supports | is supported by | app → capability | app fails → capability loses_support | Impact | have it |
| calls (label "depends on" in Impact, if agreed) | is needed by | app → app | keep its existing rule | Impact | have it; don't rename |
| sends_data_to | gets data from | app, platform, external party → app, platform, external party | **none by default**; opt-in per workspace: source fails → target degraded, "stops receiving data" | Data flow | new |
| located_at | houses | runtime, platform → location | location fails → everything there direct | Hosting, Impact | new |
| replaces | is replaced by | app → app, platform → platform, runtime → runtime | none | Roadmap | have it |
| backed_up_to | holds backups of | runtime, platform, app → runtime, platform | none | Protection | new (phase 2) |
| protected_by | protects | app, runtime → runtime (network device) | none | Protection | new (phase 2) |
| failover_for | fails over to | runtime, platform → runtime, platform | none itself; downgrades X's dependents | (Impact) | later |

`sends_data_to` properties: `what` (free text, or a data entity if that type exists), `how` (`api | file | manual | integration_tool`), `frequency` (`realtime | daily | ad_hoc`).

## Location object type

- Prefer the existing objects table with type `location`. Check in V0 how types are registered; add no table unless the registry requires one.
- Fields: `name`, `location_type` (`office | data_center | colo | cloud_region | other`), `address` (optional). Owner is the normal owner column.
- Every location field uses one type-ahead picker. Its last item is "Create '<text>'", so the list grows as people type.
- A small nav item "Locations" goes under Your estate, below Servers & devices (shot 31): Name, Type, Address, Items there, Apps affected, Owner. Clicking a row opens the Impact view for that location.
- Migrate existing free-text `properties.location` values on runtimes with a dry run first. Dedupe case-insensitively and trimmed, and keep the old key read-only.

**Every phase:** show the diff before committing, keep the changes behind the existing infra flag (flag off: as today), and end with the tests passing plus a 3-line "how to check". Every DO NOT list also includes: no generic map first, and no new relationship type without a view that uses it.

## V0: discovery (read-only)

```text
Read-only. Report with file paths and short excerpts:
1. relationshipImpactRules: location, shape, every reader. Which of runs_on/hosted_on, built_on,
   part_of, supports, calls, replaces exist; their stored names, inverse labels, failure rules.
2. How relationships are stored and created (table, uniqueness, properties on edges?).
3. How object types are registered; what type 'location' needs; whether an external party /
   organization type exists for data flow endpoints.
4. Distinct runtime properties.location values with counts (case-insensitive).
5. Existing views/diagram pages and graph/layout libraries in package.json.
Change nothing. End with open questions.
DO NOT write code or migrations in this step.
```

## V1: plan, then WAIT

```text
From V0, write the plan for V2-V8: config entries, the location type, migration, each view's
components and data queries, tests, files touched. Say which existing types you reuse and confirm
we add ONLY sends_data_to and located_at now (backed_up_to / protected_by in V7). WAIT for my OK.
DO NOT start coding before the OK.
```

## V2: config entries + impact tests

```text
Add to relationshipImpactRules: located_at (inverse "houses", location fails -> direct) and
sends_data_to (inverse "gets data from", propagate: false by default; when a workspace opts in:
source fails -> target degraded, text "stops receiving data"). Add allowedSource/allowedTarget per
type and the edge property schema for sends_data_to (what, how enum, frequency enum), validated on
the server. Allow runs_on infra -> infra.
TESTS: Fremont plant <- AS400 (located_at) <- Order Entry, Inventory, EDI Gateway (runs_on):
impact_of(Fremont) lists all four with paths ("Fremont plant -> AS400 -> Order Entry").
A VM runs_on a host: host fails -> VM and its apps direct. sends_data_to adds NOTHING to impact_of
by default; with opt-in the target is degraded with "stops receiving data". Bad enum -> 400.
DO NOT add types no view needs, rename calls, or put type names in traversal code.
```

## V3: Locations

```text
Register type 'location'; build the type-ahead picker with inline "Create '<text>'"; add the
Locations nav item and table (shot 31). Migration: DRY RUN prints value -> location, dedupes, and
lists the edges to create and the rows skipped. WAIT for OK, then one audited transaction. Keep
properties.location read-only ("Was: <text>"). Re-running creates nothing.
ACCEPTANCE: "fremont plant" and "Fremont Plant " become one location; counts match the dry run.
DO NOT delete the old key or add a new table if objects can hold locations.
```

## V4: Impact view

```text
Views -> Impact (shot 32). Title "What happens if [record picker] goes down?". Bands bottom to
top: Goes down, Infrastructure that goes with it, Apps that stop (direct), Apps that slow down
(degraded), Capabilities hit (loses_support), Teams to call (owners of affected apps; "No owner"
boxes in amber). Lines show why each item is hit; hover shows the full path. Data: ONE impact_of
call. Plain-words adds: "+ Something else runs on it" (creates runs_on), "+ Another app needs one"
(creates calls). To-do: no owner, criticality not set, out of support, "Is this list complete?"
(stores a confirmed-at date). Deep link ?sel=<id>.
ACCEPTANCE: AS400 -> Order Entry, Inventory, EDI Gateway stop; Invoicing slows down; Order
management, Inventory management, Billing & accounting hit; Sales Ops, Finance, Operations + "No
owner: EDI Gateway". Fremont plant also lists AS400, HV01 and its VMs.
DO NOT compute impact in the client or show a free-form graph.
```

## V5: Data flow view

```text
Views -> Data flow (shot 33). Apps and platforms that have flows, laid out left -> right by flow
order (layered layout; reuse an existing library if present), arrows labelled "what" over
"how · frequency". External parties sit at the edge in grey. To add: drag from one app to another;
on drop ask "What does <A> send to <B>?" (what, how chips, frequency chips; Save creates
sends_data_to). Click an arrow to edit or delete it. A tray lists apps with no flows. To-do:
"{n} apps have no flows recorded" (or mark an app "No integrations"), manual/file flows,
unowned apps that move data.
ACCEPTANCE: Shopify -> Order Entry (web orders), Order Entry -> EDI Gateway -> customers,
Salesforce -> QuickBooks (invoices) appear with labels; the gap count equals apps with no edge.
DO NOT reuse calls as data flow, or let a flow change impact_of unless opted in.
```

## V6: Hosting & location view

```text
Views -> Hosting & location (shot 34). One box per location: its servers/devices
(located_at), VMs nested under hosts (runs_on), app chips on each (runs_on/built_on). One "Cloud &
SaaS" box: platforms with their runtimes and apps, plus vendor-hosted SaaS apps. Drag an app
chip into a box to create runs_on (confirm "Shop Floor Label Printing runs on Plant PC?"). To-do:
"Apps with no home" (on_premise/hybrid apps with no runs_on/built_on) and "Servers with no
location" (no located_at and not on a platform).
ACCEPTANCE: Fremont plant shows AS400 (Order Entry, Inventory, EDI Gateway) and HV01 (FS01,
RDS01); Sacramento colo shows NAS01; the gap lists Shop Floor Label Printing; one query per box.
DO NOT use hosting_model or free-text location to place things (gaps only).
```

## V7: Protection (phase 2)

```text
Add backed_up_to and protected_by (no failure propagation). Protection view: servers grouped by
backup target, items behind each firewall; to-do "No backup recorded" for on-prem runtimes.
ACCEPTANCE: impact_of results unchanged after adding these edges.
DO NOT propagate failure through them or bring back connects_through.
```

## V8: Ask

```text
The metamodel prompt lists types from config. Ask answers one question per view with citations:
"What breaks if the AS400 goes down?", "What does Order Entry send, and to whom?", "What's at the
Fremont plant?", "Which apps have no home?", "What has no backup recorded?" (after V7). Gap answers
reuse each view's to-do query.
DO NOT let the LLM invent relationships or compute impact.
```

**Check:** compare with shots 31–34 at 1280 wide. Notes: example data is fictional (Meridian). HV01 is an invented Hyper-V host. The prototype's sends_data_to arrows don't affect impact.
