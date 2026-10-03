# Delta: Add cards, the inline Ask add result (self-contained Cursor prompt)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001).
- **Run this after ADD-ANYWHERE.md is applied** (which needs FIRST-RUN.md and VIEWS-OPENING.md).
- It **replaces the inline review UI from ADD-ANYWHERE.md** (the review table, step strip, "Read as a list of apps" line, kind chips and confirmation strip under the Ask bar).
- It **keeps** these from ADD-ANYWHERE.md:
  - the intent rule;
  - the dedupe rule;
  - the AddFlow component and its save / undo;
  - the to-do gap rules;
  - the one-time "Your map is ready";
  - the flags addanywhere.v1 and firstrun.v1.
- Don't change the earlier docs.
- Problem seen in the real app for "add ms 365":
  - "Already have this" AND "Added 1 app: Microsoft 365" were both on screen before any click;
  - debug text "skipped: all 1 are SaaS" and "Read as a list of apps";
  - kind chips cluttered the result;
  - the only action was a disabled "Update" button.
- Header (already in the app): Ask · Model · Views · Reports, bell, help, avatar.

**Use the shots as the visual reference** for layout, hierarchy, spacing and colour. They use the app's existing purple (#5b4ce6) and card style. Shots are 1280 wide, Meridian Fasteners, in `shots/` next to this file or `docs/design/shots/` in the full kit:
- `47-add-existing-record.png`: "add ms 365" when Meridian already has the Microsoft 365 tenant → one RecordCard, nothing else.
- `48-add-new-cards.png`: "add Zoom, NetSuite and Plant scheduling" → 3 AddCards; only the custom one asks a question.
- `49-add-mixed.png`: "add Zoom, HubSpot and NetSuite" → 2 AddCards + one collapsed "HubSpot is already in your map" line.
- `50-add-saved.png`: after Save resolves → confirmation with Undo + the new to-dos.

