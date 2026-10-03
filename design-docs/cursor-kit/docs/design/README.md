# BuboMap design kit: what to run, in order

Repo: minEA (`D:\Users\hminhas\WebstormProjects\minEA`). Expand the kit into the repo root so that everything lands in `docs/design/`. Run each prompt in a new Cursor Agent chat. Every package starts with a read-only discovery step that appends a numbered section to `docs/design/DISCOVERY.md`, then shows a plan and waits for your OK.

## Run order

| Step | Package | Status | Flag |
|---|---|---|---|
| 1 | UI P-phases P0–P7c (`CURSOR-UI-INSTRUCTIONS.md`) | **Done** | `repository.mvp.v1` |
| 2 | Ask fixes A → B (`CURSOR-ASK-FIXES.md`) | Next | none (the existing `/ai/ask` path) |
| 3 | Cost C0 → C6b, optional C2b (`CURSOR-COST-INSTRUCTIONS.md`) | After 2 | `cost.lines.v1` |
| 4 | Infra I0 → I7, optional I1b (`CURSOR-INFRA-INSTRUCTIONS.md`) | After 3 | `infra.split.v1` |

DISCOVERY.md sections: §1–15 (P0), §16 (Cost C0), §17 (Infra I0), §18–19 (Ask fixes A, B). The numbers are fixed even when they're written out of order.

## One line per doc

- `README.md`: this file, the run order.
- `CURSOR-UI-INSTRUCTIONS.md`: P0–P7c prompts for the shell, nav, tables, panel, reports and Ask (done); design tokens; general "if Cursor drifts" prompts.
- `REPOSITORY-MVP-SPEC.md`: data and UX rules for the Repository MVP (six shared fields, nav, tables, panel, reports, vendors).
- `ASK-GROUNDING-SPEC.md`: grounded Ask (tools, metamodel prompt, validation, security, eval set; §10 cost questions). There is no `ask.llm.v1` flag; see the note at its top.
- `CURSOR-ASK-FIXES.md`: prompt A (impact answer table + shared impact builder) and prompt B (`answerStrategies.ts`: intents, thresholds, verdicts, fix actions, JSON artifact).
- `COST-SPEC.md`: cost lines in `properties.cost_lines`, the `lib/cost/` module, shares, fixture, tests.
- `CURSOR-COST-INSTRUCTIONS.md`: C0–C6b (+ C2b) prompts, cost fidelity checklist, drift prompts.
- `INFRA-SPEC.md`: Platforms & cloud + Servers & devices: properties keys, `lib/infra/infraConfig.ts`, `lib/infra/status.ts`, UI, Ask aging intent, fixture, tests.
- `CURSOR-INFRA-INSTRUCTIONS.md`: I0–I7 (+ I1b) prompts, infra fidelity checklist, drift prompts.
- `bubomap-ui.html`: the clickable mockup (open in a browser; hash routes such as `#/model/servers`).
- `shots/`:
  - 01–08: base UI.
  - 09–13: Ask.
  - 14–18: cost.
  - 19–23: infra split (platforms, servers & devices, AS400 panel, no host linked, aging tile).
  - 24–27: Ask home v2, its empty states, All reports v2, Single points of failure report (delta pack).
  - 28–30: generic Estate map and Connections tab. **Superseded** by the views-first approach (32–34). Kept for reference only; don't build from them.
  - 31–34: Locations table, Impact view (AS400), Data flow view, Hosting & location view (infra v2 delta pack).
  - 35–37: Impact opening state: default selection with candidate cards, another selection with collapsed lanes, empty-workspace sample (views opening delta pack). These also show the current header (Ask · Model · Views · Reports, bell, no search box).
  - 38–43: First login for a new workspace: Ask setup panel, typed list matched, where each one lives, owners & renewals, map ready (Views › Impact with their own data), Reports before the minimum (first-run delta pack).
  - 44–46: Add anywhere (Meridian, after setup): "add Zoom, HubSpot and NetSuite" reviewed inline under the Ask bar with an "Already have this" row; "+ Add" on a Model page (preset kind, one compact row); confirmation with Undo and the new to-dos (add-anywhere delta pack).
  - 47–50: Add cards (replace the inline review from 44 and 46): "add ms 365" when you already have it (one record card, no confirmation); new items as cards with at most one question; mixed with a collapsed "already in your map" line; saved with Undo + to-dos (add-cards delta pack).
  - Shots 01–27 were taken before infra v2. The mockup now also has HV01 (11 servers & devices), Locations, and the wider SPOF rule (5 items), so a few counts in the mockup differ from those older shots. The mockup's Views tab now opens on the Impact view.

