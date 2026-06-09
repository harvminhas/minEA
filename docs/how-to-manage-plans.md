# How to manage plans (Free / Solo / Team)

Use this when a customer upgrades, you close a Team deal, or you need to check what an org is on.

**Solo** can be purchased online via Stripe (Org settings → Upgrade with Stripe). See **[stripe-billing.md](stripe-billing.md)** for Stripe setup.

**Team** is still manual (contact us). Plans are stored in Postgres (`orgs.plan` + `org_limits`) and can also be set with the script below or SQL.

---

## Plan summary

| Plan | Who it's for | Repository | Views | AI chat | Invites | Owned workspaces | Share links |
|------|----------------|------------|-------|---------|---------|------------------|-------------|
| **Free** | Try BuboMap | Full | Product portfolio only | No | No | 1 | 1 |
| **Solo** | One paid user | Full | All | Yes | No | 5 | 20 |
| **Team** | Multiple people | Full | All | Yes | Yes | 10 (default) | 50 |

**Guest workspaces** (memberships in other people's orgs) are **unlimited on every plan** — only workspaces you **own** in your org count toward the limit.

**Team specifics**

- **Contributor licenses** — capped (`max_members` in the DB). Contributors are workspace `admin` / `member` roles (people who edit).
- **Viewers** — always **unlimited** on Team (`max_viewers = NULL`).
- Pricing is **custom** — set contributor count per org after you quote.

Source of truth for feature flags: `apps/api/app/services/plan_features.py` (backend) and `apps/web/lib/plan-features.ts` (UI).

---

## Quick commands

Requires `DATABASE_URL` in `apps/api/.env`.

**Windows (PowerShell, from repo root)** — recommended:

```powershell
.\scripts\set-org-plan.ps1 -Org edomains-inc -Show
.\scripts\set-org-plan.ps1 -Org edomains-inc -Plan solo
.\scripts\set-org-plan.ps1 -Org acme-corp -Plan team -Contributors 15
```

**From `apps/api`:**

```bash
cd apps/api
python scripts/set_org_plan.py --org edomains-inc --show

# New signup stays Free automatically — upgrade to Solo
python scripts/set_org_plan.py --org edomains-inc --plan solo

# Team: 15 contributor licenses, unlimited viewers
python scripts/set_org_plan.py --org edomains-inc --plan team --contributors 15

# Preview before writing
python scripts/set_org_plan.py --org edomains-inc --plan team --contributors 15 --dry-run
```

**Common mistakes**

- `python python scripts/...` — duplicate `python`; Python then tries to open a file named `python`.
- Running from repo root without `cd apps/api` — script lives under `apps/api/scripts/`.
- Forgetting `--org` — use `-Org` with the PowerShell helper, or `--org edomains-inc` with Python.

The customer should **refresh the browser** (or sign out/in) after a change.

---

## When to use each plan

### Free (default)

- Every new org is created as `plan = 'free'` (`apps/api/app/routers/orgs.py`).
- Good for evaluation: full repository, product portfolio view, sharing that view, no AI chat, single user.
- **One owned workspace** (the signup workspace) — enough to build and share a portfolio.
- **One active share link** at a time — revoke the existing link to create a new one.
- Can join **unlimited workspaces** that others share or invite you to (guest access in other orgs).

### Solo

- Customer pays for one seat with full product access (Stripe Checkout from org settings, or manual).
- Manual: `--plan solo`
- Invites stay disabled (single user).
- Up to **5 owned workspaces** in the org; guest workspaces elsewhere remain unlimited.

### Team

- Customer contacted you for a quote (Org settings → “Contact us for Team”).
- After agreement:
  1. Set plan: `--plan team --contributors <N>` where **N = contributor licenses sold**.
  2. Confirm in `--show` that `max_viewers` is `unlimited`.
  3. Customer can invite contributors and unlimited viewers from org/workspace settings.

To **change** contributor count later (renewal, expansion):

```bash
python scripts/set_org_plan.py --org acme-corp --plan team --contributors 25
```

---

## What the script changes

For the given org slug it:

1. Sets `orgs.plan` to `free`, `solo`, or `team`.
2. Upserts rows in `org_limits` from `limits_for_plan()` in `plan_features.py`.
3. For Team + `--contributors N`, sets `max_members = N`.

Important limit keys:

| Key | Meaning |
|-----|---------|
| `max_members` | Contributor pool (editors) on Team |
| `max_viewers` | `NULL` = unlimited (Team only) |
| `max_pending_invites` | `0` on Free/Solo |
| `max_active_share_links` | Active share links (Free 1, Solo 20, Team 50) |
| `max_workspaces` | Owned workspaces in this org (Free 1, Solo 5, Team 10) |

---

## Manual SQL (if you prefer)

```sql
-- Find org
SELECT id, slug, plan FROM orgs WHERE slug = 'edomains-inc';

-- Solo
UPDATE orgs SET plan = 'solo' WHERE slug = 'edomains-inc';

-- Team + 15 contributors
UPDATE orgs SET plan = 'team' WHERE slug = 'acme-corp';
UPDATE org_limits SET value = 15
  WHERE org_id = (SELECT id FROM orgs WHERE slug = 'acme-corp')
    AND limit_key = 'max_members';
UPDATE org_limits SET value = NULL
  WHERE org_id = (SELECT id FROM orgs WHERE slug = 'acme-corp')
    AND limit_key = 'max_viewers';

-- Inspect limits
SELECT o.slug, ol.limit_key, ol.value
FROM org_limits ol
JOIN orgs o ON o.id = ol.org_id
WHERE o.slug = 'acme-corp'
ORDER BY ol.limit_key;
```

Prefer the script — it applies the full limit bundle for the plan and is harder to get wrong.

---

## Production

Run against the **production** database (same `DATABASE_URL` you use for migrations):

```bash
cd apps/api
npm run db:migrate          # if new plan migrations exist
npm run db:set-plan -- --org <slug> --plan team --contributors 10
```

Always `--show` first on production.

---

## Legacy plan names

Old values are migrated automatically:

| Old | New |
|-----|-----|
| `starter` | `solo` |
| `growth` | `solo` |
| `business` | `team` |

Migration: `apps/api/migrations/026_plans_free_solo_team.sql`.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Customer still on Free after upgrade | `python scripts/set_org_plan.py --org <slug> --show` — did `orgs.plan` update? |
| “Inviting teammates requires Team” on Solo | Expected. Use `--plan team`. |
| AI chat missing on Free | Expected. Upgrade to Solo or Team. |
| Heatmap/journeys locked | Free plan — upgrade to Solo+. |
| Invite fails with `limit_exceeded` | `--show` → increase `max_members` for Team |
| "Workspace limit reached" on Free | Expected — upgrade to Solo, or use guest access in other orgs |
| Solo user can't create 6th workspace | Expected — `max_workspaces = 5`; guest access elsewhere is still unlimited |
| Free user can't create 2nd share link | Expected — revoke the existing link or upgrade to Solo |

---

## Related docs

- [Deploy on Vercel](deploy-vercel.md)
- Migrations: `apps/api/migrations/026_plans_free_solo_team.sql`, `027_free_plan_single_user.sql`
