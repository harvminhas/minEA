# Delta: Add anywhere, the one add flow (self-contained Cursor prompt)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001).
- **Run this after FIRST-RUN.md is applied** (FIRST-RUN.md itself runs after VIEWS-OPENING.md). It assumes both are in the code and doesn't change either doc.
- From FIRST-RUN.md, reuse these by name; don't copy them:
  - the catalog matcher (`lib/catalog/tools.json` and its alias → prefix/token → fuzzy → "Pick one" / "Is it X?" / Custom order);
  - the review table (step 1);
  - the where-it-lives step with its shared server picker (step 2);
  - the owners & renewals pass (step 3);
  - `SETUP_MIN` / `setupState`;
  - the `firstrun.v1` flag;
  - the setup settings JSON.
- Header (already in the app): Ask · Model · Views · Reports, bell, help, avatar. There is no search box and no split. Ctrl K focuses the Ask box.
- This makes the first-run paste-and-match flow **the** add flow everywhere after setup too. Existing "Add" buttons that open a form, a toast or a placeholder are moved onto it. The Servers & devices quick-add row becomes the compact one-item mode of the same flow, not a second form.

Shots (1280 wide; `shots/` next to this file, or `docs/design/shots/` in the full kit; workspace = Meridian Fasteners, after setup):
- `44-add-from-ask.png`: "add Zoom, HubSpot and NetSuite" in the Ask bar; the review appears inline where answers render, including one "Already have this" row.
- `45-add-button-model.png`: "+ Add" on Model › Applications opens the same box in place, kind preset to App; one item = one compact row.
- `46-add-confirmation.png`: confirmation strip with Undo, plus the new to-dos.

