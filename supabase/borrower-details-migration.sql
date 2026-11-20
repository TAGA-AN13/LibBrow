-- Adds administrator-managed borrower identification and contact details.
BEGIN;

ALTER TABLE public.borrowers
    ADD COLUMN IF NOT EXISTS member_id TEXT,
    ADD COLUMN IF NOT EXISTS contact_number TEXT,
    ADD COLUMN IF NOT EXISTS society_role TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';

ALTER TABLE public.borrowers ALTER COLUMN address DROP NOT NULL;
ALTER TABLE public.borrowers DROP CONSTRAINT IF EXISTS borrowers_address_check;
CREATE UNIQUE INDEX IF NOT EXISTS borrowers_member_id_key ON public.borrowers (member_id) WHERE member_id IS NOT NULL;

DO $$ BEGIN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT borrowers_society_role_valid
      CHECK (society_role IS NULL OR society_role IN ('Student', 'Teacher / Faculty', 'School Staff', 'Parent / Guardian', 'Alumni', 'Community Member', 'Other'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE public.borrowers
      ADD CONSTRAINT borrowers_status_valid
      CHECK (status IN ('Active', 'Inactive', 'Suspended'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
