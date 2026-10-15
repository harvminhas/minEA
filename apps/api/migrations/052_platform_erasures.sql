-- Platform admin "Erase user" audit trail. Additive: one new table, no changes to existing ones.
-- Kept outside orgs/users (no foreign keys) so the record survives the erase it describes.
CREATE TABLE IF NOT EXISTS platform_erasures (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    erased_user_id    UUID NOT NULL,
    erased_email      TEXT NOT NULL,
    erased_by_email   TEXT NOT NULL,
    erased_by_uid     TEXT NOT NULL,
    counts            JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_subscriptions BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_platform_erasures_created_at ON platform_erasures (created_at DESC);
