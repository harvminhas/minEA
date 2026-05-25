-- Roles, permissions, org limits, and invite lifecycle (v1 auth slice)
-- Idempotent — safe to re-run

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Roles & permissions (data-driven authorization) ────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    slug        TEXT NOT NULL,
    scope       TEXT NOT NULL CHECK (scope IN ('org', 'workspace')),
    name        TEXT NOT NULL,
    description TEXT,
    PRIMARY KEY (slug, scope)
);

CREATE TABLE IF NOT EXISTS permissions (
    slug        TEXT PRIMARY KEY,
    scope       TEXT NOT NULL CHECK (scope IN ('org', 'workspace')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_slug       TEXT NOT NULL,
    role_scope      TEXT NOT NULL,
    permission_slug TEXT NOT NULL REFERENCES permissions(slug) ON DELETE CASCADE,
    PRIMARY KEY (role_slug, role_scope, permission_slug),
    FOREIGN KEY (role_slug, role_scope) REFERENCES roles(slug, scope) ON DELETE CASCADE
);

-- ─── Per-org quota values (null = unlimited) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS org_limits (
    org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    limit_key   TEXT NOT NULL,
    value       INTEGER,
    PRIMARY KEY (org_id, limit_key)
);

CREATE INDEX IF NOT EXISTS ix_org_limits_org_id ON org_limits (org_id);

-- ─── Workspace roles: editor → member ───────────────────────────────────────
UPDATE workspace_memberships SET role = 'member' WHERE role = 'editor';

ALTER TABLE workspace_memberships DROP CONSTRAINT IF EXISTS workspace_memberships_role_check;
ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_role_check
    CHECK (role IN ('admin', 'member', 'viewer'));

-- ─── Invites: workspace scope, hashed tokens, lifecycle status ──────────────
ALTER TABLE invites ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invites' AND column_name = 'token'
    ) THEN
        UPDATE invites
        SET token_hash = encode(digest(token, 'sha256'), 'hex')
        WHERE token_hash IS NULL AND token IS NOT NULL;
    END IF;
END $$;

UPDATE invites SET status = 'accepted' WHERE status IS NULL AND consumed_at IS NOT NULL;
UPDATE invites SET status = 'expired'  WHERE status IS NULL AND expires_at < now() AND consumed_at IS NULL;
UPDATE invites SET status = 'pending'  WHERE status IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM invites WHERE token_hash IS NULL
    ) THEN
        RAISE EXCEPTION 'invites.token_hash backfill incomplete';
    END IF;
END $$;

ALTER TABLE invites ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE invites ALTER COLUMN status SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ix_invites_token_hash ON invites (token_hash);

ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_role_check;
ALTER TABLE invites ADD CONSTRAINT invites_role_check
    CHECK (role IN ('admin', 'member', 'viewer'));

ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_status_check;
ALTER TABLE invites ADD CONSTRAINT invites_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'));

ALTER TABLE invites DROP COLUMN IF EXISTS token;

CREATE INDEX IF NOT EXISTS ix_invites_workspace_id ON invites (workspace_id);
CREATE INDEX IF NOT EXISTS ix_invites_status ON invites (org_id, status);

-- ─── Seed roles ───────────────────────────────────────────────────────────────
INSERT INTO roles (slug, scope, name, description) VALUES
    ('owner',  'org',       'Owner',  'Full org control including billing and deletion'),
    ('admin',  'org',       'Admin',  'Manage org members, settings, and workspaces'),
    ('member', 'org',       'Member', 'Org member without admin privileges'),
    ('admin',  'workspace', 'Admin',  'Manage workspace members, settings, and content'),
    ('member', 'workspace', 'Member', 'Read and write workspace content'),
    ('viewer', 'workspace', 'Viewer', 'Read-only workspace access')
ON CONFLICT (slug, scope) DO NOTHING;

-- ─── Seed permissions ─────────────────────────────────────────────────────────
INSERT INTO permissions (slug, scope, description) VALUES
    ('org.settings.edit',        'org', 'Edit org settings'),
    ('org.member.invite',        'org', 'Invite org members'),
    ('org.member.remove',        'org', 'Remove org members'),
    ('org.role.assign',          'org', 'Change member roles'),
    ('org.delete',               'org', 'Delete the org'),
    ('org.billing.manage',       'org', 'Manage billing'),
    ('org.transfer',             'org', 'Transfer ownership'),
    ('workspace.create',         'org', 'Create workspaces'),
    ('workspace.settings.edit',  'workspace', 'Edit workspace settings'),
    ('workspace.member.invite',  'workspace', 'Invite workspace members'),
    ('workspace.member.remove',  'workspace', 'Remove workspace members'),
    ('workspace.delete',         'workspace', 'Delete workspace'),
    ('object.create',            'workspace', 'Create objects'),
    ('object.edit',              'workspace', 'Edit objects'),
    ('object.delete',            'workspace', 'Delete objects'),
    ('object.view',              'workspace', 'View objects'),
    ('scenario.create',          'workspace', 'Create scenarios'),
    ('scenario.promote',         'workspace', 'Promote scenarios'),
    ('sandbox.create',           'workspace', 'Create sandboxes'),
    ('extraction.run',           'workspace', 'Run AI extractions')
ON CONFLICT (slug) DO NOTHING;

-- ─── Seed role → permission mappings ─────────────────────────────────────────
INSERT INTO role_permissions (role_slug, role_scope, permission_slug)
SELECT 'owner', 'org', slug FROM permissions WHERE scope = 'org'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_slug, role_scope, permission_slug) VALUES
    ('admin', 'org', 'org.settings.edit'),
    ('admin', 'org', 'org.member.invite'),
    ('admin', 'org', 'org.member.remove'),
    ('admin', 'org', 'org.role.assign'),
    ('admin', 'org', 'workspace.create')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_slug, role_scope, permission_slug)
SELECT 'admin', 'workspace', slug FROM permissions WHERE scope = 'workspace'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_slug, role_scope, permission_slug) VALUES
    ('member', 'workspace', 'object.create'),
    ('member', 'workspace', 'object.edit'),
    ('member', 'workspace', 'object.delete'),
    ('member', 'workspace', 'object.view'),
    ('member', 'workspace', 'scenario.create'),
    ('member', 'workspace', 'sandbox.create'),
    ('member', 'workspace', 'extraction.run')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_slug, role_scope, permission_slug) VALUES
    ('viewer', 'workspace', 'object.view')
ON CONFLICT DO NOTHING;

-- ─── Default limits for existing orgs ─────────────────────────────────────────
INSERT INTO org_limits (org_id, limit_key, value)
SELECT o.id, k.limit_key, k.value
FROM orgs o
CROSS JOIN (VALUES
    ('max_owners', 1),
    ('max_admins', 5),
    ('max_members', 50),
    ('max_viewers', 50),
    ('max_workspaces', 10),
    ('max_objects_per_workspace', 1000),
    ('max_pending_invites', 20),
    ('max_scenarios_per_workspace', 10),
    ('max_sandboxes_per_workspace', 5),
    ('ai_extractions_per_month', 100)
) AS k(limit_key, value)
ON CONFLICT DO NOTHING;
