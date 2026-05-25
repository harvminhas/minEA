-- Firebase Auth migration
-- Run after 002_auth_tenancy.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'clerk_id'
  ) THEN
    ALTER TABLE users RENAME COLUMN clerk_id TO firebase_uid;
  END IF;
END $$;

DROP INDEX IF EXISTS ix_users_clerk_id;
CREATE INDEX IF NOT EXISTS ix_users_firebase_uid ON users (firebase_uid);
