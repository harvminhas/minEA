# BuboMap Implementation Audit Checklist

## FIRST-RUN Delta (shots 38-43)

### Minimum Rule & Setup State
- [ ] **FAIL** SETUP_MIN config exists with { apps: 5, hostingLinks: 1 }
- [ ] **FAIL** setupState() function returns { apps, hostingLinks, met: boolean }
- [ ] **FAIL** No other code hard-codes 5 or 1

### Ask Home Before Minimum (shot 38)
- [ ] **FAIL** Setup panel replaces stats when minimum not met
- [ ] **FAIL** Shows "What runs your business?" paste box
- [ ] **FAIL** Shows Continue, "Load sample company", "Skip for now"
- [ ] **FAIL** Shows 3 small step cards below
- [ ] **FAIL** Shows payoff text "Then you'll see what breaks..."

### Step 1: Matching (shot 39)
- [ ] **FAIL** Splits, trims, dedupes input items
- [ ] **FAIL** Matches against lib/catalog/tools.json
- [ ] **FAIL** Uses exact alias → prefix/token → fuzzy → pick one → weak hit → custom
- [ ] **FAIL** Server kind items become server stubs
- [ ] **FAIL** Prefills vendor, category, typical cost with source: 'Estimate'
- [ ] **FAIL** No records created before Next button
- [ ] **FAIL** Acceptance: M365 → Microsoft 365, quickbooks → QuickBooks Online, AS400 → server

### Step 2: Where It Lives (shot 40)
- [ ] **FAIL** Shows per-app SaaS / Our server / Don't know
- [ ] **FAIL** "Our server" opens shared server picker
- [ ] **FAIL** Creates server stub + runs_on edge + location stub if filled
- [ ] **FAIL** Meter shows "{n} apps · {m} apps linked to a server"
- [ ] **FAIL** Multiple apps can share same server

### Step 3: Owners & Renewals (shot 41)
- [ ] **FAIL** Shows table with owner team, named owner, renewal, yearly cost
- [ ] **FAIL** Only empty cells highlighted
- [ ] **FAIL** All optional
- [ ] **FAIL** "Skip for now" always visible

### Payoff (shot 42)
- [ ] **FAIL** When minimum first met, goes to Views › Impact
- [ ] **FAIL** Selects riskiest record (VIEWS-OPENING rule)
- [ ] **FAIL** Shows dismissible "Your map is ready" strip with counts
- [ ] **FAIL** ONE Ask chip "What breaks if our <name> goes down?"
- [ ] **FAIL** If < 4 candidates, adds dashed "Add your other servers" card

### Before Minimum (shot 43)
- [ ] **FAIL** Views shows faded example data with missing line
- [ ] **FAIL** Reports shows faded example data with missing line
- [ ] **FAIL** Example: "Add 3 more apps and link one to a server..."
- [ ] **FAIL** Shows "Add apps here" which opens paste box in place
- [ ] **FAIL** Model shows empty tables with same paste box inline
- [ ] **FAIL** Example data from client fixture, never written

### Skip Behavior
- [ ] **FAIL** Stores { setupDismissedAt, setupStep } in user-workspace settings
- [ ] **FAIL** After skip, doesn't reopen flow on login
- [ ] **FAIL** Ask keeps compact setup card until met
- [ ] **FAIL** Never a modal

---

## ADD-ANYWHERE Delta (shots 44-46)

### Intent Rule (answerStrategies.ts)
- [ ] **FAIL** Leading "add", "new", or "+" → add
- [ ] **FAIL** Ends with "?" or starts with question word → question
- [ ] **FAIL** 2+ items, >=60% known names → add
- [ ] **FAIL** 2+ items, some known but <60% → ambiguous with choice
- [ ] **FAIL** Otherwise → question
- [ ] **FAIL** 60% threshold in constants file
- [ ] **FAIL** Question word list in constants file
- [ ] **FAIL** Test: "add Zoom, HubSpot and NetSuite" → add
- [ ] **FAIL** Test: "Zoom, Slack, Dropbox" → add
- [ ] **FAIL** Test: "Zoom, Contoso, Fabrikam" → ambiguous
- [ ] **FAIL** Test: "What breaks if AS400 goes down?" → question

### Add Flow Inline (shot 44)
- [ ] **FAIL** Renders AddFlow inline in Ask answer area
- [ ] **FAIL** Shows "Read as a list of apps · Ask about them instead"
- [ ] **FAIL** Kind chips show preset and can be changed
- [ ] **FAIL** Matcher still overrides per item (AS400 → server)

### "+ Add" Entry Points (shot 45)
- [ ] **FAIL** "+ Add" next to Ask bar (inside bar, left of Ask)
- [ ] **FAIL** Model › Applications "+ Add" opens with kind=app
- [ ] **FAIL** Other Model tabs open with respective kinds
- [ ] **FAIL** Opens inline panel, not modal or route

### Adaptive Steps
- [ ] **FAIL** Skips "Where it lives" when all SaaS
- [ ] **FAIL** Shows "skipped: all 3 are SaaS" as skipped step
- [ ] **FAIL** One item → compact: one row with match, hosting, owner, one button
- [ ] **FAIL** 2+ items → full review table
- [ ] **FAIL** Same-category hint shown, becomes to-do

