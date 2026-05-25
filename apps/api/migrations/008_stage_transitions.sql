-- Outgoing edge annotations on stages (condition, trigger, handoff to next stage)
ALTER TABLE stages ADD COLUMN IF NOT EXISTS transition_condition TEXT;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS transition_trigger TEXT;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS transition_handoff TEXT;
