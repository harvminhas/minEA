-- Explicit process graph edges (supports branching; null = legacy linear flow)
ALTER TABLE processes ADD COLUMN IF NOT EXISTS graph_edges JSONB;
