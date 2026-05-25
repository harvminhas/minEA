-- Auth & Tenancy v1 migration
-- Run after 001_initial.sql

-- Rename organisations → orgs (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organisations')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orgs') THEN
    ALTER TABLE organisations RENAME TO orgs;
  END IF;
END $$;

-- Users: remove direct org coupling; track email verification
ALTER TABLE users DROP COLUMN IF EXISTS org_id;
ALTER TABLE users DROP COLUMN IF EXISTS role;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Workspaces: add slug (unique per org)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS slug TEXT;
UPDATE workspaces SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8)
WHERE slug IS NULL;
ALTER TABLE workspaces ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_workspaces_org_slug ON workspaces (org_id, slug);

-- Org memberships
CREATE TABLE IF NOT EXISTS org_memberships (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS ix_org_memberships_org_id ON org_memberships (org_id);

-- Workspace memberships
CREATE TABLE IF NOT EXISTS workspace_memberships (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS ix_workspace_memberships_workspace_id ON workspace_memberships (workspace_id);

-- Invites
CREATE TABLE IF NOT EXISTS invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token        TEXT UNIQUE NOT NULL,
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_invites_org_id ON invites (org_id);
CREATE INDEX IF NOT EXISTS ix_invites_email ON invites (email);

-- Audit log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    target_type   TEXT,
    target_id     UUID,
    metadata      JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_audit_log_org_id ON audit_log (org_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_created_at ON audit_log (created_at DESC);

-- RLS for new tables
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_memberships_isolation ON org_memberships
    USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY workspace_memberships_isolation ON workspace_memberships
    USING (
        workspace_id IN (
            SELECT id FROM workspaces WHERE org_id::text = current_setting('app.org_id', true)
        )
    );

CREATE POLICY invites_org_isolation ON invites
    USING (org_id::text = current_setting('app.org_id', true));

CREATE POLICY audit_log_org_isolation ON audit_log
    USING (org_id::text = current_setting('app.org_id', true));
