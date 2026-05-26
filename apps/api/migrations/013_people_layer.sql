-- People layer: organizational roles, teams, and cross-layer accountabilities

CREATE TABLE IF NOT EXISTS people_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role_kind       TEXT NOT NULL DEFAULT 'owner',
    description     TEXT,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_people_roles_kind CHECK (role_kind IN ('owner', 'performer', 'steward'))
);

CREATE INDEX IF NOT EXISTS ix_people_roles_workspace_id ON people_roles (workspace_id);
CREATE INDEX IF NOT EXISTS ix_people_roles_org_id ON people_roles (org_id);

CREATE TABLE IF NOT EXISTS teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    lead_name       TEXT,
    lead_email      TEXT,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_teams_workspace_id ON teams (workspace_id);
CREATE INDEX IF NOT EXISTS ix_teams_org_id ON teams (org_id);

CREATE TABLE IF NOT EXISTS team_role_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    people_role_id  UUID NOT NULL REFERENCES people_roles(id) ON DELETE CASCADE,
    assignee_name   TEXT,
    assignee_email  TEXT,
    assignment_kind TEXT NOT NULL DEFAULT 'performer',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_team_role UNIQUE (team_id, people_role_id),
    CONSTRAINT ck_team_role_assignment_kind CHECK (assignment_kind IN ('owner', 'performer'))
);

CREATE INDEX IF NOT EXISTS ix_team_role_assignments_team_id ON team_role_assignments (team_id);
CREATE INDEX IF NOT EXISTS ix_team_role_assignments_people_role_id ON team_role_assignments (people_role_id);

CREATE TABLE IF NOT EXISTS people_accountabilities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    subject_type    TEXT NOT NULL,
    subject_id      UUID NOT NULL,
    entity_kind     TEXT NOT NULL,
    entity_id       UUID NOT NULL,
    link_kind       TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_people_accountabilities_subject CHECK (subject_type IN ('role', 'team')),
    CONSTRAINT ck_people_accountabilities_entity CHECK (
        entity_kind IN ('product', 'capability', 'business_domain', 'process', 'application')
    ),
    CONSTRAINT ck_people_accountabilities_link CHECK (link_kind IN ('owns', 'performs', 'stewards')),
    CONSTRAINT uq_people_accountability UNIQUE (subject_type, subject_id, entity_kind, entity_id, link_kind)
);

CREATE INDEX IF NOT EXISTS ix_people_accountabilities_subject ON people_accountabilities (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS ix_people_accountabilities_workspace_id ON people_accountabilities (workspace_id);
