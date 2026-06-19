-- People contacts directory; point of contact references a contact record.

CREATE TABLE IF NOT EXISTS people_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT,
    team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_people_contacts_workspace_id ON people_contacts (workspace_id);
CREATE INDEX IF NOT EXISTS ix_people_contacts_org_id ON people_contacts (org_id);
CREATE INDEX IF NOT EXISTS ix_people_contacts_team_id ON people_contacts (team_id);

ALTER TABLE objects
  ADD COLUMN IF NOT EXISTS point_of_contact_id UUID REFERENCES people_contacts(id) ON DELETE SET NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS point_of_contact_id UUID REFERENCES people_contacts(id) ON DELETE SET NULL;

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS point_of_contact_id UUID REFERENCES people_contacts(id) ON DELETE SET NULL;

ALTER TABLE stages
  ADD COLUMN IF NOT EXISTS point_of_contact_id UUID REFERENCES people_contacts(id) ON DELETE SET NULL;

ALTER TABLE customer_journeys
  ADD COLUMN IF NOT EXISTS point_of_contact_id UUID REFERENCES people_contacts(id) ON DELETE SET NULL;

ALTER TABLE journey_moments
  ADD COLUMN IF NOT EXISTS point_of_contact_id UUID REFERENCES people_contacts(id) ON DELETE SET NULL;

-- Backfill contacts from legacy point_of_contact_name on objects.
INSERT INTO people_contacts (workspace_id, org_id, name, team_id)
SELECT DISTINCT ON (o.workspace_id, o.org_id, lower(trim(o.point_of_contact_name)))
    o.workspace_id,
    o.org_id,
    trim(o.point_of_contact_name),
    o.owner_team_id
FROM objects o
WHERE o.point_of_contact_name IS NOT NULL AND trim(o.point_of_contact_name) <> ''
ORDER BY o.workspace_id, o.org_id, lower(trim(o.point_of_contact_name)), o.created_at;

UPDATE objects o
SET point_of_contact_id = c.id
FROM people_contacts c
WHERE o.point_of_contact_name IS NOT NULL
  AND trim(o.point_of_contact_name) <> ''
  AND c.workspace_id = o.workspace_id
  AND c.org_id = o.org_id
  AND lower(c.name) = lower(trim(o.point_of_contact_name))
  AND (c.team_id IS NOT DISTINCT FROM o.owner_team_id OR c.team_id IS NULL);

-- Products
INSERT INTO people_contacts (workspace_id, org_id, name, team_id)
SELECT DISTINCT ON (p.workspace_id, p.org_id, lower(trim(p.point_of_contact_name)))
    p.workspace_id,
    p.org_id,
    trim(p.point_of_contact_name),
    p.owner_team_id
FROM products p
WHERE p.point_of_contact_name IS NOT NULL AND trim(p.point_of_contact_name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM people_contacts c
    WHERE c.workspace_id = p.workspace_id
      AND c.org_id = p.org_id
      AND lower(c.name) = lower(trim(p.point_of_contact_name))
  );

UPDATE products p
SET point_of_contact_id = c.id
FROM people_contacts c
WHERE p.point_of_contact_name IS NOT NULL
  AND trim(p.point_of_contact_name) <> ''
  AND c.workspace_id = p.workspace_id
  AND c.org_id = p.org_id
  AND lower(c.name) = lower(trim(p.point_of_contact_name));

-- Processes
INSERT INTO people_contacts (workspace_id, org_id, name, team_id)
SELECT DISTINCT ON (p.workspace_id, p.org_id, lower(trim(p.point_of_contact_name)))
    p.workspace_id,
    p.org_id,
    trim(p.point_of_contact_name),
    p.owner_team_id
FROM processes p
WHERE p.point_of_contact_name IS NOT NULL AND trim(p.point_of_contact_name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM people_contacts c
    WHERE c.workspace_id = p.workspace_id
      AND c.org_id = p.org_id
      AND lower(c.name) = lower(trim(p.point_of_contact_name))
  );

UPDATE processes p
SET point_of_contact_id = c.id
FROM people_contacts c
WHERE p.point_of_contact_name IS NOT NULL
  AND trim(p.point_of_contact_name) <> ''
  AND c.workspace_id = p.workspace_id
  AND c.org_id = p.org_id
  AND lower(c.name) = lower(trim(p.point_of_contact_name));

CREATE INDEX IF NOT EXISTS ix_objects_point_of_contact_id ON objects(point_of_contact_id);
CREATE INDEX IF NOT EXISTS ix_products_point_of_contact_id ON products(point_of_contact_id);
