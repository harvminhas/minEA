-- Product architecture graph: persisted node positions
ALTER TABLE products ADD COLUMN IF NOT EXISTS graph_layout JSONB;
