# LibBrow

LibBrow has two separate local websites backed by one Express API and a
Supabase PostgreSQL database:

- Customer website: `http://localhost:5173`. Customers browse books, submit
  borrowing requests with their contact details, track requests by the
  returned reference, and send return notices without creating an account.
- Staff portal: `http://localhost:5174`. Staff sign in through Supabase Auth to
  manage inventory, approve or deny requests, and confirm returned loans.

## Setup

1. Use Node.js 20.19 or newer.
2. Create a Supabase project. Copy `.env.example` to the project root `.env` and
   set `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` for that
   project. The API uses the publishable key only to validate staff sessions
   against Supabase Auth; never put a service-role key in the frontend.
3. For a new database, apply `schema.sql`. For an existing database, apply
   `supabase/book-cover-categories-migration.sql` to add book covers and
   categories. If the database still needs the workflow v2 changes, apply
   `supabase/workflow-v2-migration.sql` first, then apply
   `supabase/book-rating-migration.sql` to enable post-return star ratings. Do
   not apply the initial schema over an existing database.
4. Set `ADMIN_BOOTSTRAP_KEY` in the root `.env` to a unique random value with at
   least 32 bytes. Enable Supabase Auth email/password signups for initial
   setup. The first administrator enters this key at the staff portal to create
   their Supabase Auth account and claim the single Admin role. If
   Supabase email confirmation is enabled, confirm the email, return to the
   portal, sign in, and finish setup with the same key. The bootstrap endpoint
   closes as soon as the first Admin row is created. You can then turn off
   public Auth signups in Supabase; additional Auth accounts do not gain app
   access unless they have an Admin row.
5. Run `npm install` and `npm run db:generate` at the project root.
6. Copy `frontend/.env.example` to `frontend/.env`. Set the API URL and the
   matching Supabase project URL and publishable key. Then run `npm install`
   inside `frontend/`.
7. Start the backend with `npm run dev`. Start each website in its own
   terminal with `npm run dev:customer` and `npm run dev:admin`.

## One-click Windows launcher

Install Python 3 for Windows (including Tcl/Tk) and Node.js 20.19 or newer.
With the project dependencies and environment files set up as above, double-click
`Start-LibBrow.bat` in the project folder. The Tkinter window can start all
three services or start them individually, show readiness, open either portal,
and open `logs/launcher` for service output. It does not configure the database;
the API continues to use the existing root `.env` settings. Stop only ends
services started by that launcher instance. If a port is already in use, stop
that server from its existing terminal before starting it here.

The Prisma schema maps to the snake_case PostgreSQL tables. Re-run
`npm run db:generate` after changing `prisma/schema.prisma`.

## Customer workflow

Customers can browse and search the catalog without signing in. A request asks
for a name, email, and loan length from 1 to 30 days; the default is 14. The API
returns a random reference that the customer can use to check request status
later. Keep the reference private because it also
authorizes sending a return notice for that request.
After staff confirms the return, the customer can use that same reference to
rate the book from one to five stars.

Submitting a request does not reserve a copy. Staff approval creates a borrower
record and a loan, then atomically reserves one available copy. If inventory
has run out before approval, the request remains pending and staff can deny it
or wait for stock to return.

Customers can send a return notice for an approved loan. The notice does not
close the loan or change inventory. Staff confirm receipt in the portal; that
closes the loan and restores one available copy.

## API

- `GET /books` — public catalog and availability.
- `POST /public/requests` — for example,
  `{ "name": "Alex Reader", "email": "alex@example.com", "book_id": "123", "loan_days": 14 }`.
- `GET /public/requests/:reference` — status, requested period, and due/return dates.
- `POST /public/returns` — `{ "reference" }` to notify staff of a return.
- `GET /admin/me` — validates the Supabase session and staff access.
- `GET /admin/requests?status=Pending` — staff request queue. Status may be
  `Pending`, `Approved`, or `Denied`.
- `PUT /admin/requests/:id` — `{ "action": "Approve" }` or `{ "action": "Deny" }`.
- `POST /admin/returns/:id` — staff confirms a returned loan.
- `POST /books` — staff adds or restocks a title, with optional `image_url`
  (PNG, JPEG, or WebP data URL up to 2 MB) and `categories` (a list of catalog
  categories).
- `GET /health` — API process health check.

All `/admin/*` routes and inventory writes validate the presented access token
through Supabase Auth, then require a matching `Admin` row in `public.users`.
Public endpoints do not accept or require a login. Supabase Auth signups alone
do not grant app access; only the single initial bootstrap creates an Admin
row. Any additional staff role would require a database owner to add another
Admin row manually.

## Integration suite

The integration suite uses a dedicated PostgreSQL database. Configure
`.env.test` from `.env.test.example`, apply `schema.sql` to that test database,
and run `npm run test:integration`. The runner requires
`RUN_DB_INTEGRATION_TESTS=true` and refuses to start without a test database
URL.
