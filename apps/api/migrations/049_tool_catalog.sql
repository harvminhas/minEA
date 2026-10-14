-- App catalogue editable by platform admins (was only the bundled tools.json).
-- Additive only: two new tables, nothing existing is touched. Dev and prod share one DB.
-- Rows are seeded from app/data/tools.json by the API on first use when the table is empty.
CREATE TABLE IF NOT EXISTS tool_catalog_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    aliases JSONB NOT NULL DEFAULT '[]',
    vendor TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    hosting TEXT NOT NULL DEFAULT 'either',
    kind TEXT NOT NULL DEFAULT 'app',
    typical_annual INTEGER NULL,
    sso_usual BOOLEAN NOT NULL DEFAULT false,
    extra JSONB NOT NULL DEFAULT '{}',
    updated_by TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Names people typed that the catalogue didn't know (with the AI suggestion, if any).
-- No org or user is stored: only the typed product name and a count.
CREATE TABLE IF NOT EXISTS tool_catalog_misses (
    name_key TEXT PRIMARY KEY,
    sample TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    suggestion JSONB NULL,
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tool_catalog_misses_count_idx ON tool_catalog_misses (count DESC);
