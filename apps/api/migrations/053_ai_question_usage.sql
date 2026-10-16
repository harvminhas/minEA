-- Ask: AI questions counted per org per calendar month (America/Toronto). Additive: one new table.
-- Limits come from the plan (app/services/ask_quota.py); org_limits key "ai_questions_per_month"
-- overrides it per org (e.g. a Business org's configured allowance). Quick answers are not counted.
CREATE TABLE IF NOT EXISTS ai_question_usage (
    org_id      UUID NOT NULL,
    month       TEXT NOT NULL,            -- 'YYYY-MM' in America/Toronto
    used        INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (org_id, month)
);
