-- Process builder fields (owner, status, stage owner)
ALTER TABLE processes ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE processes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE stages ADD COLUMN IF NOT EXISTS owner TEXT;

ALTER TABLE processes DROP CONSTRAINT IF EXISTS ck_processes_status;
ALTER TABLE processes ADD CONSTRAINT ck_processes_status CHECK (
    status IN ('draft', 'live', 'planned', 'retiring', 'retired')
);
