-- Testing: allow share links on free plan (views only) with a small quota

UPDATE org_limits
SET value = 5
WHERE limit_key = 'max_active_share_links'
  AND value = 0;
