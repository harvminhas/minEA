-- Backfill team accountabilities from owner_team_id on repository and view entities.

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), o.workspace_id, o.org_id, 'team', o.owner_team_id, 'application', o.id, 'manages'
FROM objects o
WHERE o.owner_team_id IS NOT NULL
  AND o.type IN ('application', 'solution')
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), o.workspace_id, o.org_id, 'team', o.owner_team_id, 'capability', o.id, 'owns'
FROM objects o
WHERE o.owner_team_id IS NOT NULL
  AND o.type = 'capability'
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), o.workspace_id, o.org_id, 'team', o.owner_team_id, 'business_domain', o.id, 'owns'
FROM objects o
WHERE o.owner_team_id IS NOT NULL
  AND o.type = 'business_domain'
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), o.workspace_id, o.org_id, 'team', o.owner_team_id, 'data_domain', o.id, 'owns'
FROM objects o
WHERE o.owner_team_id IS NOT NULL
  AND o.type = 'data_domain'
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), o.workspace_id, o.org_id, 'team', o.owner_team_id, 'data_store', o.id, 'stewards'
FROM objects o
WHERE o.owner_team_id IS NOT NULL
  AND o.type = 'data_store'
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), p.workspace_id, p.org_id, 'team', p.owner_team_id, 'product', p.id, 'owns'
FROM products p
WHERE p.owner_team_id IS NOT NULL
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;

INSERT INTO people_accountabilities (id, workspace_id, org_id, subject_type, subject_id, entity_kind, entity_id, link_kind)
SELECT gen_random_uuid(), p.workspace_id, p.org_id, 'team', p.owner_team_id, 'process', p.id, 'owns'
FROM processes p
WHERE p.owner_team_id IS NOT NULL
ON CONFLICT (subject_type, subject_id, entity_kind, entity_id, link_kind) DO NOTHING;
