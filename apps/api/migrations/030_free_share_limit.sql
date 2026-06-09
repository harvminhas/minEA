-- Free plan: 1 active share link (was 5 for testing)

UPDATE org_limits ol
SET value = 1
FROM orgs o
WHERE ol.org_id = o.id AND o.plan = 'free' AND ol.limit_key = 'max_active_share_links';
