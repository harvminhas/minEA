-- Org settings > People & teams: extra attributes on named owners (people_contacts).
-- Additive only: three nullable columns. Dev and prod share one DB.
ALTER TABLE people_contacts
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT;
