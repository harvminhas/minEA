# Delta: Ask home + All reports v2 (self-contained Cursor prompt)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001).
- Objects keep vendor, cost and hosting in `properties`; owner is a real column.
- Platforms and runtimes are split behind the flag `infra.split.v1`.
- Support status comes from `lib/infra/status.ts`, money from `lib/cost/`.
- "Where things run" comes only from `runs_on` / `built_on` relationships; `hosting_model` is a label.

Shots (1280 wide; in `shots/` next to this file, or `docs/design/shots/` in the full kit): `24-ask-home-v2.png`, `25-ask-home-empty-states.png`, `26-all-reports-v2.png`, `27-spof-report.png`.

Attach the 4 shots and paste the block below into a new Cursor Agent chat.

```text
GOAL: update the Ask home page and the All reports page to match shots 24-27. Every number
must come from existing modules or queries; nothing hard-coded. Keep the changes behind
repository.mvp.v1 and, for anything infra-related, infra.split.v1 (flag off: as today).

0. FIRST, read-only: find the Ask home page, the report registry/cards, the report detail
   route, and check whether lib/infra/status.ts and lib/cost exist. Show me a short plan
   and the file list, then WAIT for my OK. After OK, show the diff before committing.
   If lib/infra/status.ts isn't built yet, compute status inline from support_ends and an
   EOL-OS config list (out_of_support < today; unsupported_os; ends_soon < 90 days; ok;
   unknown) in ONE helper, and leave a TODO to switch to lib/infra/status.ts.
   If lib/cost isn't built yet, use the existing annual_cost parser and leave a TODO.

1. Stats line under the Ask heading (shot 24):
   "{org} · {a} applications · {p} platforms · {s} servers & devices · {v} vendors ·
   ${x} a year in tracked spend". Counts by type; vendors = the existing normalized vendor
   count; spend = vendor run cost from the cost module. When any runtime is out_of_support
   or unsupported_os, append an amber link " · {n} out of support" (nowrap) that opens
   Servers & devices filtered to out of support / unsupported OS.

2. Popular reports: exactly 4 cards in this order: Renewals next 90 days, Spend by vendor
   & category, Ownership gaps, Aging infrastructure. Aging replaces End of life & retiring
   (which moves to All reports only). The Aging card shows "{n} out of support" with
   "{m} ending in 90 days" under it, the number in red when n > 0, and links to Servers &
   devices with "Needs attention" selected.

3. Empty cards never show "0" or a dash (shot 25):
   - Renewals: none within 90 days -> "Nothing in 90 days" + "next {date} · {record}";
     no renewal dates at all -> "No renewal dates yet" + an "Add" link.
   - Ownership gaps 0 -> "Every record has an owner". Aging 0 -> "Nothing out of support" +
     "next support end {date} · {record}". Spend 0 -> "No costs tracked yet" + "Add".
   - Single points of failure 0 -> "None found".
   Build a dev-only preview (e.g. ?demo=empty, behind NODE_ENV !== 'production') OR
   Storybook/test fixtures that render these states; no fake data in production.

4. Suggested chips, generated from the data, max 6, in this order, each only if it applies:
   "What's out of support?" (any bad status) · "What breaks if the {runtime} goes down?"
   (the runtime with the most runs_on/built_on dependents) · "What renews in the next 90
   days?" (else "When is our next renewal?") · "What has no owner?" (gaps > 0) · "What are
   we spending by vendor?" (spend > 0) · "What happens if {app} goes down?" (the app with
   the most dependents/components). Articles: runtimes take "the" unless the name already
   starts with it; applications, platforms and vendors never do ("the AS400", "Salesforce").
   Make sure the Ask router answers "What's out of support?" from the status helper, with
   one cited row per item.

5. All reports page (shot 26), using the existing report card layout. Category counts come
   from the registry. New cards:
   - Single points of failure: platforms/runtimes with >= 3 distinct runs_on/built_on
     dependents; card "{n}" (red when > 0) + the names.
   - Hosting map: applications grouped by their host (runs_on/built_on), plus a "No host
     linked" group (hosting_model on_premise|hybrid with no edge); card "{h} hosts" + "{k}
     app(s) with no host linked".
   - Infrastructure cost: platforms + runtimes from the cost module; card "${total} / yr ·
     platforms ${p} · servers ${r}".
   - End of life & retiring stays (lifecycle-based); Aging infrastructure is also listed.

6. Single points of failure detail page (shot 27): one card per host (name link, type ·
   kind, status badge for runtimes, "{n} things run on or are built on it"), dependent pills
   coloured by criticality (each opens its record), "No backup or failover recorded for
   {the name}." and "Ask what breaks if it goes down →". Footnote: "Counted from runs-on and
   built-on links only (hosting labels aren't used)."

TESTS
- Stats line counts and the out-of-support link appear only when n > 0.
- Chips: max 6, order and conditions above; article rule ("the AS400", "Salesforce").
- Every empty state above renders the text (no "0", no "—").
- SPOF: >= 3 distinct dependents (duplicate edges count once); hosting_model never used.
- Hosting map: an on_premise app without an edge is in "No host linked" only.
- Infrastructure cost = platforms + runtimes from the cost module; no client-side sums.

ACCEPTANCE (prototype numbers; real data will differ)
- Shot 24: "13 applications · 6 platforms · 10 servers & devices · 11 vendors · $159,660
  a year in tracked spend · 4 out of support"; chips as shown; cards 4 / $41,980,
  $159,660, 3 with no owner, "4 out of support" + "2 ending in 90 days".
- Shot 26: SPOF 3 (Microsoft 365 tenant, AWS account, AS400), Hosting map 5 hosts / 1 app
  with no host linked, Infrastructure cost $94,390 (platforms $18,600, servers $75,790).
- 1280x800: no horizontal scroll; the stats link doesn't break across lines.

DO NOT
- Hard-code counts, names or amounts; compute support status in components; use
  hosting_model for hosting or impact; add tables or migrations; add a new Ask flag.
```

**Check:** compare the app with shots 24–27 at 1280×800, then turn the empty-state preview on and compare with shot 25.

Notes:
- The prototype's TODAY is Sep 28, 2026.
- The prototype puts the Microsoft 365 cost on the apps, so its platform total ($18,600) is lower than the product's, which follows the cost module.
- The prototype's "What has no owner?" answer uses two Ask-only sample records, while the card counts the 3 Model records. In the real app both come from the same query.
