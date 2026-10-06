-- One relationship per workspace, type, and pair of ends.
-- Drop exact duplicates first, keeping the earliest by (created_at, id).
DELETE FROM relationships AS r
USING (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY workspace_id, type, from_object_id, to_object_id
                ORDER BY created_at, id
            ) AS n
        FROM relationships
    ) ranked
    WHERE n > 1
) AS d
WHERE r.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_relationships_ends
    ON relationships (workspace_id, type, from_object_id, to_object_id);
