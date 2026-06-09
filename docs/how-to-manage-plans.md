# How to manage plans (Free / Business)

Use this when a customer upgrades, you close a Business deal, or you need to check what an org is on.

**Business** is contact-only (Org settings → Contact us). Plans are stored in Postgres (`orgs.plan` + `org_limits`) and can be set with the script below or SQL.

---

## Plan summary

| Plan | Who it's for | Users | Workspaces | Repository objects | Views | AI chat | Invites | Share links |
|------|----------------|-------|------------|-------------------|-------|---------|---------|-------------|
| **Free** | Try BuboMap | 1 | 1 owned | 50 | All | No | No | 1 |
| **Business** | Teams & enterprises | Custom | Unlimited | Unlimited | All | Yes | Yes | 50 |

**Guest workspaces** (memberships in other people's orgs) are **unlimited on every plan** — only workspaces you **own** in your org count toward the limit.

**Business specifics**

- **Contributor licenses** — capped (`max_members` in the DB). Contributors are workspace `admin` / `member` roles (people who edit).
- **Viewers** — always **unlimited** on Business (`max_viewers = NULL`).
- **Guided onboarding** — expert setup available; arranged at sale.
- Pricing is **custom** — set contributor count per org after you quote.

Source of truth for feature flags: `apps/api/app/services/plan_features.py` (backend) and `apps/web/lib/plan-features.ts` (UI).

---

## Quick commands

Requires `DATABASE_URL` in `apps/api/.env`.

**Windows (PowerShell, from repo root)** — recommended:

```powershell
.\scripts\set-org-plan.ps1 -Org edomains-inc -Show
.\scripts\set-org-plan.ps1 -Org edomains-inc -Plan business -Contributors 15
.\scripts\set-org-plan.ps1 -Org edomains-inc -Plan free
```

**From `apps/api`:**

```bash
cd apps/api
python scripts/set_org_plan.py --org edomains-inc --show

# New signup stays Free automatically — upgrade to Business
python scripts/set_org_plan.py --org edomains-inc --plan business --contributors 15

# Preview before writing
python scripts/set_org_plan.py --org edomains-inc --plan business --contributors 15 --dry-run
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
- Good for evaluation: full repository, all views, no AI chat, single user.
- **One owned workspace** (the signup workspace).
- **50 repository objects** total per workspace (with one workspace, that's 50 total).
- **One active share link** at a time — revoke the existing link to create a new one.
- Can join **unlimited workspaces** that others share or invite you to (guest access in other orgs).

### Business

- Customer contacted you for a quote (Org settings → “Contact us”).
- After agreement:
  1. Set plan: `--plan business --contributors <N>` where **N = contributor licenses sold**.
  2. Confirm in `--show` that `max_viewers` is `unlimited`.
  3. Customer can invite contributors and unlimited viewers from org/workspace settings.

To **change** contributor count later (renewal, expansion):

```bash
python scripts/set_org_plan.py --org acme-corp --plan business --contributors 25
```

---

## What the script changes

For the given org slug it:

1. Sets `orgs.plan` to `free` or `business`.
2. Upserts rows in `org_limits` from `limits_for_plan()` in `plan_features.py`.
3. For Business + `--contributors N`, sets `max_members = N`.

Important limit keys:

| Key | Meaning |
|-----|---------|
| `max_members` | Contributor pool (editors) on Business |
| `max_viewers` | `NULL` = unlimited (Business only) |
| `max_pending_invites` | `0` on Free |
| `max_active_share_links` | Active share links (Free 1, Business 50) |
| `max_workspaces` | Owned workspaces (Free 1, Business unlimited) |
| `max_objects_per_workspace` | Repository objects (Free 50, Business unlimited) |

---

## Manual SQL (if you prefer)

```sql
-- Find org
SELECT id, slug, plan FROM orgs WHERE slug = 'edomains-inc';

-- Business + 15 contributors
UPDATE orgs SET plan = 'business' WHERE slug = 'acme-corp';
UPDATE org_limits SET value = 15
  WHERE org_id = (SELECT id FROM orgs WHERE slug = 'acme-corp')
    AND limit_key = 'max_members';
UPDATE org_limits SET value = NULL
  WHERE org_id = (SELECT id FROM orgs WHERE slug = 'acme-corp')
    AND limit_key IN ('max_viewers', 'max_workspaces', 'max_objects_per_workspace');

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
npm run db:set-plan -- --org <slug> --plan business --contributors 10
```

Always `--show` first on production.

---

## Legacy plan names

Old values are migrated automatically:

| Old | New |
|-----|-----|
| `starter` | `business` |
| `growth` | `business` |
| `solo` | `business` |
| `team` | `business` |

Migration: `apps/api/migrations/031_plans_free_business.sql`.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Customer still on Free after upgrade | `python scripts/set_org_plan.py --org <slug> --show` — did `orgs.plan` update? |
| “Inviting teammates requires Business” on Free | Expected. Use `--plan business`. |
| AI chat missing on Free | Expected. Upgrade to Business. |
| Invite fails with `limit_exceeded` | `--show` → increase `max_members` for Business |
| "Workspace limit reached" on Free | Expected — contact for Business, or use guest access in other orgs |
| Free user can't create 51st object | Expected — `max_objects_per_workspace = 50` |
| Free user can't create 2nd share link | Expected — revoke the existing link or upgrade to Business |

---

## Related docs

- [Deploy on Vercel](deploy-vercel.md)
- Migrations: `apps/api/migrations/031_plans_free_business.sql`
