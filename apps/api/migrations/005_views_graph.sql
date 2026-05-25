-- Views graph: repository entities projected by Views (spec §5.1)
-- Capabilities/systems remain in `objects`; new first-class entities here.

-- ─── Products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    product_line    TEXT,
    lifecycle       TEXT NOT NULL DEFAULT 'planned',
    owner           TEXT,
    description     TEXT,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_products_workspace_id ON products (workspace_id);
CREATE INDEX IF NOT EXISTS ix_products_org_id ON products (org_id);

CREATE TABLE IF NOT EXISTS product_capabilities (
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    capability_id   UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, capability_id)
);

CREATE TABLE IF NOT EXISTS product_system_overrides (
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    system_id       UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, system_id)
);

-- ─── Realizations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS realizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    capability_id   UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    maturity        TEXT NOT NULL DEFAULT 'manual',
    owner           TEXT,
    cost            NUMERIC(14, 2),
    volume_pct      DOUBLE PRECISION,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_realizations_maturity CHECK (
        maturity IN ('manual', 'partial', 'automated', 'outsourced')
    )
);

CREATE INDEX IF NOT EXISTS ix_realizations_capability_id ON realizations (capability_id);
CREATE INDEX IF NOT EXISTS ix_realizations_workspace_id ON realizations (workspace_id);

CREATE TABLE IF NOT EXISTS realization_systems (
    realization_id  UUID NOT NULL REFERENCES realizations(id) ON DELETE CASCADE,
    system_id       UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    PRIMARY KEY (realization_id, system_id)
);

-- ─── Processes & stages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    trigger_event   TEXT,
    value_delivered TEXT,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_processes_workspace_id ON processes (workspace_id);

CREATE TABLE IF NOT EXISTS stages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id          UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    position            INT NOT NULL DEFAULT 0,
    name                TEXT NOT NULL,
    cycle_time_current  DOUBLE PRECISION,
    cycle_time_target   DOUBLE PRECISION,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_stages_process_id ON stages (process_id);

CREATE TABLE IF NOT EXISTS stage_capabilities (
    stage_id        UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    capability_id   UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    PRIMARY KEY (stage_id, capability_id)
);

-- ─── Customer journeys ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_journeys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    customer_segment TEXT,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journey_moments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id      UUID NOT NULL REFERENCES customer_journeys(id) ON DELETE CASCADE,
    position        INT NOT NULL DEFAULT 0,
    name            TEXT NOT NULL,
    emotion         TEXT,
    touchpoint_type TEXT,
    friction_notes  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moment_processes (
    moment_id       UUID NOT NULL REFERENCES journey_moments(id) ON DELETE CASCADE,
    process_id      UUID NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
    PRIMARY KEY (moment_id, process_id)
);

-- ─── Investments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investments (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id                UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id                      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    target_realization_id       UUID NOT NULL REFERENCES realizations(id) ON DELETE CASCADE,
    hypothesis                  TEXT,
    status                      TEXT NOT NULL DEFAULT 'proposed',
    expected_cycle_time_delta   DOUBLE PRECISION,
    expected_cost_delta         NUMERIC(14, 2),
    expected_throughput_delta   DOUBLE PRECISION,
    effort_estimate             TEXT,
    owner                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_investments_status CHECK (
        status IN ('proposed', 'approved', 'in_flight', 'done', 'cancelled')
    )
);

CREATE INDEX IF NOT EXISTS ix_investments_workspace_id ON investments (workspace_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_realizations_updated_at ON realizations;
CREATE TRIGGER trg_realizations_updated_at
    BEFORE UPDATE ON realizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_processes_updated_at ON processes;
CREATE TRIGGER trg_processes_updated_at
    BEFORE UPDATE ON processes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_journeys_updated_at ON customer_journeys;
CREATE TRIGGER trg_journeys_updated_at
    BEFORE UPDATE ON customer_journeys FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_investments_updated_at ON investments;
CREATE TRIGGER trg_investments_updated_at
    BEFORE UPDATE ON investments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_system_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE realizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE realization_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE moment_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_org_isolation ON products
    USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY product_capabilities_org_isolation ON product_capabilities
    USING (EXISTS (
        SELECT 1 FROM products p WHERE p.id = product_id
        AND p.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY product_system_overrides_org_isolation ON product_system_overrides
    USING (EXISTS (
        SELECT 1 FROM products p WHERE p.id = product_id
        AND p.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY realizations_org_isolation ON realizations
    USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY realization_systems_org_isolation ON realization_systems
    USING (EXISTS (
        SELECT 1 FROM realizations r WHERE r.id = realization_id
        AND r.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY processes_org_isolation ON processes
    USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY stages_org_isolation ON stages
    USING (EXISTS (
        SELECT 1 FROM processes p WHERE p.id = process_id
        AND p.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY stage_capabilities_org_isolation ON stage_capabilities
    USING (EXISTS (
        SELECT 1 FROM stages s
        JOIN processes p ON p.id = s.process_id
        WHERE s.id = stage_id
        AND p.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY customer_journeys_org_isolation ON customer_journeys
    USING (org_id::text = current_setting('app.org_id', true));
CREATE POLICY journey_moments_org_isolation ON journey_moments
    USING (EXISTS (
        SELECT 1 FROM customer_journeys j WHERE j.id = journey_id
        AND j.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY moment_processes_org_isolation ON moment_processes
    USING (EXISTS (
        SELECT 1 FROM journey_moments m
        JOIN customer_journeys j ON j.id = m.journey_id
        WHERE m.id = moment_id
        AND j.org_id::text = current_setting('app.org_id', true)
    ));
CREATE POLICY investments_org_isolation ON investments
    USING (org_id::text = current_setting('app.org_id', true));
