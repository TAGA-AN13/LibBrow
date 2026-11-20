-- Adds book archiving for safe removal from everyday library views.
BEGIN;

ALTER TABLE public.books
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
