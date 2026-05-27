-- People accountabilities: add Data layer entity kinds

ALTER TABLE people_accountabilities
    DROP CONSTRAINT IF EXISTS ck_people_accountabilities_entity;

ALTER TABLE people_accountabilities
    ADD CONSTRAINT ck_people_accountabilities_entity
    CHECK (
        entity_kind IN (
            'product',
            'capability',
            'business_domain',
            'process',
            'application',
            'data_domain',
            'data_store'
        )
    );
