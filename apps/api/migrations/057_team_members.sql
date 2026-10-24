-- People & teams: a person can belong to several teams, and the old "roles" list can be retired.
-- Additive only (dev and prod share one database): one new table, one nullable column. No existing row
-- is changed; people_contacts.team_id stays as the person's primary team and the API keeps it in step.
CREATE TABLE IF NOT EXISTS team_members (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES people_contacts(id) ON DELETE CASCADE,
    title TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, contact_id)
);
CREATE INDEX IF NOT EXISTS ix_team_members_contact ON team_members (contact_id);

-- Everyone who already has a team is a member of it.
INSERT INTO team_members (team_id, contact_id)
SELECT team_id, id FROM people_contacts WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Set when an old role is turned into a title or dropped; retired roles are hidden, rows are kept.
ALTER TABLE people_roles ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ NULL;
