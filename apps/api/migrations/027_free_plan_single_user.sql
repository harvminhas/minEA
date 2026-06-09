-- Free plan: single-user limits (026 may have run before free was included)

UPDATE org_limits ol
SET value = 0
FROM orgs o
WHERE ol.org_id = o.id
  AND o.plan = 'free'
  AND ol.limit_key IN ('max_pending_invites', 'max_admins', 'max_members', 'max_viewers');
