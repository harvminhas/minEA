-- Team owner + optional point of contact on repository and view-layer entities.

ALTER TABLE objects
  ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS point_of_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS point_of_contact_email TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS point_of_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS point_of_contact_email TEXT;

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS point_of_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS point_of_contact_email TEXT;

ALTER TABLE stages
  ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS point_of_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS point_of_contact_email TEXT;

ALTER TABLE customer_journeys
  ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS point_of_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS point_of_contact_email TEXT;

ALTER TABLE journey_moments
  ADD COLUMN IF NOT EXISTS owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS point_of_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS point_of_contact_email TEXT;

CREATE INDEX IF NOT EXISTS ix_objects_owner_team_id ON objects(owner_team_id);
CREATE INDEX IF NOT EXISTS ix_products_owner_team_id ON products(owner_team_id);