### Dedupe Rule (shot 44)
- [ ] **FAIL** Compares normalized names before review
- [ ] **FAIL** Hit shows "Already have this" with owner/cost/lifecycle
- [ ] **FAIL** Shows [Keep as is] (default) / [Update it?]
- [ ] **FAIL** Update fills only empty fields
- [ ] **FAIL** Two typed items matching same catalog → one row
- [ ] **FAIL** Test: "HubSpot" with existing HubSpot → "Already have this"
- [ ] **FAIL** Test: "M365, Microsoft 365" → one row

### Save & Confirmation (shot 46)
- [ ] **FAIL** One transaction for all records, edges, cost lines
- [ ] **FAIL** Shows inline strip: "Added {n} {kind}s: {names}."
- [ ] **FAIL** Shows home status: "{k} still need(s) a home" or "Both are SaaS..."
- [ ] **FAIL** Undo available until page left or 10 minutes
- [ ] **FAIL** No toast-only confirmation
- [ ] **FAIL** Below: "Your to-do list: {m} new items" from gap rules

### "Your Map Is Ready" One-Time
- [ ] **FAIL** Shows only on save that first meets setupState
- [ ] **FAIL** Records mapReadyShownAt in setup settings JSON
- [ ] **FAIL** Never shows again after first time

---

## ADD-CARDS Delta (shots 47-50) ⚠️ SUPERSEDES ADD-ANYWHERE inline UI

### Problem Identified (from screenshot)
- [x] **FAIL** Shows "Already have this" AND "Added 1 app" simultaneously
- [x] **FAIL** Shows debug text "skipped: all 1 are SaaS"
- [x] **FAIL** Shows plumbing text "Read as a list of apps"
- [x] **FAIL** Shows kind chips when not needed
- [x] **FAIL** Shows disabled "Update" button as only action

### Component Structure
- [ ] **FAIL** AddResult component exists
- [ ] **FAIL** RecordCard component exists
- [ ] **FAIL** AddCard component exists
- [ ] **FAIL** AlreadyLine component exists
- [ ] **FAIL** AddSaved component exists
- [ ] **FAIL** ItemLogo component exists (catalog URL or colored initials)

### Rule 1: All Items Exist (shot 47)
- [ ] **FAIL** No review table, no confirmation, no primary button
- [ ] **FAIL** Title: "You already have <typed alias>"
- [ ] **FAIL** One RecordCard per item
- [ ] **FAIL** RecordCard shows: logo, name, kind/vendor, "In your map" pill
- [ ] **FAIL** 4 stats: Owner, Annual cost, Renewal, Depends on it
- [ ] **FAIL** ONE gaps line (first missing of owner/renewal/criticality)
- [ ] **FAIL** If no gaps: green "Nothing missing" + notice deadline
- [ ] **FAIL** Links: "Open" and "Ask about it"
- [ ] **FAIL** Small text: "Not what you meant? Add '<typed>' as new"
- [ ] **FAIL** Test: "add ms 365" with existing → exactly one RecordCard
- [ ] **FAIL** Test: No "Added" text in DOM
- [ ] **FAIL** Test: No disabled button anywhere
- [ ] **FAIL** Test: No primary button

### Rule 2: Confirmation Only After Save (shot 50)
- [ ] **FAIL** Mock save pending → no AddSaved
- [ ] **FAIL** Save resolves → AddSaved replaces cards
- [ ] **FAIL** Shows "Added N apps: <names>."
- [ ] **FAIL** Shows "<existing> was already there, so nothing changed."
- [ ] **FAIL** Shows logos + Undo
- [ ] **FAIL** Below: "<m> new to-dos" from gap rules
- [ ] **FAIL** On error: keeps cards, shows error line + Retry
- [ ] **FAIL** Undo removes only what was created

### Rule 3: New Items as AddCards (shot 48)
- [ ] **FAIL** Cards in grid (auto-fill, min 260px)
- [ ] **FAIL** Title: "Add N apps to your map"
- [ ] **FAIL** Subtitle shows question count when > 0
- [ ] **FAIL** AddCard shows: logo, matched name, category/vendor, typical cost tag
- [ ] **FAIL** No extra SaaS tag
- [ ] **FAIL** AT MOST ONE question per card
- [ ] **FAIL** Hosting question only when catalog doesn't say SaaS
- [ ] **FAIL** "Is it X?" only for fuzzy match
- [ ] **FAIL** SaaS items show "Cloud app (SaaS), nothing to ask"
- [ ] **FAIL** Small x removes card from add
- [ ] **FAIL** Unanswered hosting = Don't know (saved as to-do)
- [ ] **FAIL** ONE primary button "Add N apps"
- [ ] **FAIL** Button never disabled
- [ ] **FAIL** N updates as cards removed
- [ ] **FAIL** 0 cards left → result closes
- [ ] **FAIL** Test: "add Zoom, NetSuite and Plant scheduling" → 3 cards
- [ ] **FAIL** Test: Only Plant scheduling asks "Where does it live?"

