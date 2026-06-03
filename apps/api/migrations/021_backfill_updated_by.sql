-- Backfill updated_by on objects from the most recent change_log entry per object
UPDATE objects o
SET updated_by = (
    SELECT cl.performed_by
    FROM change_log cl
    WHERE cl.object_id = o.id
      AND cl.performed_by IS NOT NULL
    ORDER BY cl.created_at DESC
    LIMIT 1
)
WHERE o.updated_by IS NULL;

-- Backfill updated_by on products from the most recent change_log entry per product
UPDATE products p
SET updated_by = (
    SELECT cl.performed_by
    FROM change_log cl
    WHERE cl.object_id = p.id
      AND cl.performed_by IS NOT NULL
    ORDER BY cl.created_at DESC
    LIMIT 1
)
WHERE p.updated_by IS NULL;
