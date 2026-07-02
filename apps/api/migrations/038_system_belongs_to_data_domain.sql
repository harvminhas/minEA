-- System → data domain is belongs_to (not uses).
UPDATE relationships
SET type = 'belongs_to'
WHERE type = 'uses'
  AND from_type = 'application'
  AND to_type = 'data_domain';
