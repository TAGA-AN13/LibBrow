-- Upgrade an existing Book Borrowing System database for public requests,
-- borrower records, loans, return notices, and Supabase-authenticated staff.
BEGIN;

CREATE TABLE IF NOT EXISTS public.borrowers (
    borrower_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email       TEXT NOT NULL CHECK (length(trim(email)) > 0),
    address     TEXT NOT NULL CHECK (length(trim(address)) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.borrow_requests ALTER COLUMN borrower_id DROP NOT NULL;
ALTER TABLE public.borrow_requests
    ADD COLUMN IF NOT EXISTS borrower_record_id BIGINT REFERENCES public.borrowers(borrower_id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS public_reference VARCHAR(48) UNIQUE,
    ADD COLUMN IF NOT EXISTS customer_name TEXT,
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS customer_address TEXT,
    ADD COLUMN IF NOT EXISTS requested_loan_days INTEGER,
    ADD COLUMN IF NOT EXISTS return_notice_date TIMESTAMPTZ;

DO $$ BEGIN
    ALTER TABLE public.borrow_requests
      ADD CONSTRAINT borrow_requests_requested_loan_days_valid
      CHECK (requested_loan_days IS NULL OR requested_loan_days BETWEEN 1 AND 30);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.loans (
    loan_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id BIGINT NOT NULL UNIQUE REFERENCES public.borrow_requests(request_id) ON DELETE RESTRICT,
    borrower_id BIGINT NOT NULL REFERENCES public.borrowers(borrower_id) ON DELETE RESTRICT,
    book_id BIGINT NOT NULL REFERENCES public.books(book_id) ON DELETE RESTRICT,
    actual_borrow_date DATE NOT NULL,
    due_date DATE NOT NULL CHECK (due_date >= actual_borrow_date),
    return_date DATE CHECK (return_date IS NULL OR return_date >= actual_borrow_date)
);
CREATE INDEX IF NOT EXISTS loans_active_by_due_date ON public.loans (due_date, loan_id)
    WHERE return_date IS NULL;

ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users, public.borrowers, public.borrow_requests, public.loans FROM anon, authenticated;

CREATE OR REPLACE FUNCTION validate_borrow_request_roles()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.borrower_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = NEW.borrower_id AND role = 'Borrower'
    ) THEN
        RAISE EXCEPTION 'borrower_id must reference a Borrower user';
    END IF;
    IF NEW.status_changed_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = NEW.status_changed_by AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'status_changed_by must reference an Admin user';
    END IF;
    RETURN NEW;
END;
$$;

COMMIT;
