-- Derived read model for workspace dashboard / view gates (JSONB snapshot + dirty flag).

CREATE TABLE IF NOT EXISTS workspace_snapshots (
    workspace_id    UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL,
    version         INT NOT NULL DEFAULT 0,
    payload         JSONB NOT NULL DEFAULT '{}',
    built_at        TIMESTAMPTZ,
    dirty           BOOLEAN NOT NULL DEFAULT TRUE,
    rebuilding      BOOLEAN NOT NULL DEFAULT FALSE,
    dirty_at        TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_workspace_snapshots_org_id ON workspace_snapshots (org_id);
CREATE INDEX IF NOT EXISTS ix_workspace_snapshots_dirty ON workspace_snapshots (dirty) WHERE dirty = TRUE;
