-- Per-person first-run progress. Not a new table.
ALTER TABLE workspace_memberships
    ADD COLUMN IF NOT EXISTS setup JSONB NOT NULL DEFAULT '{}';
