-- Seed data for BuboMap testing
-- Create two workspaces: one empty for first-run testing, one populated for add testing

-- Create organization
INSERT INTO orgs (id, name, slug, plan, created_at)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440000', 'Test Org', 'test-org', 'business', NOW())
ON CONFLICT (slug) DO UPDATE SET id = EXCLUDED.id;

-- Create user
INSERT INTO users (id, firebase_uid, email, full_name, created_at)
VALUES 
  ('660e8400-e29b-41d4-a716-446655440000', 'test-user-001', 'test@example.com', 'Test User', NOW())
ON CONFLICT (firebase_uid) DO UPDATE SET id = EXCLUDED.id;

-- Create org membership
INSERT INTO org_memberships (org_id, user_id, role, created_at)
VALUES 
  ('550e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 'owner', NOW())
ON CONFLICT (user_id, org_id) DO NOTHING;

-- Create empty workspace for first-run testing
INSERT INTO workspaces (id, org_id, name, slug, created_at)
VALUES 
  ('880e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'Empty Workspace', 'empty-workspace', NOW())
ON CONFLICT (org_id, slug) DO UPDATE SET id = EXCLUDED.id;

-- Create workspace membership for empty workspace
INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at)
VALUES 
  ('880e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 'admin', NOW())
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Create populated workspace for add testing (Meridian Fasteners)
INSERT INTO workspaces (id, org_id, name, slug, created_at)
VALUES 
  ('aa0e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'Meridian Fasteners', 'meridian-fasteners', NOW())
ON CONFLICT (org_id, slug) DO UPDATE SET id = EXCLUDED.id;

-- Create workspace membership for populated workspace
INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at)
VALUES 
  ('aa0e8400-e29b-41d4-a716-446655440000', '660e8400-e29b-41d4-a716-446655440000', 'admin', NOW())
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- Add objects to populated workspace
-- Microsoft 365
INSERT INTO objects (id, workspace_id, org_id, type, name, properties, owner, created_at, updated_at, updated_by)
VALUES 
  ('cc0e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'platform', 'Microsoft 365', 
   '{"category": "Productivity", "vendor": "Microsoft", "renewal_date": "2027-01-14", "is_saas": true, "criticality": "High"}', 
   'Infrastructure Team', NOW(), NOW(), '660e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;

-- HubSpot
INSERT INTO objects (id, workspace_id, org_id, type, name, properties, owner, created_at, updated_at, updated_by)
VALUES 
  ('cc0e8400-e29b-41d4-a716-446655440002', 'aa0e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'application', 'HubSpot', 
   '{"category": "Marketing", "vendor": "HubSpot", "renewal_date": "2027-03-15", "is_saas": true, "lifecycle": "Retiring"}', 
   'Marketing Team', NOW(), NOW(), '660e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;

-- QuickBooks Online
INSERT INTO objects (id, workspace_id, org_id, type, name, properties, owner, created_at, updated_at, updated_by)
VALUES 
  ('cc0e8400-e29b-41d4-a716-446655440003', 'aa0e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'application', 'QuickBooks Online', 
   '{"category": "Finance", "vendor": "Intuit", "is_saas": true}', 
   'Finance Team', NOW(), NOW(), '660e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;

-- AS400 Server
INSERT INTO objects (id, workspace_id, org_id, type, name, properties, owner, created_at, updated_at, updated_by)
VALUES 
  ('cc0e8400-e29b-41d4-a716-446655440004', 'aa0e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'infrastructure', 'AS400', 
   '{"category": "Server", "location": "Main plant"}', 
   'Infrastructure Team', NOW(), NOW(), '660e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;

-- Fremont plant (location)
INSERT INTO objects (id, workspace_id, org_id, type, name, properties, owner, created_at, updated_at, updated_by)
VALUES 
  ('cc0e8400-e29b-41d4-a716-446655440005', 'aa0e8400-e29b-41d4-a716-446655440000', '550e8400-e29b-41d4-a716-446655440000', 'location', 'Fremont plant', 
   '{"type": "Facility"}', 
   NULL, NOW(), NOW(), '660e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;

-- Add some runs_on relationships for AS400
INSERT INTO relationships (id, workspace_id, org_id, type, from_object_id, from_type, to_object_id, to_type, attributes, created_at, created_by)
SELECT 
  gen_random_uuid(), 
  'aa0e8400-e29b-41d4-a716-446655440000',
  '550e8400-e29b-41d4-a716-446655440000',
  'runs_on',
  o.id,
  o.type,
  'cc0e8400-e29b-41d4-a716-446655440004',
  'infrastructure',
  '{}',
  NOW(),
  '660e8400-e29b-41d4-a716-446655440000'
FROM objects o
WHERE o.workspace_id = 'aa0e8400-e29b-41d4-a716-446655440000'
  AND o.name IN ('HubSpot', 'QuickBooks Online')
  AND NOT EXISTS (
    SELECT 1 FROM relationships r 
    WHERE r.from_object_id = o.id 
      AND r.to_object_id = 'cc0e8400-e29b-41d4-a716-446655440004'
      AND r.type = 'runs_on'
  );

-- Located_at relationship for AS400 -> Fremont plant
INSERT INTO relationships (id, workspace_id, org_id, type, from_object_id, from_type, to_object_id, to_type, attributes, created_at, created_by)
SELECT 
  gen_random_uuid(), 
  'aa0e8400-e29b-41d4-a716-446655440000',
  '550e8400-e29b-41d4-a716-446655440000',
  'located_at',
  'cc0e8400-e29b-41d4-a716-446655440004',
  'infrastructure',
  'cc0e8400-e29b-41d4-a716-446655440005',
  'location',
  '{}',
  NOW(),
  '660e8400-e29b-41d4-a716-446655440000'
WHERE NOT EXISTS (
  SELECT 1 FROM relationships r 
  WHERE r.from_object_id = 'cc0e8400-e29b-41d4-a716-446655440004'
    AND r.to_object_id = 'cc0e8400-e29b-41d4-a716-446655440005'
    AND r.type = 'located_at'
);
