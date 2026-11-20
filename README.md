# LibBrow

LibBrow is an administrator-only library desk system. The admin uses one portal to manage books and borrowers, record checkouts and returns, and review library activity. Books, borrowers, and transaction history are stored in PostgreSQL through the Express API.

There is no public customer catalog or borrower sign-in portal in the current workflow.

## Current features

- **Dashboard:** view book titles, total and available copies, registered borrowers, books out, and overdue loans.
- **My library:** search titles, view covers and stock, edit book details, inspect copy barcodes, and archive or restore titles. Archiving preserves borrowing history.
- **Add books:** add a title or add copies to an existing ISBN. Select categories and either upload a PNG, JPEG, or WebP cover (up to 2 MB) or provide a public HTTP/HTTPS image URL.
- **Borrowers:** register and edit a borrower's member/student ID, contact number, full name, email, roles/positions, and status (Active, Inactive, or Suspended). Cards summarize unreturned, returned, and total borrowed books and preview covers of books still out.
- **Borrow book:** check out an available book to an active registered borrower, or enter a new active borrower during checkout. Choose a suggested loan length or enter a custom period. The selected title's cover is previewed before checkout.
- **Unreturned books:** review due dates and overdue loans, renew a loan, and record a book as returned, lost, or damaged. Lost and damaged copies are not returned to available stock. Email reminders open in the admin's email application for review and sending.
- **Reports:** filter and sort transaction records, export CSV, and review recent admin activity.
- **Settings:** set the admin's display name and contact number, default loan period, and maximum number of books a borrower may have at once. The maximum is checked during checkout.
- **Appearance:** switch between light and dark themes. The theme preference is stored in the current browser.

Borrowers with transaction history cannot be deleted because that would break the historical record. Set their status to Inactive instead. A borrower with no transaction history can be deleted.

## Requirements

- Node.js 20.19 or newer
- PostgreSQL database (Supabase PostgreSQL is supported)

## Local setup

Run commands from the repository root unless a command says otherwise.

1. Install dependencies and generate the Prisma client:

   ```powershell
   npm ci
   npm --prefix frontend ci
   npm run db:generate
   ```

2. Copy the environment templates:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item frontend/.env.example frontend/.env
   ```

3. Edit the root `.env` and set:

   - `DATABASE_URL` — your PostgreSQL connection string. For Supabase, use a connection string that is reachable from your computer and includes the required SSL options.
   - `JWT_SECRET` — a private random secret of at least 32 bytes.
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` — the credentials for the admin sign-in portal.
   - `PORT` — defaults to `3000`.

   Keep `.env` private and do not commit it. Edit `frontend/.env` for local development and set `VITE_API_BASE_URL=http://localhost:3000`.

4. Prepare the database before starting the app:

   - For a new database, apply `schema.sql`, then `supabase/library-operations-migration.sql`.
   - For an existing database, apply only the migrations it is missing. Review the migration scripts in `supabase/` and back up the database first. **Do not apply the initial `schema.sql` over a database that already contains library data.**

5. Start the API and the admin portal in separate PowerShell windows:

   ```powershell
   npm run dev
   ```

   ```powershell
   npm run dev:admin
   ```

6. Open [http://localhost:5174](http://localhost:5174). The API health endpoint is [http://localhost:3000/health](http://localhost:3000/health).

The health endpoint confirms that the API process responds. If a data request fails, check the API terminal for the underlying database or server error.

## Admin sign-in

Sign in with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` values configured in the API environment. The API issues a signed bearer token that expires according to `JWT_EXPIRES_IN` (one hour by default). Admin-only API routes verify the token and check that its database user still has the Admin role.

If sign-in reports that it is not configured, check that both admin environment variables are set in the root `.env`, then restart the API. Changing those values changes the credentials accepted by the local sign-in service.

## Daily workflow

1. Add titles and copy counts in **Add books**. Add or paste a cover image if available.
2. Register borrowers in **Borrowers**, or enter a new borrower directly in **Borrow book**. Only Active borrowers can borrow.
3. In **Borrow book**, choose the borrower and available title, set the loan period, review the title preview and due date, then confirm checkout.
4. Use **Unreturned books** to monitor due dates. Renew loans when needed or record the return outcome after the copy is received or reported lost/damaged.
5. Review totals and transaction history in **Dashboard** and **Reports**. Export reports as CSV when needed.
6. Set the admin profile and shared borrowing limits in **Settings**.

The default loan period and concurrent-book limit are saved in PostgreSQL and shared by the portal. The theme preference is local to each browser.

## Data and deployment

The API is the only application path that changes library data. The frontend calls the API; it does not write directly to Supabase. Point local and deployed API environments at the intended PostgreSQL database so they see the same books, borrowers, and transactions. A deployment will not contain local development data unless both environments use the same database.

This repository is configured as one Vercel project. `vercel.json` builds the React app from `frontend/` and routes the Express API through the Vercel function at `api/[...path].js`.

Before deploying:

1. Apply the required schema and missing migrations to the production database. Do not apply the base schema over existing data.
2. Add `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` as Vercel environment variables. Use separate values for Production and Preview if both environments are enabled.
3. Leave `VITE_API_BASE_URL` unset in Vercel. The frontend then calls the same-origin `/api` function.
4. Deploy from the repository root and check `/api/health` on the deployed domain.

## API routes

All `/admin/*` routes and book-management routes require an administrator bearer token. The login and health routes are public.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API process health |
| `POST` | `/auth/admin-login` | Sign in with configured username and password |
| `GET` | `/admin/me` | Validate the current admin session |
| `GET` | `/books?include_archived=true` | List books, optionally including archived titles |
| `POST` | `/books` | Add a title or copies |
| `PUT` | `/books/:id` | Edit title details and copy count |
| `PATCH` | `/books/:id/archive` | Archive or restore a title |
| `GET` | `/books/:id/copies` | List copy barcodes and statuses |
| `GET`, `POST` | `/admin/borrowers` | List or register borrowers |
| `PUT` | `/admin/borrowers/:id` | Edit borrower details and status |
| `DELETE` | `/admin/borrowers/:id` | Delete a borrower only if they have no transactions |
| `POST` | `/admin/checkout` | Check out a book to a registered or new borrower |
| `GET` | `/admin/requests?status=Approved` | Read approved loan records |
| `POST` | `/admin/renewals/:id` | Renew an active loan |
| `POST` | `/admin/returns/:id` | Record a return, loss, or damage outcome |
| `GET` | `/admin/transactions` | Read transaction history |
| `GET` | `/admin/audit-events` | Read recent admin activity |
| `GET`, `PUT` | `/admin/library-settings` | Read or save admin profile and borrowing settings |

For checkout, send either `borrower_id` for an existing borrower or `new_borrower` with borrower details, along with `book_id` and `loan_days`.

## Build commands

```powershell
npm run db:generate
npm run build
npm --prefix frontend run build
```

The root build generates the Prisma client. The frontend build creates the static admin portal in `frontend/dist/`.
