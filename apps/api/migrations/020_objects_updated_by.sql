-- Track who last updated a repository object (for "Updated by X" on system cards)
ALTER TABLE objects ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
