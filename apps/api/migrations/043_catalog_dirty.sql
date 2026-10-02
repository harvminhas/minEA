-- The model catalog in Firestore is rebuilt on demand, not on every edit.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS catalog_dirty BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS catalog_building BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS catalog_building_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS catalog_built_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS catalog_version INT NOT NULL DEFAULT 0;
