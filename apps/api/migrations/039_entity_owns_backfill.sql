-- Backfill owns (application → data_object) from operational managed_by links.

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
    dl.workspace_id,
    dl.org_id,
    'owns',
    dl.entity_id,
    'application',
    dl.subject_id,
    'data_object',
    '{}'::jsonb,
    NULL,
    dl.created_at
FROM data_links dl
WHERE dl.subject_type = 'data_entity'
  AND dl.link_kind = 'managed_by'
  AND dl.entity_kind = 'application'
  AND NOT EXISTS (
      SELECT 1
      FROM relationships existing
      WHERE existing.workspace_id = dl.workspace_id
        AND existing.org_id = dl.org_id
        AND existing.type = 'owns'
        AND existing.from_type = 'application'
        AND existing.from_object_id = dl.entity_id
        AND existing.to_type = 'data_object'
        AND existing.to_object_id = dl.subject_id
  );
