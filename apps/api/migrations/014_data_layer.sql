-- Data layer: cross-layer links for entities, stores, and domains

CREATE TABLE IF NOT EXISTS data_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    subject_type    TEXT NOT NULL,
    subject_id      UUID NOT NULL,
    entity_kind     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    link_kind       TEXT NOT NULL,
    role_tag        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_data_links_subject CHECK (subject_type IN ('data_entity', 'data_store', 'data_domain')),
    CONSTRAINT ck_data_links_entity CHECK (
        entity_kind IN (
            'data_domain', 'data_store', 'data_object', 'application',
            'integration_flow', 'capability', 'process', 'business_domain'
        )
    ),
    CONSTRAINT ck_data_links_kind CHECK (
        link_kind IN (
            'governed_by', 'stored_in', 'managed_by', 'moved_by',
            'uses', 'reads_writes', 'related', 'stores', 'hosts',
            'source_target', 'governs', 'system_of_record'
        )
    ),
    CONSTRAINT uq_data_link UNIQUE (subject_type, subject_id, entity_kind, entity_id, link_kind)
);

CREATE INDEX IF NOT EXISTS ix_data_links_subject ON data_links (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS ix_data_links_workspace_id ON data_links (workspace_id);