## Delta packs (send these instead of the full kit)

- `delta/ASK-HOME-REPORTS.md` + shots 24–27 (also shipped alone as `bubomap-delta-ask-home.zip`). It's one self-contained prompt for the Ask home stats line, the data-driven chips, Popular reports with the Aging card, empty states, and the new All reports cards (Single points of failure, Hosting map, Infrastructure cost). It needs none of the other docs. Run it after the Infra I-phases, or before them using its inline-status fallback.
- `delta/INFRA-FIXES.md` + `delta/VIEWS-AND-RELATIONSHIPS.md` + shots 31–34 (also shipped alone as `bubomap-delta-infra-v2.zip`).
  - Run INFRA-FIXES.md first: records from before the split are missing, and some shown fields can't be edited (one field config).
  - Then V0–V8, views first. Each view answers one CTO question: Impact, Data flow, Hosting & location, then Vendors and Roadmap; Protection is phase 2.
  - Only the relationships those views need: new `sends_data_to` (what / how / frequency) and `located_at`, plus `backed_up_to` / `protected_by` in phase 2. Users create relationships in plain words from inside the view, and each view lists its own gaps.
  - Also covers Location objects and the migration from `properties.location`. The generic Estate map is optional.
  - Self-contained. Run it after the Infra I-phases.

- `delta/VIEWS-OPENING.md` + shots 35–37 (also shipped alone as `bubomap-delta-views-opening.zip`). It's one self-contained prompt that stops Views › Impact from opening blank:
  - Default selection is the biggest single point of failure, shown with candidate cards, a headline strip with cost, collapsed empty lanes, and the selection animation (reduced motion respected).
  - Tab badges, a concrete to-do panel for the chain, and an empty-workspace sample that is never saved.
  - Run it after VIEWS-AND-RELATIONSHIPS.md V4.

- `delta/FIRST-RUN.md` + shots 38–43 (also shipped alone as `bubomap-delta-first-run.zip`). It's one self-contained prompt for the first login in a brand-new workspace:
  - Ask is home and shows "What runs your business?" (paste, catalog match, where each one lives, optional owners & renewals) until the `SETUP_MIN` minimum is met (5 apps and 1 app linked to a server).
  - Then Views › Impact opens on their riskiest item. Before that, Views and Reports show example data with one "what's missing" line.
  - No redirects, no mandatory fields, skips remembered. It supersedes the inventory-first parts of ONBOARDING-DAY1-SPEC.md.
  - Run it after VIEWS-OPENING.md.

- `delta/ADD-ANYWHERE.md` + shots 44–46 (also shipped alone as `bubomap-delta-add-anywhere.zip`). **Run it after FIRST-RUN.md is applied.** It makes the first-run paste-and-match flow the only add flow:
  - the Ask bar understands "add …" and pasted lists (a fixed rule, no LLM);
  - "+ Add" next to the Ask bar, in Model page headers and in Views lanes opens it in place, with the kind preset;
  - it only asks what's needed, never creates duplicates ("Already have this"), confirms with Undo, and sends gaps to the to-do list;
  - "Your map is ready" stays one-time.
  - It also asks Cursor to check the single-item-location default selection rule for Views › Impact.

- `delta/ADD-CARDS.md` + shots 47–50 (also shipped alone as `bubomap-delta-add-cards.zip`). **Run it after ADD-ANYWHERE.md is applied.** It replaces the inline Ask add result with cards:
  - items you already have show a RecordCard and no confirmation;
  - new items show AddCards with at most one question each, and the one primary button is never disabled;
  - in a mixed add, existing items collapse to one line;
  - the confirmation appears only after the save succeeds and replaces the cards, with Undo;
  - no plumbing text; a 60ms stagger that respects reduced motion.
  - It keeps the ADD-ANYWHERE intent rule, dedupe, AddFlow and flags.

## Ground rules (all packages)

- No new tables or structural migrations. Object facts live in `objects.properties`; owner is a real column.
- `hosting_model` is a label. Where things run comes from `runs_on` / `built_on` relationships.
- One module owns each calculation: `lib/cost/` for money, `lib/infra/status.ts` for support status, the shared impact builder for "what depends on X", `answerStrategies.ts` for Ask rules.
- Flag off = today's behaviour. Commit after every phase.
