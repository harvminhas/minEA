-- Domain assignment via belongs_to (entity/store → domain).

INSERT INTO relationships (
    id,
    workspace_id,
    org_id,
    type,
    from_object_id,
    from_type,
    to_object_id,
    to_type,
    attributes,
    created_by,
    created_at
)
SELECT
    gen_random_uuid(),
    o.workspace_id,
    o.org_id,
    'belongs_to',
    o.id,
    o.type,
    (o.properties->>'data_domain_id')::uuid,
    'data_domain',
    '{}'::jsonb,
    o.created_by,
    o.created_at
FROM objects o
WHERE o.type IN ('data_object', 'data_store')
  AND o.properties ? 'data_domain_id'
  AND (o.properties->>'data_domain_id') ~* '^[0-9a-f-]{36}$'
  AND NOT EXISTS (
      SELECT 1
      FROM relationships existing
      WHERE existing.workspace_id = o.workspace_id
        AND existing.org_id = o.org_id
        AND existing.type = 'belongs_to'
        AND existing.from_object_id = o.id
        AND existing.from_type = o.type
        AND existing.to_object_id = (o.properties->>'data_domain_id')::uuid
        AND existing.to_type = 'data_domain'
  );