### Rule 3b: Mixed Add (shot 49)
- [ ] **FAIL** Existing items collapse to AlreadyLine rows
- [ ] **FAIL** AlreadyLine shows: logo, "<name> is already in your map"
- [ ] **FAIL** Shows owner/cost, first gap as inline chip, "Open"
- [ ] **FAIL** Primary button counts only new items: "Add 2 apps"
- [ ] **FAIL** Test: "add Zoom, HubSpot and NetSuite" → 2 AddCards + 1 AlreadyLine
- [ ] **FAIL** Test: Removing a card → "Add 1 app"

### Rule 4: Hide Plumbing
- [ ] **FAIL** No step strip
- [ ] **FAIL** No "skipped ..." text
- [ ] **FAIL** No "Read as a list of apps"
- [ ] **FAIL** Kind chips only when kind can't be inferred
- [ ] **FAIL** "Ask about them instead" only for ambiguous intent

### Rule 5: Motion
- [ ] **FAIL** Cards enter with 60ms stagger (opacity + 8px rise, 320ms)
- [ ] **FAIL** On Save, cards dim and button shows check + "Adding…"
- [ ] **FAIL** When saved, cards swap to AddSaved (fade in)
- [ ] **FAIL** prefers-reduced-motion: no stagger/pop, instant swap
- [ ] **FAIL** Nothing animates layout width/height

---

## VIEWS-OPENING Delta (shots 35-37) - Context Only

### Default Selection
- [ ] **FAIL** Picks record with most impact_of dependents
- [ ] **FAIL** Ties: more apps, then name
- [ ] **FAIL** Location with single item replaced by that item
- [ ] **FAIL** Caption shows default reason

### Candidate Cards
- [ ] **FAIL** Top 4-6 by same count above lanes
- [ ] **FAIL** Each shows: kind icon, name, "{n} depend on it", severity bar
- [ ] **FAIL** Selected card highlighted
- [ ] **FAIL** Click selects (updates ?sel)

### Other Features
- [ ] **FAIL** Headline strip with counts and cost
- [ ] **FAIL** Empty lanes collapse with plain-words link
- [ ] **FAIL** Tab badges from to-do queries (hidden when 0)
- [ ] **FAIL** To-do panel: concrete gaps for chain only
- [ ] **FAIL** Empty workspace (?demo=empty): faded sample, banner, no badges
- [ ] **FAIL** Sample never persisted

---

## Cross-Cutting Tests

### Feature Flags
- [ ] **FAIL** firstrun.v1 flag exists and controls first-run behavior
- [ ] **FAIL** addanywhere.v1 flag exists, requires firstrun.v1
- [ ] **FAIL** Flag off = today's behavior unchanged

### Add Intent Tests
- [ ] **FAIL** Intent rule is deterministic (no LLM)
- [ ] **FAIL** "add ms 365" → add intent
- [ ] **FAIL** "+ Gusto" → add intent  
- [ ] **FAIL** "new server SQL02" → add intent
- [ ] **FAIL** Test case: exact normalization rules

### Dedupe Tests
- [ ] **FAIL** "HubSpot" existing → "Already have this", no duplicate
- [ ] **FAIL** "M365, Microsoft 365" → one row
- [ ] **FAIL** Update fills only empty fields, never overwrites

### Save/Undo Tests
- [ ] **FAIL** One transaction for all
- [ ] **FAIL** Undo removes exactly what was created
- [ ] **FAIL** Undo available until page left or 10 minutes

### Setup Minimum Tests
- [ ] **FAIL** 4 apps + 1 link → not met
- [ ] **FAIL** 5 apps + 0 links → not met
- [ ] **FAIL** 5 apps + 1 link → met
- [ ] **FAIL** Changing SETUP_MIN changes behavior everywhere

### Matcher Tests
- [ ] **FAIL** "M365" → Microsoft 365
- [ ] **FAIL** "quickbooks" → QuickBooks Online
- [ ] **FAIL** "AS400" → server kind
- [ ] **FAIL** "EDI" → pick-one
- [ ] **FAIL** "Order Entry" → custom
- [ ] **FAIL** Duplicates collapse
- [ ] **FAIL** Nothing saved before Next

---

## Status Summary

- ❌ **FIRST-RUN**: 0/39 passing
- ❌ **ADD-ANYWHERE**: 0/35 passing  
- ❌ **ADD-CARDS**: 0/55 passing
- ⚠️ **VIEWS-OPENING**: Not in scope for this audit (context only)

**Total**: 0/129 items passing

---

## Notes

1. The current implementation has the ADD-ANYWHERE inline review UI (table-based) but ADD-CARDS spec says to replace it with card-based UI.
2. The screenshot shows the exact problem ADD-CARDS is meant to fix:
   - "Already have this" and "Added 1 app" at the same time
   - Debug/plumbing text visible
   - Disabled button as only action
3. Need to verify feature flags are properly implemented.
4. Need to add comprehensive tests for intent rule, dedupe, and setup state.
