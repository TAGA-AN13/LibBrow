-- Initial schema for the Admin-approved Book Borrowing System.
-- Target database: PostgreSQL 12+

CREATE TABLE users (
    user_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email         TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('Admin', 'Borrower'))
);

-- Staff are authenticated by Supabase Auth and mapped to Admin users here.
-- Borrower records are created only after a public request is approved.
CREATE TABLE borrowers (
    borrower_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name         TEXT NOT NULL CHECK (length(trim(name)) > 0),
    email        TEXT NOT NULL CHECK (length(trim(email)) > 0),
    address      TEXT NOT NULL CHECK (length(trim(address)) > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE books (
    book_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    isbn             VARCHAR(13) NOT NULL UNIQUE
                     CHECK (isbn ~ '^[0-9]{13}$'),
    title            TEXT NOT NULL CHECK (length(trim(title)) > 0),
    author           TEXT NOT NULL CHECK (length(trim(author)) > 0),
    image_url        TEXT,
    categories       TEXT[] NOT NULL DEFAULT '{}',
    total_copies     INTEGER NOT NULL CHECK (total_copies >= 0),
    available_copies INTEGER NOT NULL,
    CONSTRAINT books_available_copies_valid
        CHECK (available_copies >= 0 AND available_copies <= total_copies)
);

CREATE TABLE borrow_requests (
    request_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    borrower_id       BIGINT
                      REFERENCES users(user_id) ON DELETE RESTRICT,
    borrower_record_id BIGINT
                       REFERENCES borrowers(borrower_id) ON DELETE RESTRICT,
    book_id           BIGINT NOT NULL
                      REFERENCES books(book_id) ON DELETE RESTRICT,
    public_reference  VARCHAR(48) UNIQUE,
    customer_name     TEXT,
    customer_email    TEXT,
    customer_address  TEXT,
    requested_loan_days INTEGER CHECK (requested_loan_days BETWEEN 1 AND 30),
    return_notice_date TIMESTAMPTZ,
    request_date      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status            TEXT NOT NULL DEFAULT 'Pending'
                      CHECK (status IN ('Pending', 'Approved', 'Denied')),
    status_changed_by BIGINT
                      REFERENCES users(user_id) ON DELETE RESTRICT,
    actual_borrow_date DATE,
    due_date           DATE,
    return_date        DATE,
    book_rating        SMALLINT CHECK (book_rating BETWEEN 1 AND 5),

    CONSTRAINT borrow_requests_dates_valid CHECK (
        (due_date IS NULL OR actual_borrow_date IS NOT NULL)
        AND (return_date IS NULL OR actual_borrow_date IS NOT NULL)
        AND (actual_borrow_date IS NULL OR due_date IS NULL
             OR due_date >= actual_borrow_date)
        AND (return_date IS NULL OR actual_borrow_date IS NULL
             OR return_date >= actual_borrow_date)
    ),
    CONSTRAINT borrow_requests_status_fields_valid CHECK (
        (status = 'Pending'
            AND status_changed_by IS NULL
            AND actual_borrow_date IS NULL
            AND due_date IS NULL
            AND return_date IS NULL)
        OR
        (status = 'Denied'
            AND status_changed_by IS NOT NULL
            AND actual_borrow_date IS NULL
            AND due_date IS NULL
            AND return_date IS NULL)
        OR
        (status = 'Approved'
            AND status_changed_by IS NOT NULL
            AND actual_borrow_date IS NOT NULL
            AND due_date IS NOT NULL)
    )
);

CREATE TABLE loans (
    loan_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id         BIGINT NOT NULL UNIQUE
                       REFERENCES borrow_requests(request_id) ON DELETE RESTRICT,
    borrower_id        BIGINT NOT NULL
                       REFERENCES borrowers(borrower_id) ON DELETE RESTRICT,
    book_id            BIGINT NOT NULL
                       REFERENCES books(book_id) ON DELETE RESTRICT,
    actual_borrow_date DATE NOT NULL,
    due_date           DATE NOT NULL CHECK (due_date >= actual_borrow_date),
    return_date        DATE CHECK (return_date IS NULL OR return_date >= actual_borrow_date)
);

CREATE INDEX loans_active_by_due_date ON loans (due_date, loan_id)
    WHERE return_date IS NULL;

-- Partial indexes keep the Admin's pending queue small and quick to scan.
CREATE INDEX borrow_requests_pending_by_date
    ON borrow_requests (request_date, request_id)
    WHERE status = 'Pending';

CREATE INDEX borrow_requests_pending_by_book_date
    ON borrow_requests (book_id, request_date, request_id)
    WHERE status = 'Pending';

-- Cross-table role requirements cannot be expressed as CHECK constraints.
-- Ensure requests are submitted by Borrowers and only Admins change status.
CREATE FUNCTION validate_borrow_request_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.borrower_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users
        WHERE user_id = NEW.borrower_id AND role = 'Borrower'
    ) THEN
        RAISE EXCEPTION 'borrower_id must reference a Borrower user';
    END IF;

    IF NEW.status_changed_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users
        WHERE user_id = NEW.status_changed_by AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'status_changed_by must reference an Admin user';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER borrow_requests_validate_roles
    BEFORE INSERT OR UPDATE OF borrower_id, status_changed_by
    ON borrow_requests
    FOR EACH ROW
    EXECUTE FUNCTION validate_borrow_request_roles();

-- Browser access through Supabase is read-only for the public book catalog.
-- All request and inventory mutations go through the authenticated Express API.
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrow_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE users, borrowers, borrow_requests, loans FROM anon, authenticated;
GRANT SELECT ON TABLE books TO anon, authenticated;

CREATE POLICY books_public_read
    ON books
    FOR SELECT
    TO anon, authenticated
    USING (true);

