-- Vendor contracts as their own records. Additive only: two new tables, nothing existing is touched.
-- Dev and prod share one DB. Per-app cost/licence/renewal fields stay as the fallback for apps with no contract.
CREATE TABLE IF NOT EXISTS vendor_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    vendor_id UUID NULL REFERENCES objects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    annual_cost_cents BIGINT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    notice_days INTEGER NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT false,
    owner_contact_id UUID NULL REFERENCES people_contacts(id) ON DELETE SET NULL,
    document_url TEXT NULL,
    created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vendor_contracts_workspace ON vendor_contracts (workspace_id);
CREATE INDEX IF NOT EXISTS ix_vendor_contracts_vendor ON vendor_contracts (vendor_id);

-- The apps a contract covers, with seats bought and in use for each.
CREATE TABLE IF NOT EXISTS vendor_contract_items (
    contract_id UUID NOT NULL REFERENCES vendor_contracts(id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    seats INTEGER NULL,
    in_use INTEGER NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (contract_id, object_id)
);
CREATE INDEX IF NOT EXISTS ix_vendor_contract_items_object ON vendor_contract_items (object_id);
