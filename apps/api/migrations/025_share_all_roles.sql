-- Allow all workspace roles to create share links (network effect)

INSERT INTO role_permissions (role_slug, role_scope, permission_slug) VALUES
    ('member', 'workspace', 'workspace.share.create'),
    ('viewer', 'workspace', 'workspace.share.create')
ON CONFLICT DO NOTHING;
