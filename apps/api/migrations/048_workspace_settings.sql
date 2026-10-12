-- Per-workspace UI settings (e.g. the Model sidebar's "Advanced architecture" toggle).
-- Additive only: a new nullable-safe JSONB column with a default. Dev and prod share one DB.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
