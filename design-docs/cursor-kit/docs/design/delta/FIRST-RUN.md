# Delta: First login for a new workspace (self-contained Cursor prompt)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001).
- Objects keep attributes in `properties`; owner is a real column. Hosting comes only from `runs_on` / `built_on` relationships. Money comes from `lib/cost/` (cost lines with `source: 'Estimate'` for typical prices).
- Header (already in the app): Ask · Model · Views · Reports, bell, help, avatar, no search box. Ctrl K focuses the Ask box.
- Views › Impact already has the opening state from `VIEWS-OPENING.md` (default = riskiest record, cards, to-do, `?demo=empty` example data). **Run this after VIEWS-OPENING.md.**
- This supersedes the inventory-first parts of `ONBOARDING-DAY1-SPEC.md` (if it's in your repo): the `/onboarding` gate/redirect, S0 intent, the S1 seed chooser and the S3 category-list "aha". Its category synonyms (Appendix A) and the Quick Add reuse still apply.

Shots (1280 wide; `shots/` next to this file, or `docs/design/shots/` in the full kit):
- `38-firstrun-ask-empty.png`: Ask home, new workspace.
- `39-firstrun-paste-matched.png`: the typed list, matched.
- `40-firstrun-where-it-lives.png`: where each one lives.
- `41-firstrun-owners-renewals.png`: owners & renewals (optional).
- `42-firstrun-map-ready.png`: Views › Impact with their own data.
- `43-firstrun-reports-before-minimum.png`: Reports before the minimum.

```text
GOAL: a brand-new workspace (0 records) lands on Ask and gets to its own impact map in a few
minutes. No hard redirects, no mandatory fields, plain words (apps, servers, owners, renewals;
never "architecture", "capability model", "metamodel", "landscape"). Behind a flag
(firstrun.v1; flag off = today).

0. FIRST, read-only: show the Ask home component, how a workspace's app / server / relationship
   counts can be read cheaply, any existing onboarding gate or redirect, where user/workspace
   settings JSON lives, the Quick Add / object create path, and any existing vendor or tool
   catalog. Plan + file list, then WAIT for my OK. After OK, show the diff before each commit.

1. Minimum rule, ONE config constant (e.g. lib/setup/setupMin.ts):
   SETUP_MIN = { apps: 5, hostingLinks: 1 }  // hostingLinks = runs_on or built_on edges
   setupState(workspace) -> { apps, hostingLinks, met: boolean }, one server query, used by Ask,
   Views, Reports and Model. Nothing else hard-codes 5 or 1.
2. Ask home before the minimum (shot 38): the setup panel replaces the stats/Popular/Aging home.
   "What runs your business?", one paste/type box (commas or new lines), Continue, "Load sample
   company", "Skip for now". Below: 3 small step cards and "Then you'll see what breaks if your
   most important server goes down."
3. Step 1 matching (shot 39): split, trim, dedupe; match each item against a static tool catalog
   (lib/catalog/tools.json: name, aliases, vendor, category, default hosting saas|own|either,
   kind app|server, typical price + unit). Order: exact alias (case/punctuation-insensitive) ->
   prefix/token -> fuzzy (trigram >= 0.6 or edit distance <= 2) -> several hits = "Pick one"
   chips -> one weak hit = "Is it X?" -> no hit = Custom with a "We built it ourselves" toggle
   (properties.is_custom_built). kind=server items become server stubs for step 2, not apps.
   Prefill vendor, category and a typical cost line (source 'Estimate', marked "typical"). No
   LLM needed. Create records only when the user presses Next.
4. Step 2 "Where does each one live?" (shot 40): per app SaaS (cloud) / Our server / Don't know,
   defaulted from the catalog. "Our server" opens ONE shared server picker (type-ahead over
   servers incl. stubs from step 1, + "New server '<text>'"), so several apps share a server.
   Saving creates the server stub (Servers & devices), the runs_on edge and, if "Where is it?"
   is filled, a location stub + located_at. "Don't know" creates nothing and stays a gap.
   A meter shows "{n} apps · {m} apps linked to a server" against SETUP_MIN.
5. Step 3 owners & renewals (shot 41): one table (owner team, named owner, renewal date, yearly
   cost), only empty cells highlighted, all optional, "Skip for now" always visible. Writes go
   through the normal audited update.
6. Payoff (shot 42): when the minimum is first met, go to Views > Impact with the workspace's
   riskiest record preselected (the VIEWS-OPENING rule; a location holding a single item is
   replaced by that item). Show a dismissible "Your map is ready" strip with counts and ONE Ask
   chip "What breaks if our <name> goes down?". Fewer than 4 candidates: add a dashed "Add your
   other servers" card. Gaps (no owner, hosting unknown, no backup, support date not set,
   criticality not set) are the existing to-do lists; no separate checklist.
7. Before the minimum, every tab stays open:
   - Views and Reports show the faded example data (the ?demo=empty treatment) with ONE specific
     line from setupState, e.g. "Add 3 more apps and link one to a server to see your reports",
     and "Add apps here", which opens the paste box in place (shot 43).
   - Model shows its empty tables with the same paste box inline.
   - Example data comes from a client fixture and is never written.
8. Skips: store { setupDismissedAt, setupStep } in the per-user-per-workspace settings JSON (the
   onboarding flags of ONBOARDING-DAY1-SPEC §6 if they exist; no new table). After a skip, don't
   reopen the flow on login. Ask keeps one compact setup card until met; never a modal.

TESTS
- setupState: 4 apps + 1 link -> not met; 5 apps + 0 links -> not met; 5 + 1 -> met.
  Changing SETUP_MIN changes Ask/Views/Reports behaviour (no other literal).
- Matcher: "M365" -> Microsoft 365; "quickbooks" -> QuickBooks Online; "AS400" -> server;
  "EDI" -> pick-one; "Order Entry" -> custom; duplicates collapse; nothing saved before Next.
- Step 2: two apps choosing the same server create ONE server and two runs_on edges.
- Skip: dismissed state persists across reloads/devices; no redirect after login, ever.
- Before minimum: Views/Reports render example data with the computed missing line; the
  example fixture makes no write calls.
- Payoff: after the minimum, Impact preselects the riskiest record; the Ask chip names it.

ACCEPTANCE (prototype: "Harbor Tool & Die", typed "Salesforce, QuickBooks, M365, AS400, Order
Entry, EDI, Shopify, label printing")
- Shot 39: 8 items = 7 apps + 1 server; 4 matched, AS400 as a server, Order Entry custom, EDI "Pick one",
  label printing "Is it BarTender?".
- Shot 40: 4 SaaS from the catalog; Order Entry and EDI on AS400 (shared picker); Label printing
  "Don't know"; AS400 at "Main plant"; meter met.
- Shot 41: 11 empty cells highlighted; typical costs marked.
- Shot 42: AS400 preselected, 2 apps stop (Order Entry, EDI), 1 team + "No owner: EDI",
  $9,000/yr, badges "1 with no home", "1 with no backup", Ask chip for the AS400.
- Shot 43: Reports faded with "Add 3 more apps and link one to a server to see your reports."
- 1280 wide: no horizontal scroll. Existing workspaces (minimum met) see today's Ask home.

DO NOT
- Redirect to Model or /onboarding, block any tab, or show a modal on login.
- Make any field mandatory, or use EA words in the flow.
- Persist sample/example data, call an LLM for matching, or add tables.
- Hard-code the minimum anywhere but SETUP_MIN, or build a separate gap checklist.
```
