-- Track who last updated a product (for "Updated by X" on cards)
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Speed up change_log history queries per-object
CREATE INDEX IF NOT EXISTS ix_change_log_object_id_created ON change_log (object_id, created_at DESC)
    WHERE object_id IS NOT NULL;
