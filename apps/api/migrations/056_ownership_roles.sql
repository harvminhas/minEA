-- Per-role owners (Business owner / Technical owner / Support team) and a team lead contact.
-- Additive only (dev and prod share one database): one nullable column, one index, and wider CHECKs.
-- No existing row is changed.
--
-- Role owners are people_accountabilities rows: subject_type 'team' or 'contact', entity_kind 'object'
-- (any catalog record, keyed by objects.id), link_kind one of the three role kinds. The record's
-- owner_team_id / point_of_contact_id stay as the primary owner, kept in step by the API.
ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS lead_contact_id UUID NULL REFERENCES people_contacts(id) ON DELETE SET NULL;

-- The CHECKs below only add values to the lists from 013/015/016. NOT VALID: rows already stored are
-- not re-checked, so this cannot fail on existing data; new writes are checked.
ALTER TABLE people_accountabilities DROP CONSTRAINT IF EXISTS ck_people_accountabilities_subject;
ALTER TABLE people_accountabilities
    ADD CONSTRAINT ck_people_accountabilities_subject
    CHECK (subject_type IN ('role', 'team', 'contact')) NOT VALID;

ALTER TABLE people_accountabilities DROP CONSTRAINT IF EXISTS ck_people_accountabilities_entity;
ALTER TABLE people_accountabilities
    ADD CONSTRAINT ck_people_accountabilities_entity
    CHECK (entity_kind IN (
        'product', 'capability', 'business_domain', 'process', 'application', 'data_domain', 'data_store', 'object'
    )) NOT VALID;

ALTER TABLE people_accountabilities DROP CONSTRAINT IF EXISTS ck_people_accountabilities_link;
ALTER TABLE people_accountabilities
    ADD CONSTRAINT ck_people_accountabilities_link
    CHECK (link_kind IN (
        'owns', 'performs', 'approves', 'informed', 'stewards', 'manages',
        'business_owner', 'technical_owner', 'support_team'
    )) NOT VALID;

CREATE INDEX IF NOT EXISTS ix_people_accountabilities_object_roles
    ON people_accountabilities (workspace_id, entity_id)
    WHERE entity_kind = 'object';
