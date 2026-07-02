-- Replace stores_in with operational system ↔ data store access types.

UPDATE relationships
SET type = 'writes'
WHERE type = 'stores_in'
  AND from_type = 'application'
  AND to_type = 'data_store';

-- Primary custodian: earliest writer per store becomes owner (keeps existing writes row).
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
    r.workspace_id,
    r.org_id,
    'owns',
    r.from_object_id,
    r.from_type,
    r.to_object_id,
    r.to_type,
    '{}'::jsonb,
    r.created_by,
    r.created_at
FROM (
    SELECT DISTINCT ON (workspace_id, org_id, to_object_id)
        workspace_id,
        org_id,
        from_object_id,
        from_type,
        to_object_id,
        to_type,
        created_by,
        created_at
    FROM relationships
    WHERE type = 'writes'
      AND from_type = 'application'
      AND to_type = 'data_store'
    ORDER BY workspace_id, org_id, to_object_id, created_at ASC
) r
WHERE NOT EXISTS (
    SELECT 1
    FROM relationships existing
    WHERE existing.workspace_id = r.workspace_id
      AND existing.org_id = r.org_id
      AND existing.type = 'owns'
      AND existing.to_object_id = r.to_object_id
      AND existing.to_type = 'data_store'
);
