-- Expand people accountability link verbs (per-entity relationship types)

ALTER TABLE people_accountabilities
    DROP CONSTRAINT IF EXISTS ck_people_accountabilities_link;

ALTER TABLE people_accountabilities
    ADD CONSTRAINT ck_people_accountabilities_link
    CHECK (link_kind IN ('owns', 'performs', 'approves', 'informed', 'stewards', 'manages'));
