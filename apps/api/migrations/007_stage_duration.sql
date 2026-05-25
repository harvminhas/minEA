-- Human-readable stage duration (e.g. "2 hours")
ALTER TABLE stages ADD COLUMN IF NOT EXISTS typical_duration TEXT;
