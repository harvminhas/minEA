-- minEA initial schema
-- Run on Supabase SQL editor or via psql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Organisations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT NOT NULL DEFAULT 'free',  -- free | starter | growth | business
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Workspaces ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    template_id       TEXT,          -- starter | classic_ea | product_company | ai_first
    biz_layer_term    TEXT NOT NULL DEFAULT 'Capability',
    app_layer_term    TEXT NOT NULL DEFAULT 'Application',
    constraint_mode   TEXT NOT NULL DEFAULT 'guided',  -- guided | strict | freeflow
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_workspaces_org_id ON workspaces (org_id);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid TEXT UNIQUE NOT NULL,
    org_id      UUID REFERENCES organisations(id) ON DELETE SET NULL,
    email       TEXT NOT NULL,
    full_name   TEXT,
    role        TEXT NOT NULL DEFAULT 'member',  -- admin | member
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_users_firebase_uid ON users (firebase_uid);
CREATE INDEX IF NOT EXISTS ix_users_org_id ON users (org_id);

-- ─── Objects (core table — all 15 types) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS objects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,

    -- Object type (discriminator)
    type            TEXT NOT NULL,
    -- e.g. 'capability', 'application', 'solution', 'technical_capability',
    --       'agent', 'data_object', 'data_store', 'api', 'event',
    --       'integration_flow', 'message_broker', 'tool', 'cloud_service', 'model'

    -- Canonical fields
    name            TEXT NOT NULL,
    description     TEXT,
    owner           TEXT,
    status          TEXT,  -- planned | active | retiring | retired | deprecated | under_evaluation
    tags            TEXT[] NOT NULL DEFAULT '{}',
    external_id     TEXT,
    source          TEXT DEFAULT 'user',  -- user | ai_extraction | import
    confidence      FLOAT,  -- 0.0–1.0; null for manually created

    -- Type-specific attributes (JSONB)
    properties      JSONB NOT NULL DEFAULT '{}',

    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_objects_workspace_type ON objects (workspace_id, type);
CREATE INDEX IF NOT EXISTS ix_objects_org_id ON objects (org_id);
CREATE INDEX IF NOT EXISTS ix_objects_status ON objects (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_objects_updated_at ON objects;
CREATE TRIGGER trg_objects_updated_at
    BEFORE UPDATE ON objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Relationships (typed edges) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relationships (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    type            TEXT NOT NULL,
    from_object_id  UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    from_type       TEXT NOT NULL,
    to_object_id    UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    to_type         TEXT NOT NULL,
    attributes      JSONB NOT NULL DEFAULT '{}',
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_relationships_workspace_type ON relationships (workspace_id, type);
CREATE INDEX IF NOT EXISTS ix_relationships_from_object_id ON relationships (from_object_id);
CREATE INDEX IF NOT EXISTS ix_relationships_to_object_id ON relationships (to_object_id);

-- ─── AI Insights ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_insights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id              UUID NOT NULL,
    type                TEXT NOT NULL,      -- gap | risk | recommendation
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    severity            TEXT,               -- low | medium | high
    affected_object_ids TEXT[] NOT NULL DEFAULT '{}',
    raw_response        JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ai_insights_workspace_id ON ai_insights (workspace_id);

-- ─── Change Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL,
    org_id          UUID NOT NULL,
    object_id       UUID,
    object_type     TEXT,
    action          TEXT NOT NULL,  -- created | updated | deleted
    diff            JSONB,
    performed_by    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_change_log_workspace_id ON change_log (workspace_id);
CREATE INDEX IF NOT EXISTS ix_change_log_object_id ON change_log (object_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS on all tenant tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- RLS policies: scope every query to the authenticated user's org_id.
-- Firebase JWT verified server-side; tenant scope via URL + app.org_id session variable;

CREATE POLICY workspaces_org_isolation ON workspaces
    USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY objects_org_isolation ON objects
    USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY relationships_org_isolation ON relationships
    USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY ai_insights_org_isolation ON ai_insights
    USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY change_log_org_isolation ON change_log
    USING (org_id::text = current_setting('app.org_id', true));
