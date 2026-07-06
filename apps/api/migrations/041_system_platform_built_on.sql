-- Enterprise platform links: system → cloud_service uses built_on (not runs_on).
-- runs_on system → cloud_service remains for compute/hosting targets without platform_type.

UPDATE relationships r
SET type = 'built_on'
FROM objects o
WHERE r.to_object_id = o.id
  AND r.type = 'runs_on'
  AND r.from_type IN ('application', 'solution', 'technical_capability')
  AND r.to_type = 'cloud_service'
  AND o.type = 'cloud_service'
  AND o.properties->>'platform_type' IS NOT NULL
  AND trim(o.properties->>'platform_type') <> '';
