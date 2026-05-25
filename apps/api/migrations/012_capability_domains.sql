-- Business capability map: enforce two-level Domain -> Capability (Option A: scoped duplicates)

-- Unique domain names per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_domain_name_workspace
    ON objects (workspace_id, lower(name))
    WHERE type = 'business_domain';

-- Unique capability names within a domain (duplicates OK across domains)
CREATE UNIQUE INDEX IF NOT EXISTS idx_capability_name_per_domain
    ON objects (workspace_id, lower(properties->>'domain_id'), lower(name))
    WHERE type = 'capability' AND properties->>'domain_id' IS NOT NULL;
