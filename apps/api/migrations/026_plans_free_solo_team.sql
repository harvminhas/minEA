-- Plans: Free / Solo / Team (replaces starter, growth, business)

UPDATE orgs SET plan = 'solo' WHERE plan IN ('starter', 'growth');
UPDATE orgs SET plan = 'team' WHERE plan = 'business';

-- Free & Solo: single user, no invites
UPDATE org_limits ol
SET value = 0
FROM orgs o
WHERE ol.org_id = o.id
  AND o.plan IN ('free', 'solo')
  AND ol.limit_key IN ('max_pending_invites', 'max_admins', 'max_members', 'max_viewers');

-- Team: unlimited viewers (null = no cap)
UPDATE org_limits ol
SET value = NULL
FROM orgs o
WHERE ol.org_id = o.id
  AND o.plan = 'team'
  AND ol.limit_key = 'max_viewers';

-- Team: default contributor pool for migrated accounts
UPDATE org_limits ol
SET value = 10
FROM orgs o
WHERE ol.org_id = o.id
  AND o.plan = 'team'
  AND ol.limit_key = 'max_members';
