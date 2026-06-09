-- Workspace quotas: Free = 1 owned, Solo = 5, Team = 10 (guest workspaces in other orgs are unlimited)

UPDATE org_limits ol
SET value = 1
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'free' AND ol.limit_key = 'max_workspaces';

UPDATE org_limits ol
SET value = 5
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'solo' AND ol.limit_key = 'max_workspaces';

UPDATE org_limits ol
SET value = 10
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'team' AND ol.limit_key = 'max_workspaces';
