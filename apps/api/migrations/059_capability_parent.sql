-- 3-level capability maps: L3 is a capability whose parent_id points at an L2.
-- Narrow the existing unique name-per-domain index to L2 only, and add unique names per L3 parent.
-- (Dev and prod share one DB: no table drops, no data rewrites. Existing rows stay L2.)

DROP INDEX IF EXISTS idx_capability_name_per_domain;

CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_name_per_domain
    ON objects (workspace_id, lower(properties->>'domain_id'), lower(name))
    WHERE type = 'capability'
      AND properties->>'domain_id' IS NOT NULL
      AND (properties->>'parent_id' IS NULL OR properties->>'parent_id' = properties->>'domain_id');

CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_name_per_parent
    ON objects (workspace_id, lower(properties->>'parent_id'), lower(name))
    WHERE type = 'capability'
      AND properties->>'parent_id' IS NOT NULL
      AND properties->>'parent_id' IS DISTINCT FROM properties->>'domain_id';
