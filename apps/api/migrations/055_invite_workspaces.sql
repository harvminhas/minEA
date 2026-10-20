-- One invite per person: org access plus chosen workspaces, each with a role. Additive only
-- (dev and prod share one database): a new table and three nullable columns on invites.
--
-- invites rows written before this keep working as they are: workspace_id set = a workspace
-- invite with invites.role; workspace_id NULL and org_role NULL = an org invite with invites.role.
-- New invites leave workspace_id NULL, set org_role ('admin' | 'member') and list their workspaces
-- in invite_workspaces. invites.role still holds the highest role on the invite, so code that
-- counts pending invites by role keeps counting them.
CREATE TABLE IF NOT EXISTS invite_workspaces (
    invite_id     UUID NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
    position      SMALLINT NOT NULL DEFAULT 0,   -- order chosen; the first one opens after accepting
    PRIMARY KEY (invite_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS ix_invite_workspaces_workspace_id ON invite_workspaces (workspace_id);

ALTER TABLE invite_workspaces ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invite_workspaces' AND policyname = 'invite_workspaces_org_isolation') THEN
        CREATE POLICY invite_workspaces_org_isolation ON invite_workspaces
            USING (invite_id IN (SELECT id FROM invites WHERE org_id::text = current_setting('app.org_id', true)));
    END IF;
END $$;

-- NULL = an invite written before 055 (its meaning comes from workspace_id and role).
ALTER TABLE invites ADD COLUMN IF NOT EXISTS org_role TEXT CHECK (org_role IN ('admin', 'member'));
-- Lets an admin copy the current link again: the token is derived from this nonce with APP_SECRET
-- (only the hash is stored, as before). NULL = no copy; Resend issues a new link.
ALTER TABLE invites ADD COLUMN IF NOT EXISTS link_nonce TEXT;
-- When the invite email last went out (NULL = never sent, e.g. Resend not configured).
ALTER TABLE invites ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
