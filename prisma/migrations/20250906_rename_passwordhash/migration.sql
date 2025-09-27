-- Safe migration: rename passwordHash -> password if present, add forceChangePassword boolean default false if missing.
DO $$
BEGIN
  -- Rename passwordHash -> password (handles camelCase and lowercase variants)
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public."User"'::regclass AND attname = 'passwordHash'
  ) THEN
    EXECUTE 'ALTER TABLE "User" RENAME COLUMN "passwordHash" TO "password"';
  ELSIF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public."User"'::regclass AND attname = 'passwordhash'
  ) THEN
    EXECUTE 'ALTER TABLE "User" RENAME COLUMN passwordhash TO password';
  END IF;

  -- Add forceChangePassword column if it does not exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public."User"'::regclass AND attname = 'forceChangePassword'
  ) THEN
    EXECUTE 'ALTER TABLE "User" ADD COLUMN "forceChangePassword" boolean NOT NULL DEFAULT false';
  END IF;
END
$$;
