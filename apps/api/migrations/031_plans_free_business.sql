-- Two-tier pricing: Free + Business (replaces Solo / Team)

UPDATE orgs SET plan = 'business' WHERE plan IN ('solo', 'team', 'starter', 'growth');

-- Free: 1 workspace, 50 repository objects, single user
UPDATE org_limits ol
SET value = 1
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'free' AND ol.limit_key = 'max_workspaces';

UPDATE org_limits ol
SET value = 50
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'free' AND ol.limit_key = 'max_objects_per_workspace';

INSERT INTO org_limits (org_id, limit_key, value)
SELECT o.id, 'max_objects_per_workspace', 50
FROM orgs o
WHERE o.plan = 'free'
ON CONFLICT (org_id, limit_key) DO UPDATE SET value = 50;

UPDATE org_limits ol
SET value = 0
FROM orgs o
WHERE ol.org_id = o.id
  AND o.plan = 'free'
  AND ol.limit_key IN ('max_pending_invites', 'max_admins', 'max_members', 'max_viewers');

-- Business: unlimited workspaces and repository objects
UPDATE org_limits ol
SET value = NULL
FROM orgs o
WHERE ol.org_id = o.id
  AND o.plan = 'business'
  AND ol.limit_key IN ('max_workspaces', 'max_objects_per_workspace', 'max_viewers');

UPDATE org_limits ol
SET value = 50
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'business' AND ol.limit_key = 'max_active_share_links';

UPDATE org_limits ol
SET value = 50
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'business' AND ol.limit_key = 'max_pending_invites';