```text
GOAL: the inline Ask add result is a few clear cards, not a form. It never contradicts itself,
never shows plumbing, never shows a disabled primary button. Same intent rule, dedupe, AddFlow
save/undo and flags as ADD-ANYWHERE.md. Plain words; no EA terms.

0. FIRST, read-only: show where ADD-ANYWHERE's inline result renders (AddFlow inline mode in the
   Ask answer area), where the confirmation strip is triggered and WHY it showed before any save
   for "add ms 365", where the "skipped" / "Read as a list of apps" strings and kind chips come
   from, and what the matcher + dedupe return per item. Also say whether a logo source exists
   (catalog field or none). Plan + file list, then WAIT for my OK. After OK, show the diff
   before each commit.

COMPONENTS (components/add/, used only by AddFlow's inline Ask mode; Model "+ Add" can adopt later)
- AddResult: picks the layout from the dedupe result; owns save state (idle | saving | saved | error).
- RecordCard: an existing record. ItemLogo, name, "Platform/App · kind · vendor", "In your map" pill;
  4 stats: Owner (team + person), Annual cost (from lib/cost, e.g. "120 seats · shared by 4 apps"),
  Renewal (+ notice), Depends on it ("N apps" + names, from runs_on/built_on); ONE gaps line
  (first missing of owner / renewal / criticality, inline-editable in place; if none: green
  "Nothing missing", plus the notice deadline if there is one); links "Open" and "Ask about it"
  (asks "What breaks if <name> goes down?"); small "Not what you meant? Add '<typed>' as new".
- AddCard: a new item. ItemLogo, matched name, category · vendor, "typical $x" tag, (no extra SaaS tag);
  AT MOST ONE inline question: hosting (SaaS · Our server · Don't know) only when the catalog
  doesn't say SaaS; "Is it X?" only for a fuzzy match. SaaS items show "Cloud app (SaaS), nothing to ask" (no
  question). Small x removes the card from this add. Unanswered hosting = Don't know
  (saved as a to-do), so it never blocks.
- AlreadyLine: collapsed existing item in a mixed add: logo, "<name> is already in your map",
  owner · cost, its first gap as an inline chip, "Open".
- AddSaved: confirmation + to-dos (replaces the cards).
- ItemLogo: catalog logo URL if present, else coloured initials (catalog brand colour, else a
  hash of the name onto 6 fixed tints; custom items use the accent tint). Sizes 24/40/48.

THE FIVE RULES
1. All items already exist -> no review table, no confirmation, no primary button. Title "You
   already have <typed alias>" (several: "You already have all N"), one RecordCard per item.
2. Confirmation only after the save promise resolves. It REPLACES the cards (not added under
   them): "Added N apps: <names>." + "<existing> was already there, so nothing changed." + logos
   + Undo (ADD-ANYWHERE undo). Below: "<m> new to-dos" from the same gap rules. On error: keep the
   cards, show one inline error line + Retry.
3. New items as AddCards in a grid (auto-fill, min 260px). Title "Add N apps to your map", sub
   "We filled in what we know; one quick question. Owners and renewals can wait." (question count
   only when > 0). ONE primary button "Add N apps" (N updates as cards are removed). It is never
   disabled; 0 cards left = the result closes. Mixed: existing items collapse into AlreadyLine
   rows under the cards.
4. Hide plumbing: no step strip, no "skipped ..." text, no "Read as a list of apps". Kind chips
   only when kind can't be inferred from the matcher or the entry point. "Ask about them instead"
   only for the ambiguous intent (ADD-ANYWHERE rule 2d).
5. Motion: cards enter with a 60ms stagger (opacity + 8px rise, 320ms); on Save the cards dim
   and the button shows a popping check + "Adding…"; when saved, cards swap to AddSaved (fade in).
   prefers-reduced-motion: no stagger/pop, instant swap. Nothing animates layout width/height.

TESTS
- "add ms 365" with an existing Microsoft 365 tenant -> exactly one RecordCard; no AddSaved and no
  "Added" text in the DOM; no disabled button anywhere in the result; no primary button.
- "add Zoom, HubSpot and NetSuite" (HubSpot exists) -> 2 AddCards + 1 AlreadyLine; button
  "Add 2 apps"; removing a card -> "Add 1 app".
- Confirmation only after save resolves: mock save pending -> no AddSaved; resolve -> AddSaved
  replaces cards; reject -> cards stay + error line. Undo removes only what was created.
- Questions: SaaS catalog item -> no hosting question; custom item -> hosting question; fuzzy
  -> "Is it X?"; never two questions on one card.
- Plumbing strings absent: "skipped", "Read as a list", kind chips (for inferable input).
- Reduced motion: no animation classes with duration > 0.

ACCEPTANCE (prototype numbers, Meridian Fasteners)
- 47: "You already have Microsoft 365"; Microsoft 365 tenant · Platform · SaaS suite · Microsoft;
  Infrastructure Team / Priya Shah; $51,840 (120 seats · shared by 4 apps); Jan 14, 2027, 30 days
  notice; 4 apps (Teams, Outlook & Exchange, SharePoint & OneDrive, Office desktop apps);
  "Nothing missing · ... decide by Dec 15"; Open / Ask about it.
- 48: 3 cards (Zoom Workplace, Oracle NetSuite, Plant scheduling); only Plant scheduling asks
  "Where does it live?"; "Add 3 apps".
- 49: Zoom + NetSuite cards; "HubSpot is already in your map · Marketing · $9,600/yr" with
  "No renewal date · Add"; "Add 2 apps".
- 50: "Added 2 apps: Zoom Workplace, Oracle NetSuite." HubSpot unchanged; Undo; 3 new to-dos
  (2 owners, NetSuite vs QuickBooks Online); no "Your map is ready".
- 1280 wide: no horizontal scroll; totals and Ask answers unchanged.

DO NOT
- Show a confirmation, "Added", or a success colour before the save resolves.
- Show a disabled primary button, or any disabled button as the only action.
- Show the review table, step strip, "skipped ..." or "Read as a list of apps" in the Ask result.
- Ask more than one question per card, or make any field mandatory.
- Create a duplicate, or change an existing record without the user editing it.
- Add new dependencies for animation (CSS only), or use EA words.
```
