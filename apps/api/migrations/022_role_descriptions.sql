-- Align role descriptions with product RBAC model (idempotent)

UPDATE roles SET
    name = 'Owner',
    description = 'Full control, billing, delete org'
WHERE slug = 'owner' AND scope = 'org';

UPDATE roles SET
    name = 'Admin',
    description = 'Manage workspace, users, settings — no billing'
WHERE slug = 'admin' AND scope = 'org';

UPDATE roles SET
    name = 'Member',
    description = 'Org member — assign workspace role for content access'
WHERE slug = 'member' AND scope = 'org';

UPDATE roles SET
    name = 'Admin',
    description = 'Manage workspace, users, settings — no billing'
WHERE slug = 'admin' AND scope = 'workspace';

UPDATE roles SET
    name = 'Member',
    description = 'Create and edit repository objects'
WHERE slug = 'member' AND scope = 'workspace';

UPDATE roles SET
    name = 'Viewer',
    description = 'Read-only access to repository and views'
WHERE slug = 'viewer' AND scope = 'workspace';
