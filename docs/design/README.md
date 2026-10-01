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

## Ground rules (all packages)

- No new tables or structural migrations. Object facts live in `objects.properties`; owner is a real column.
- `hosting_model` is a label. Where things run comes from `runs_on` / `built_on` relationships.
- One module owns each calculation: `lib/cost/` for money, `lib/infra/status.ts` for support status, the shared impact builder for "what depends on X", `answerStrategies.ts` for Ask rules.
- Flag off = today's behaviour. Commit after every phase.
