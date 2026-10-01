# Discovery

Sections 1–15 (UI P0) were not written in this repo. Section 16 is the cost discovery. Sections 17–19 are reserved for infrastructure and the Ask fixes.

## 16. Cost storage facts (cost.lines.v1)

### 16.1 Objects and properties

- Table `objects`, model `MinEAObject` in `apps/api/app/models/objects.py` (lines 35–68). `properties` is PostgreSQL JSONB, default `{}`, typed as `dict` (line 57).
- Owner is a real column: `owner` (Text, line 44), plus `owner_team_id`, `point_of_contact_id`, `point_of_contact_name`.
- Writes: `apps/api/app/routers/objects.py`. Create passes `properties` through `apply_cost_lines` (line 163). Update merges the patch onto the existing blob (line 285), deletes a key when the patch value is `None` (lines 286–288), then `apply_cost_lines` (line 289). The merge replaces the whole `properties` value on the row. A nested key not in the patch is kept.
- `updated_at` is `onupdate=func.now()` (objects.py line 61). No version column and no compare-and-swap. Two overlapping edits can overwrite each other.
- History: `ChangeLog` (`change_log` table, objects.py lines 71–82). The object update writes a changelog row when fields change (`objects.py` after the property merge).

### 16.2 Type names and which list shows them

| Stored `objects.type` | Shown in | Notes |
|---|---|---|
| `application`, `solution`, `technical_capability` | Applications | Catalog kind `application` (`model-catalog.ts` lines 134–136) |
| `cloud_service` with `platform_type` | Infrastructure (platforms) | `isEnterprisePlatform` |
| `model` with `compute_runtime_kind` set | Infrastructure (runtimes) | `isComputeRuntime` |
| `tool` | Connections (integration infrastructure) | Has `annual_cost` on the older screens, not a catalog row |
| `model` without `compute_runtime_kind` | AI models, not the infrastructure list | |

### 16.3 `annual_cost`

- Applications, solutions, and technical capabilities: write-back stores a **number** (`cost_lines.py` lines 95–96, `math.ts` `annualCostWriteBack`).
- Platforms, tools, runtimes, and any other type: write-back stores a **string of plain digits** (`cost_lines.py` lines 97–98).
- Parser `parseLegacyAnnualCost` in `apps/web/lib/cost/math.ts` (lines 47–54): a number `> 0`, or a string that is only digits after removing `$`, commas, and spaces, and that parses to `> 0`. Zero, blank, and any letter (so `18.6k` does not count) are missing. The API copy is `parse_legacy_annual_cost` in `apps/api/app/services/cost_lines.py`.
- `cost_model` values for runtimes: `per_vcpu_memory`, `per_instance_hour`, `per_invocation`, `reserved_committed`, `flat_enterprise`, `capex` (`runtime-utils.ts` lines 52–59). `capex` displays "Capital asset" and is not missing (`model-catalog.ts` lines 186–188). `is_custom_built === true` with no amount displays "No license cost" (lines 189–191).
- Example shapes in code, not a dumped database: number `1200` and `18000` (`test_cost_lines.py`); string `"1440"` after a platform write-back (same test). `$18,600` is accepted by the parser. `18.6k` is not.

### 16.4 Readers and writers of `annual_cost`

Writers:

- `apps/api/app/services/cost_lines.py` `apply_cost_lines` — sets or removes `annual_cost` from the vendor run total when `cost_lines` is in the merged properties.
- `apps/web/components/application/SystemQuickAddRow.tsx` line 76 — writes a number on create when the typed cost is `> 0`.
- `apps/web/lib/platform-utils.ts` line 157, `integration-infra-utils.ts` line 172, `CreatePlatformPanel.tsx` / `CreateRuntimePanel.tsx` / `CreateIntegrationInfraPanel.tsx` — form fields copied into properties as a string.
- `apps/web/components/objects/ObjectForm.tsx` — generic property editor, including cost lines.

Readers that parse or sum (C2 checklist):

| File | What it does | Parser |
|---|---|---|
| `apps/web/lib/model-catalog.ts` `rowFromObject` | Catalog amount, missing cost | `annualCost` in `lib/cost/service.ts` |
| `apps/web/lib/model-catalog.ts` `catalogStats`, `vendorRollup` | Overview spend, vendor totals | Catalog run total and `vendorAmounts` |
| `apps/web/lib/system-list-utils.ts` | Application list sort/display | Reads the raw property |
| `apps/web/lib/catalog-fields.ts` `formatCatalogAnnualCost` | Older list cards | Formats a number `> 0`; shows a non-empty string as typed |
| `apps/api/app/ai/ask/graph.py` `_record` | Ask record annual amount | `object_annual_dollars` (line run total, else legacy parse) |
| `apps/api/app/ai/ask/tools.py` | Ask aggregate `sum_annual_cost` | Sums `rec.annual` from the graph |
| `apps/api/app/services/portfolio_signals.py` `_annual_cost_for_product` | Product cost signal | `object_annual_dollars` |
| `apps/web/components/views/ProductCard.tsx`, `PortfolioView.tsx`, `ProductDetail.tsx` | Product views | Display `annual_cost_total` from that signal |
| `apps/api/app/services/object_history.py` | History label | Displays the key, does not sum |

