-- Public contact form submissions (landing page / contact page)

CREATE TABLE IF NOT EXISTS contact_inquiries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    company     TEXT,
    team_size   TEXT,
    interest    TEXT NOT NULL CHECK (interest IN ('business', 'demo', 'onboarding', 'other')),
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_contact_inquiries_created_at ON contact_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_contact_inquiries_email ON contact_inquiries (email);
