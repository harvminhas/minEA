# Delta: Views › Impact opening state (self-contained Cursor prompt)

**Context.** This is minEA / BuboMap (Next.js; dev server localhost:3001).
- Objects keep attributes in `properties`; owner is a real column.
- Relationship types live in `relationshipImpactRules`; `impact_of` (BFS, depth 4, severity `direct | degraded | loses_support`) is the only impact calculation. Money comes from `lib/cost/`.
- Today Views › Impact opens blank: "What happens if [Choose…] goes down?", five empty lanes and a generic "Is this list complete?" to-do.
- Header (context only; it's already like this in the app): tabs Ask · Model · Views · Reports, no search box, a bell with a badge, help, avatar. The prototype was updated to match.

Shots (1280 wide; in `shots/` next to this file, or `docs/design/shots/` in the full kit):
- `35-views-impact-default.png`: default opening state.
- `36-views-impact-other-selection.png`: another card selected, with collapsed lanes.
- `37-views-empty-workspace.png`: empty-workspace sample.

```text
GOAL: Views > Impact never opens blank. Match shots 35-37. All numbers come from impact_of, the
cost module and existing queries; nothing hard-coded. Keep it behind the existing views flag.

0. FIRST, read-only: show the Impact page component, how it calls impact_of, where the tab bar
   lives, and how an empty workspace is detected. Plan + file list, then WAIT for my OK. After
   OK, show the diff before committing.
1. Default selection: when ?sel is absent, pick the record (platform, runtime or location) with
   the most records reached by impact_of; ties -> more apps, then name. Caption under the cards
   (only when the default is shown): "Your biggest single point of failure: {n} apps and {m}
   teams depend on it." (n = apps reached, m = distinct owner teams of those apps).
2. Candidate cards above the lanes: the top 4-6 by the same count. Each: kind icon, name,
   "{n} depend on it", and a severity bar split direct / degraded / loses_support. Selected card
   highlighted; click selects (updates ?sel). The dropdown in the title stays as the search.
3. Headline strip: "{a} apps stop · {b} slow down · {c} capabilities hit · {d} teams to call ·
   ${x}/yr of systems affected". x = run cost (cost module) of the selected record plus every
   affected app and infra record; capabilities excluded; no client-side cost maths.
4. Empty lanes collapse to one short line with a plain-words link: "No capabilities linked yet ·
   Link one", "No app depends on these yet · Add one", "No app runs on it yet · Link an app",
   "Nothing else runs on it · Add a server". Lines may cross a collapsed lane.
5. Animation on selection change: the source node first, then lanes bottom-up with a ~200 ms
   stagger, edges drawing in with the lane they lead to. No replay on re-render with the same
   selection. prefers-reduced-motion: no animation, final state at once.
6. Tab badges from the same queries as each view's to-do: Impact "{n} SPOF" (the single points
   of failure report), Data flow "{n} manual" (sends_data_to with how = manual), Hosting &
   location "{n} with no home", Protection "{n} with no backup". Hidden when 0.
7. To-do panel: concrete gaps for the selected chain only, each with one action:
   "{app} has no owner · Set owner", "{server} out of support since {Mon YYYY} · Plan
   replacement", "{server} runs an unsupported OS · Plan upgrade", "{app} has no host · Add host"
   (on-prem app with no runs_on whose host note names a record in the chain), criticality not
   set, "{server} has no backup recorded · Add backup". "Is this list complete? · Confirm" is
   always last.
8. Empty workspace (no runs_on/built_on edges yet; dev preview with ?demo=empty): render the
   sample estate faded and non-interactive behind a banner "Example data. Link your first app
   to a server to see yours" with the button "Open Hosting & location". Hide the tab badges.
   The sample comes from a static fixture in the client bundle; it is never written to the DB.

TESTS
- Default selection: fixture where a location reaches 13 records and a server 7 -> location
  wins; tie on count -> more apps wins; ?sel overrides.
- Cards: max 6, sorted by count; severity bar segments sum to the count.
- Headline cost = sum of cost-module run cost over the selected + affected records.
- Collapsed lane renders its line + link when its count is 0.
- Badges: each hidden at 0; values equal the matching to-do/report counts.
- Sample never persisted: rendering ?demo=empty makes no write calls; DB object count unchanged.
- Reduced motion: with prefers-reduced-motion: reduce, no element has a running animation.
- To-do: "Is this list complete?" is last; gaps only for records in the chain.

ACCEPTANCE (prototype numbers; real data will differ)
- Shot 35: default Fremont plant (13). Cards: Fremont plant 13, Salesforce platform 8, AS400 7,
  AWS account 7, Microsoft 365 tenant 4, SQL01 2. Caption "4 apps and 3 teams". Strip: 3 apps
  stop · 1 slow down · 3 capabilities hit · 3 teams to call · $39,150/yr. Badges 4 SPOF ·
  1 manual · 1 with no home · 1 with no backup. 7 to-dos (EDI owner, AS400 since Sep 2023,
  FS01/RDS01 unsupported OS, Shop Floor Label Printing no host, RDS01 no backup, complete?).
- Shot 36: Microsoft 365 tenant: 4 apps stop, 1 team, $51,840/yr; capabilities, slow-down
  and infra lanes collapsed.
- Shot 37: faded sample, banner and button, no badges. 1280 wide: no horizontal scroll.

DO NOT
- Compute impact in the client differently from impact_of, hard-code the default record,
  persist or seed sample data, show badges at 0, or add a new header search.
```