Display-only (format the stored value, do not add it up): `SystemDetailsTab`, `SystemTable`, `ObjectCard`, `PlatformList`, `PlatformDetail`, `RuntimeList`, `RuntimeDetail`, `IntegrationInfraList`, `IntegrationInfraDetail`, `IntegrationInfraTable`.

### 16.5 Cost-like fields that stay out of totals

- `license_model` on platforms and tools (`platform-utils.ts`, `integration-infra-utils.ts`). Display only.
- `cost_per_call`, `cost_per_million_tokens_input`, `cost_per_million_tokens_output` on the generic object form (`ObjectForm.tsx` lines 173–184).
- Roadmap initiative cost: not found as `initiative_cost`. Looked in `apps/web` and `apps/api` for `initiative_cost` and `roadmap` cost keys.

### 16.6 Renewal keys

- `contract_renewal` on applications, platforms, and tools. Free text. Catalog treats `YYYY-MM-DD` as a date and `monthly` / `no contract` / `none` as known (`model-catalog.ts` lines 209–214).
- `commitment_ends` on runtimes (`runtime-utils.ts` line 134). Same display rules.
- Notice period is on a cost line as `notice_days` (`math.ts` line 27). No object-level notice key was found.

### 16.7 Vendor

- `properties.vendor` is free text on applications and tools. Platforms use a preset list in `apps/web/lib/platform-utils.ts` `PLATFORM_VENDORS` (lines 5–14): `microsoft`, `salesforce`, `servicenow`, `sap`, `oracle`, `google`, `amazon`, `other`, mapped to display names by `PLATFORM_VENDOR_LABEL`.
- `vendor_product`: not found.
- Runtime vendor vs provider: `vendor` on the object; provider labels live in `RUNTIME_PROVIDER_LABEL` (`runtime-utils.ts`). Not a second vendor normalizer.
- Normalizer: `displayVendor` in `model-catalog.ts` (lines 118–122). Drops hosting words in `HOSTING_NOT_VENDOR` (lines 45–56) and maps platform codes. Ask repeats the hosting-word drop in `graph.py` `HOSTING_NOT_VENDOR` (line 17) and does not map platform codes.
- `is_custom_built`: boolean. With no amount, the catalog shows "No license cost" and does not count the cost as missing.

### 16.8 Relationships

- Table `relationships` (`apps/api/app/models/relationships.py` lines 12–31): `type`, `from_object_id`, `from_type`, `to_object_id`, `to_type`, `attributes` JSONB. Direction is from → to. `runs_on` and `built_on` are allowed triples in `apps/api/app/schemas/relationships.py` (lines 51–66). Hosts of Y are edges with `from_object_id = Y`. Objects that point at host X are edges with `to_object_id = X`. The schema does not forbid duplicate edges.
- `hosting_model` is a label on the object (`on_premise`, `saas`, `public_cloud`, and the platform list `saas` / `paas` / `self_hosted` / `hybrid`). `compute_runtime_kind` marks a `model` row as a runtime.
- Ask impact walks `relationshipImpactRules` in `apps/web/lib/impact/relationship-impact.ts`. It does not add rows from `hosting_model`.

### 16.9 Relationship rules shape

`relationshipImpactRules` in `apps/web/lib/impact/relationship-impact.ts` (line 24): one record per relationship type. Each rule has when the failure lands (`direct`, `degraded`, `loses_support`) and a `step` phrase. `impactOf` is the only walk. Cost config should follow this: one file, one entry per object type, no second copy of the rules.

### 16.10 Workspace settings

- `workspaces` columns: `slug`, `name`, `template_id`, `biz_layer_term`, `app_layer_term`, `constraint_mode` (`objects.py` lines 12–23). No settings JSON and no currency column.
- Admin is a workspace membership role. Not found as a currency permission.
- Currency setting: **not found**. Amounts are shown as US$.

### 16.11 History, ids, validation

