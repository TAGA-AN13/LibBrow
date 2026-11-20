-- Adds operational history, copy-level inventory, and loan resolutions.
-- Existing book, borrower, and transaction rows are retained.
BEGIN;

ALTER TABLE public.borrow_requests
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS resolution TEXT;

CREATE TABLE IF NOT EXISTS public.book_copies (
  copy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES public.books(book_id) ON DELETE RESTRICT,
  barcode TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Available', 'On loan', 'Lost', 'Damaged')),
  request_id BIGINT UNIQUE REFERENCES public.borrow_requests(request_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS book_copies_by_book_status ON public.book_copies(book_id, status);

-- Backfill exactly the current copy totals. Historical active loans are linked
-- to the on-loan copies; active available stock remains available.
WITH numbered AS (
  SELECT b.book_id, b.isbn, b.available_copies,
    series.copy_number,
    row_number() OVER (PARTITION BY b.book_id ORDER BY series.copy_number DESC) AS loan_copy_rank
  FROM public.books b CROSS JOIN LATERAL generate_series(1, b.total_copies) AS series(copy_number)
), active AS (
  SELECT request_id, book_id,
    row_number() OVER (PARTITION BY book_id ORDER BY actual_borrow_date, request_id) AS loan_rank
  FROM public.borrow_requests
  WHERE status = 'Approved' AND return_date IS NULL
)
INSERT INTO public.book_copies(book_id, barcode, status, request_id)
SELECT n.book_id, n.isbn || '-' || lpad(n.copy_number::text, 4, '0'),
  CASE WHEN n.copy_number > n.available_copies THEN 'On loan' ELSE 'Available' END,
  CASE WHEN n.copy_number > n.available_copies THEN a.request_id ELSE NULL END
FROM numbered n
LEFT JOIN active a ON a.book_id = n.book_id AND a.loan_rank = n.loan_copy_rank
ON CONFLICT (barcode) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.audit_events (
  audit_event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  admin_id BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
  borrower_id BIGINT REFERENCES public.borrowers(borrower_id) ON DELETE SET NULL,
  book_id BIGINT REFERENCES public.books(book_id) ON DELETE SET NULL,
  request_id BIGINT REFERENCES public.borrow_requests(request_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS audit_events_recent ON public.audit_events(created_at DESC, audit_event_id DESC);

CREATE TABLE IF NOT EXISTS public.library_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.library_settings(setting_key, setting_value)
VALUES ('default_loan_days', '14') ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE public.book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_copies, public.audit_events, public.library_settings FROM anon, authenticated;

COMMIT;
