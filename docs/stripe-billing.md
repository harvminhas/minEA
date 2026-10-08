# Stripe billing (self-serve packs)

Starter, Team and Business are bought by card through Stripe Checkout and managed in the Stripe
Customer Portal. Prices are USD; plans differ only in licences (people who edit):
Starter 1, Team 5, Business 10. Viewers are free. Free has 1 editor.

## Switches

| Where | Variable | Effect |
|-------|----------|--------|
| API | `STRIPE_SECRET_KEY` | Unset = everything Stripe is off (checkout/portal return 503, webhook events ignored). |
| API | `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint. Unset = webhook returns 503. |
| API | `STRIPE_TEST_ORG_SLUGS` | With a **test** key, only these org slugs can check out or be changed by webhooks (dev and prod share one database). Ignored with a live key. |
| API | `STRIPE_AUTOMATIC_TAX` | `1` = Stripe Tax on Checkout (`automatic_tax`, billing address, tax ID). Needs Stripe Tax set up in the Dashboard (head office address) first. Default off. |
| API | `WEB_APP_URL` | Base for Checkout success/cancel and portal return URLs (`/orgs/<slug>/settings?tab=billing`). |
| Web | `NEXT_PUBLIC_BILLING_UI` | Shows the admin centre. Off in production until flipped. |

The web shows real Checkout only when the API's billing status says `checkout_available`;
otherwise the "Checkout coming soon" dialog stays.

## Catalogue

`apps/api/app/services/plans.json` is the one plan source (Python loads it; the web's
`lib/billing/plans.ts` mirrors it and parity tests on both sides fail on drift).

Create or update the Stripe objects idempotently:

```bash
cd apps/api
python scripts/stripe_bootstrap.py --key-env STRIPE_SECRET_KEY          # refuses live keys without --allow-live
python scripts/stripe_bootstrap.py --key-env STRIPE_SECRET_KEY \
  --webhook-url https://<host>/api/v1/webhooks/stripe --secret-out ~/.secrets/stripe-webhook.env
```

- Products `bubomap_starter|team|business` (fixed ids, metadata `plan`, `licences`).
- Prices by lookup key `bubomap_<plan>_<monthly|yearly>`, USD, `tax_behavior=exclusive`.
  The API finds prices by lookup key and refuses one whose amount/currency/interval no longer
  matches `plans.json`, so no price-id env vars are needed.
- Portal configurations by `metadata.bubomap_portal`: `all` (3 packs), `team_up` (Team, Business),
  `business_only`. The portal opens with the smallest one the org's licences in use fit into, so a
  customer can't downgrade below their licence count. Payment method update, invoice history,
  cancel at period end (with reasons), price switching with `always_invoice` proration;
  switching yearly → monthly is scheduled at period end.
- Webhook endpoint (API version pinned to `2024-12-18.acacia`, same as `stripe==11.4.1`).
  The signing secret is written only to `--secret-out` (chmod 600).

## Endpoints

- `POST /api/v1/orgs/{slug}/billing/checkout` `{plan, interval}` → Checkout URL. Org owner/admin
  with a verified email. Creates or reuses one Stripe customer per org (`metadata.org_id`).
  Refuses if the org already has a subscription (use the portal) or if licences in use exceed
  the pack.
- `POST /api/v1/orgs/{slug}/billing/portal` → Customer Portal URL. Owner/admin, verified email.
- `GET /api/v1/orgs/{slug}/billing/status` adds `checkout_available`, `display_plan`,
  `licences_used`, `licences_cap`, `over_licence_cap`, `has_billing_account`, `can_manage_billing`.
- `POST /api/v1/webhooks/stripe` — FastAPI. The web app proxies `/api/v1/*` byte-for-byte, so the
  same path works on the web origin too.

## Webhook → plan

Events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
`invoice.paid`, `invoice.payment_failed`.

- Signature verified on the raw body; events whose `livemode` differs from the key are ignored.
- An event changes an org only if its `stripe_subscription_id` matches, or (linking a new
  subscription) the org id in our metadata matches **and** the customer is the org's customer.
- Subscription state is re-read from Stripe, so out-of-order delivery converges.
- Price → plan by lookup key (metadata as fallback); licences come from `plans.json`.
- `active`, `trialing`, `past_due` keep the paid plan. `canceled`, `unpaid`,
  `incomplete_expired` → **Free, data kept** (limits only; no rows deleted, no roles changed).
- Every processed event id is recorded in `audit_log` (`billing.stripe_event`) and skipped on
  redelivery. Plan changes are audited as `billing.plan_changed` / `billing.plan_downgraded`.
- `invoice.payment_failed` is recorded (`billing.payment_failed`); no plan change.

## Licences

`org_limits.max_editor_seats` holds the cap (Stripe packs and Free after a cancel). Missing/NULL
= no cap, which is how hand-set **Business (legacy)** orgs stay unchanged. The cap is checked
only when someone new would get edit rights (org admin invites/promotions, workspace admin/member
invites, accepting those invites). Existing editors keep access and reads are never gated; an org
over its cap after a downgrade sees a banner on Plan & billing.

## Manual plans

`set_org_plan.py` still sets `free` or `business` (legacy) by hand. See
[how-to-manage-plans.md](how-to-manage-plans.md).
