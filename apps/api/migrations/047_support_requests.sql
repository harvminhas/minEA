-- Support requests (in-app Help form, "Get help" after checkout) and owner alerts.
-- Purely additive: two new tables and their indexes, all IF NOT EXISTS. No existing table,
-- column, constraint or row is touched, so it is safe on the shared dev/prod database and safe
-- to run more than once.

CREATE TABLE IF NOT EXISTS support_requests (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug             TEXT,
    user_email           TEXT NOT NULL,
    topic                TEXT NOT NULL CHECK (topic IN ('billing', 'bug', 'other')),
    message              TEXT NOT NULL,
    checkout_session_id  TEXT,
    source               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_support_requests_created_at ON support_requests (created_at DESC);

-- One row per alert sent (or per first sighting of a pending checkout). dedupe_key is unique so
-- the same alert is only ever recorded, and emailed, once.
CREATE TABLE IF NOT EXISTS billing_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        TEXT NOT NULL,
    dedupe_key  TEXT NOT NULL,
    org_slug    TEXT,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_alerts_dedupe_key ON billing_alerts (dedupe_key);
CREATE INDEX IF NOT EXISTS ix_billing_alerts_created_at ON billing_alerts (created_at DESC);