```text
GOAL: one way to add things, anywhere: type or paste names, we match them, ask only what's
needed, save. Same components as first run. No second add form, no modals, no mandatory fields,
plain words (apps, servers, owners, renewals; never "architecture", "capability model",
"metamodel", "landscape"). Behind a flag addanywhere.v1, which requires firstrun.v1
(flag off = today).

0. FIRST, read-only: show where FIRST-RUN's matcher, review table, where-it-lives step, owners
   pass and setup settings ended up (file + exported names); the Ask intent layer
   (answerStrategies.ts) and how a strategy renders into the answer area; every current "Add" entry
   point (Model page headers, Servers & devices quick-add row, Views "Add your other servers" card,
   empty-state buttons); the object create path and how audit/undo works today. Also confirm
   whether the default-selection rule in step 9 is already in the code. Plan + file list, then WAIT
   for my OK. After OK, show the diff before each commit.

1. Extract, don't fork: if FIRST-RUN put the steps inside the setup panel, move them into one
   component, e.g. components/add/AddFlow.tsx, with props
   { kind?: 'app'|'platform'|'server'|'location'|'vendor', initialText?, compact?, origin }.
   The setup panel renders AddFlow, so first run looks exactly as before (shots 38-41 unchanged).

2. Ask intent "add" in answerStrategies.ts (deterministic, no LLM), checked before the
   question strategies:
   a) leading "add", "new" or "+" (case-insensitive) -> add;
   b) otherwise, if it ends with "?" or starts with a question word (what who which when where
      why how is are does do can should show list) -> question (today's behaviour);
   c) otherwise split on commas, new lines, ";", " and ", "&". If 2+ items and >= 60% are
      known names (catalog name/alias OR an existing record name/alias) -> add;
   d) 2+ items with some known names but under 60% -> ambiguous: one inline line "Is this a list of
      things to add, or a question?" [Add these as apps] [Ask about them];
   e) anything else -> question.
   Put the 60% and the question-word list in the same constants file as SETUP_MIN.
   The add intent renders AddFlow inline in the answer area under the Ask bar (shot 44), with a
   "Read as a list of apps · Ask about them instead" line that switches to the question path.

3. "+ Add" entry points, each opening AddFlow in place (inline panel, not a modal or new route):
   - next to the Ask bar (inside the bar, left of Ask): puts "add " in the box and focuses it;
   - Model page headers: Applications -> kind app, Platforms & cloud -> platform, Servers &
     devices -> server, Locations -> location, Vendors & contracts -> vendor (shot 45);
   - Views lanes / cards: "Add a server" (the dashed "Add your other servers" card), "Set owners"
     etc. keep their own fill-in links; only "add a record" links open AddFlow with a preset kind.
   Kind chips (App · Platform · Server · Location · Vendor) show the preset and can be changed.
   The matcher still overrides per item (e.g. "AS400" typed under App becomes a server, as in first run).

4. Steps adapt (only ask what's needed):
   - Skip "Where each one lives" when every new item is SaaS per the catalog; show it as a
     skipped step "skipped: all 3 are SaaS" (shot 44). Servers, locations and vendors never get it.
   - One item -> compact: one row with match, the hosting choice (if needed) with the shared
     server picker, owner (optional) and one button "Add app" (shot 45). Pasting 2+ switches to
     the full review table.
   - Owners & renewals: the same pass, only for the new items, all cells optional.
   - Catalog "same category as something you have" (e.g. NetSuite vs QuickBooks Online) shows a
     one-line hint and becomes a to-do ("is one replacing the other?"), never a block.

5. Dedupe rule (no duplicates, ever): before the review, compare each item (normalized: lowercase,
   strip punctuation/edition words like "online", "cloud", "workplace") against existing records
   of the same kind by name, catalog alias, and catalog id stored on the record. A hit shows
   "Already have this", the current owner / cost / lifecycle, and the choice
   [Keep as is] (default) / [Update it?]. Update fills only empty fields from the catalog,
   never overwrites a value the user entered; it goes through the normal audited update.
   Two typed items that match the same catalog entry collapse into one row.

6. Save + confirmation (shot 46): one transaction for all records, edges and estimate cost lines
   (source 'Estimate', marked "typical"). Then a small inline strip where the flow was:
   "Added {n} {kind}s: {names}." plus "{k} still need(s) a home" when any app is "Don't know"
   or unlinked, or "Both are SaaS, so neither needs a home". Undo (removes everything the
   save created, audited, available until the page is left or 10 minutes). No toast-only confirmation.
   Below it: "Your to-do list: {m} new items", taken from the same gap rules as Fill missing and
   the Views to-dos (no owner, no renewal date, unknown hosting, same-category hint); no separate
   checklist.

7. "Your map is ready" stays one-time: show it only on the save that first makes setupState met,
   and record mapReadyShownAt in the setup settings JSON from FIRST-RUN step 8. Any later add,
   or a workspace that already met SETUP_MIN, never shows it again (not after deletes and re-adds either).

8. Remove the old paths: Model header "Add" toasts / placeholder forms, empty-state "Add form
   opens here" buttons, and the separate quick-add row logic now all call AddFlow. Keep
   per-field inline edit ("+ Add" in a blank cell) as it is: that's editing, not adding.

9. Note for VIEWS-OPENING behaviour (check, apply only if missing): when choosing the default
   selection on Views › Impact, a location that holds a single item is replaced by that item
   (FIRST-RUN step 6 mentions it; make sure the selection code really does it for any
   workspace, not only first run). Meridian is unaffected: the default stays Fremont plant (13).

TESTS
- Intent: "add Zoom, HubSpot and NetSuite" -> add; "+ Gusto" -> add; "new server SQL02" -> add;
  "Zoom, Slack, Dropbox" -> add; "Zoom, Contoso widget, Fabrikam" -> ambiguous;
  "What breaks if the AS400 goes down?", "Who owns Salesforce?", "Salesforce",
  "Slack and Teams?" -> question (answers unchanged).
- Dedupe: "HubSpot" with an existing HubSpot -> "Already have this", Keep as is creates nothing;
  Update fills only empty fields; "M365, Microsoft 365" -> one row.
- Steps: all-SaaS add skips where-it-lives; one item renders compact; kind preset from each entry
  point; "AS400" under App still becomes a server.
- Save/undo: one transaction; Undo removes the records, edges and cost lines it created and nothing else.
- Map ready: shown once when setupState first becomes met; never on later adds (mapReadyShownAt set).
- First run (shots 38-41) renders unchanged through the extracted AddFlow.

ACCEPTANCE (prototype, Meridian Fasteners)
- Shot 44: 3 items; Zoom Workplace and Oracle NetSuite "New · matched" with typical costs;
  HubSpot "Already have this · Marketing · Tom Becker · $9,600/yr · Retiring" with Keep as is /
  Update it?; where-it-lives skipped (all SaaS); optional owners table; button "Add 2 apps".
- Shot 45: Model › Applications, "+ Add" panel under the header, kind App, "Plant scheduling"
  not in catalog, We built it ourselves, Our server -> shared picker on HV01, owner optional,
  one button "Add app"; table and its total ($140,270) unchanged below.
- Shot 46: "Added 2 apps: Zoom Workplace, Oracle NetSuite. HubSpot was already in your map";
  Undo; "Your to-do list: 3 new items"; no "Your map is ready".
- 1280 wide: no horizontal scroll. Totals, Ask answers and Views defaults unchanged.

DO NOT
- Build a second add form, a modal, a wizard route, or a separate gap checklist.
- Make any field mandatory, or block saving on owner, cost, hosting or renewal.
- Create a duplicate record, or overwrite a user-entered value from the catalog.
- Re-show "Your map is ready" after the first time, or redirect anywhere after an add.
- Call an LLM for intent or matching, or use EA words in the flow.
- Edit FIRST-RUN.md behaviour beyond extracting AddFlow (shots 38-43 must still match).
```
