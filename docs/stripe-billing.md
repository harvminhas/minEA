# Stripe billing — Solo self-serve upgrade

Free org owners can upgrade to **Solo** from **Org settings → Plan** via Stripe Checkout. Team remains contact-us / manual.

---

## What happens

1. Owner clicks **Upgrade with Stripe** on the Plan card.
2. API creates a Stripe Checkout session (`POST /api/v1/orgs/{slug}/billing/solo/checkout`).
3. User pays on Stripe-hosted checkout.
4. Stripe sends `checkout.session.completed` to `/api/v1/webhooks/stripe`.
5. Webhook sets `orgs.plan = 'solo'`, applies Solo limits, stores `stripe_customer_id` + `stripe_subscription_id`.

If the subscription is cancelled in Stripe, `customer.subscription.deleted` downgrades the org back to **Free**.

---

## One-time Stripe setup

### 1. Create product + price

In [Stripe Dashboard](https://dashboard.stripe.com):

1. **Product catalog → Add product** — e.g. "BuboMap Solo"
2. Add a **recurring monthly** price
3. Copy the **Price ID** (`price_...`)

### 2. API environment variables (`apps/api`)

| Variable | Example |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_SOLO_PRICE_ID` | `price_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `WEB_APP_URL` | `https://your-web.vercel.app` (success/cancel redirect URLs) |

### 3. Webhook endpoint

**Production:** Stripe Dashboard → Developers → Webhooks → Add endpoint

- URL: `https://your-api.vercel.app/api/v1/webhooks/stripe`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.deleted`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET` on the **API** project.

**Local dev** with Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe
```

Use the printed `whsec_...` in `apps/api/.env`.

### 4. Web UI (optional)

On the **web** Vercel project:

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_SOLO_PRICE_LABEL` | `$29/month` |

Shown on the upgrade card; does not affect Stripe charges (price comes from `STRIPE_SOLO_PRICE_ID`).

### 5. Database migration

```bash
cd apps/api && npm run db:migrate
```

Adds `stripe_customer_id` and `stripe_subscription_id` to `orgs`.

---

## Test flow (test mode)

1. Set `sk_test_...` and a test `price_...` on the API.
2. Run API + web locally; forward webhooks with `stripe listen`.
3. Open org settings as **owner** on a **Free** org.
4. Click **Upgrade with Stripe** — use card `4242 4242 4242 4242`.
5. After redirect, confirm plan shows **Solo** (may take a few seconds for the webhook).

Or verify manually:

```powershell
.\scripts\set-org-plan.ps1 -Org your-org -Show
```

---

## Manual overrides

Sales-assisted changes still use [how-to-manage-plans.md](how-to-manage-plans.md). Stripe-managed Solo orgs should be changed in Stripe (cancel subscription) rather than only via SQL, or limits can drift.

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/orgs/{slug}/billing/status` | Member | Plan + whether Solo checkout is available |
| `POST` | `/orgs/{slug}/billing/solo/checkout` | Owner (`org.billing.manage`) | Returns `{ checkout_url }` |
| `POST` | `/webhooks/stripe` | Stripe signature | Handles subscription events |
