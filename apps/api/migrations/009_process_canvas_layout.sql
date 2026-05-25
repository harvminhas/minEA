-- Canvas layout for process builder (node positions + edge label offsets, indexed by stage order)
ALTER TABLE processes ADD COLUMN IF NOT EXISTS canvas_layout JSONB;
