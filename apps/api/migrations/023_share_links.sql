-- Share links: public read-only URLs for views and repository objects (plan-gated)

CREATE TABLE IF NOT EXISTS share_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      TEXT UNIQUE NOT NULL,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    resource_type   TEXT NOT NULL CHECK (resource_type IN (
        'view', 'roadmap', 'object', 'capability_map', 'capability_domain'
    )),
    resource_key    TEXT,
    resource_id     UUID,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_share_links_org_id ON share_links (org_id);
CREATE INDEX IF NOT EXISTS ix_share_links_workspace_id ON share_links (workspace_id);
CREATE INDEX IF NOT EXISTS ix_share_links_status ON share_links (org_id, status);

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY share_links_isolation ON share_links
    USING (org_id::text = current_setting('app.org_id', true));

-- Permission: workspace admins (and elevated org admins) can create share links
INSERT INTO permissions (slug, scope, description) VALUES
    ('workspace.share.create', 'workspace', 'Create and manage public share links')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO role_permissions (role_slug, role_scope, permission_slug) VALUES
    ('admin', 'workspace', 'workspace.share.create')
ON CONFLICT DO NOTHING;

-- Per-org share link quota (0 = disabled on free tier via defaults.py seed)
INSERT INTO org_limits (org_id, limit_key, value)
SELECT o.id, 'max_active_share_links', 0
FROM orgs o
WHERE o.plan = 'free'
ON CONFLICT DO NOTHING;

INSERT INTO org_limits (org_id, limit_key, value)
SELECT o.id, 'max_active_share_links', 10
FROM orgs o
WHERE o.plan IN ('starter', 'growth', 'business')
ON CONFLICT DO NOTHING;
