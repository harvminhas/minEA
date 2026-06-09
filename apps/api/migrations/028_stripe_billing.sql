-- Stripe billing: link orgs to Stripe customer + subscription

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS ix_orgs_stripe_customer_id
    ON orgs (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;
