-- Add apps: replay a repeated "Add" instead of saving the items twice. Additive: one new table.
-- The web sends an Idempotency-Key header with POST .../objects/batch (one key per set of items).
-- The first request claims (workspace_id, idempotency_key) in its own transaction and stores the
-- response; a repeat with the same key and body gets that stored response back. A repeat that
-- arrives while the first is still running waits on the key, then replays (or, if the first
-- failed and rolled back, saves normally). Rows older than 7 days are pruned on later writes.
-- Without this table the API still saves, just without the replay (logged).
CREATE TABLE IF NOT EXISTS add_batch_requests (
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key  TEXT NOT NULL,
    org_id           UUID NOT NULL,
    request_hash     TEXT NOT NULL,              -- sha256 of the request body
    result           JSONB,                      -- the AddBatchResult returned (set in the same transaction)
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_add_batch_requests_created_at ON add_batch_requests (created_at);
