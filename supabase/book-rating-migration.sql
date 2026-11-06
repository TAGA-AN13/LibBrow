-- Allow borrowers to rate a book after staff confirms its return.
ALTER TABLE public.borrow_requests
  ADD COLUMN IF NOT EXISTS book_rating SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'borrow_requests_book_rating_valid'
      AND conrelid = 'public.borrow_requests'::regclass
  ) THEN
    ALTER TABLE public.borrow_requests
      ADD CONSTRAINT borrow_requests_book_rating_valid
      CHECK (book_rating IS NULL OR book_rating BETWEEN 1 AND 5);
  END IF;
END $$;
