-- Apply after workflow-v2-migration.sql when upgrading an older project.
-- Browser roles can read the catalog only; all operations on customer,
-- borrower, request, loan, and staff tables go through the Express API.
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.users, public.borrowers, public.borrow_requests, public.loans FROM anon, authenticated;
GRANT SELECT ON TABLE public.books TO anon, authenticated;

DROP POLICY IF EXISTS books_public_read ON public.books;
CREATE POLICY books_public_read
    ON public.books
    FOR SELECT
    TO anon, authenticated
    USING (true);
