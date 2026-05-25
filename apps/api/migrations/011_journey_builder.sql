-- Journey builder: graph layout, rich steps, process/system links
ALTER TABLE customer_journeys ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE customer_journeys ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE customer_journeys ADD COLUMN IF NOT EXISTS canvas_layout JSONB;
ALTER TABLE customer_journeys ADD COLUMN IF NOT EXISTS graph_edges JSONB;

ALTER TABLE journey_moments ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE journey_moments ADD COLUMN IF NOT EXISTS goal TEXT;
ALTER TABLE journey_moments ADD COLUMN IF NOT EXISTS pain_points TEXT;
ALTER TABLE journey_moments ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE journey_moments ADD COLUMN IF NOT EXISTS ai_opportunities TEXT;
ALTER TABLE journey_moments ADD COLUMN IF NOT EXISTS sentiment_friction TEXT;

-- Backfill from legacy columns where present
UPDATE journey_moments SET channel = touchpoint_type WHERE channel IS NULL AND touchpoint_type IS NOT NULL;
UPDATE journey_moments SET pain_points = friction_notes WHERE pain_points IS NULL AND friction_notes IS NOT NULL;
UPDATE journey_moments SET sentiment_friction = emotion WHERE sentiment_friction IS NULL AND emotion IS NOT NULL;

CREATE TABLE IF NOT EXISTS moment_systems (
    moment_id   UUID NOT NULL REFERENCES journey_moments(id) ON DELETE CASCADE,
    system_id   UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    PRIMARY KEY (moment_id, system_id)
);

ALTER TABLE moment_systems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moment_systems_org_isolation ON moment_systems;
CREATE POLICY moment_systems_org_isolation ON moment_systems
    USING (EXISTS (
        SELECT 1 FROM journey_moments m
        JOIN customer_journeys j ON j.id = m.journey_id
        WHERE m.id = moment_id AND j.org_id = current_setting('app.current_org_id', true)::uuid
    ));