- History helper: `ChangeLog` plus `apps/api/app/services/object_history.py`. `performed_by` is the user id.
- Ids: `uuid.uuid4()` on the server; the browser uses `crypto.randomUUID()` for a new cost line (`CostSection.tsx`).
- Validation: Pydantic on the API, Zod on the web for other forms. Cost lines are validated in Python `apply_cost_lines` (`_validate_line`), not by a Zod schema. There is no feature-flag helper. `cost.lines.v1` and `repository.mvp.v1` are not implemented. The cost line UI is already on.

### 16.12 Screens

- Applications and infrastructure tables, footer, and detail panel: `apps/web/components/mvp/ModelScreen.tsx`, `ModelDetailPanel.tsx`. Quick entry is `QuickCost` in `CostSection.tsx`. The panel Cost section is `CostSection` in the same file.
- Spend report: `apps/web/components/mvp/ReportDetailScreen.tsx` (`SpendReport`), fed by `vendorRollup`.
- Vendors and contracts: the MVP sidebar group, same rollup.
- Ask aggregate: `apps/api/app/ai/ask/tools.py` `aggregate`, amounts from `graph.py`.

### 16.13 Table width

Not measured in a browser in this pass. The MVP annual-cost column is content-sized, not a fixed 124px column. Overflow at 1280×800 is unverified.

### 16.14 Tests

- Web: `node --experimental-strip-types --test` with `apps/web/scripts/alias-register.mjs`. Ask tests live next to the modules (`lib/ask/*.test.ts`).
- API: `python -m unittest` from `apps/api`. Cost write-back: `apps/api/tests/test_cost_lines.py`.
- fast-check: not installed. Not added.

### 16.15 Conflicts and decisions for the build

- Cost lines, write-back, the panel form, and quick entry are already shipped without `cost.lines.v1`. Turning a new flag off would hide that UI. The flag stays unimplemented. New reads go through `lib/cost/` and must keep today's numbers when an object has no lines.
- No workspace currency column. Currency stays USD in the label. No new settings table.
- `annual_cost` write-back format already matches the spec: number on application/solution/technical_capability, digit string otherwise, key removed when the run total is 0.
- Shares (`runs_on` / `built_on` allocation) are not implemented. `includeAllocated` is left unset.
- Ask still parsed only `annual_cost`. It now uses the same run total as write-back when lines exist.
- Duplicate parsers (`parseMoney`, `_money`, `float(raw)` in portfolio signals) are replaced by `parseLegacyAnnualCost` and `object_annual_dollars`.

## 17. Infrastructure split facts (infra.split.v1)

### 17.1 Types

Platforms are `cloud_service` with `platform_type` (`model-catalog.ts`). Servers and devices are `model` with `compute_runtime_kind` set (`runtime-utils.ts` `isComputeRuntime`). Applications are `application`, `solution`, and `technical_capability`. Components can `runs_on` a `model` (`relationships.py` allowed triples). Properties writes go through `objects.py` merge, the same path as `apply_cost_lines`.

### 17.2 Keys

Existing and reused: `vendor`, `runtime_provider`, `compute_runtime_kind`, `hosting_model`, `cost_model`, `commitment_ends`, `contract_renewal`, `region`, `lifecycle`, `criticality`, `sla_target`, `vendor_product` (not found on the platform form; the key is accepted if present). Not found, so added only when a user sets them: `runtime_kind`, `platform_kind`, `location`, `location_detail`, `os_name`, `os_version`, `support_ends`, `end_of_life`.

### 17.3 compute_runtime_kind

Defined in `runtime-utils.ts` `RUNTIME_KINDS`: `kubernetes`, `serverless`, `container`, `vm`, `paas`, `on_prem` (label "On-prem / bare metal"). Map in `lib/infra/infraConfig.ts`: `on_prem` → `physical_server`, `vm` → `vm`, and `kubernetes` / `serverless` / `container` / `paas` → `cloud_service`. `runtime_kind` wins when set. Platform kind is inferred from `hosting_model` (`saas` → `saas_suite`, `paas` → `paas`, `self_hosted` → `self_hosted`) and is not written.

### 17.4–17.14

Vendor codes and provider labels are the existing lists in `platform-utils.ts` and `runtime-utils.ts`. Edges are the `relationships` table; create is `relationshipsApi.create`. Catalog labels stay in `rowFromObject`. Nav is `ModelSidebar.tsx`. The model routes are `{base}/model/platforms` and `{base}/model/servers`. `{base}/model/infrastructure` redirects to servers, or to the matching item. There is no flag helper and no `ask.llm.v1`. The split is on in `infraSplitEnabled` because the screens are the model navigation. Status is only computed in `lib/infra/status.ts`. Ask aging reads `agingSummary`. Table width at 1280 was not measured in a browser.
