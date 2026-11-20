import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth.js';
import { AddOrRestockBook, ListBookCopies, ListBooks, SetBookArchived, UpdateBook } from '../services/book-service.js';
import { CheckoutBook, DeleteBorrower, ListAdminRequests, ListAuditEvents, ListBorrowers, ListTransactions, MarkBookReturned, RegisterBorrower, RenewLoan, UpdateBorrower, UpdateBorrowerStatus } from '../services/admin-service.js';
import { prisma } from '../db/prisma.js';
import { AdminLogin } from '../services/admin-login-service.js';

export const apiRouter = Router();

apiRouter.post('/auth/admin-login', async (req, res) => {
  res.json(await AdminLogin({ username: req.body?.username, password: req.body?.password }));
});

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) =>
    typeof entry === 'bigint' ? entry.toString() : entry));
}

async function recordAudit(data) {
  try { await prisma.auditEvent.create({ data }); }
  catch (error) { console.error('Could not write admin audit event:', error); }
}

apiRouter.get('/books', authenticateAdmin, async (req, res) => {
  res.json(jsonSafe(await ListBooks({ includeArchived: req.query.include_archived === 'true' })));
});

apiRouter.post('/books', authenticateAdmin, async (req, res) => {
  const book = await AddOrRestockBook({
    isbn: req.body?.isbn,
    title: req.body?.title,
    author: req.body?.author,
    copies: req.body?.copies,
    imageUrl: req.body?.image_url,
    categories: req.body?.categories,
  });
  await recordAudit({ action: 'Book added or restocked', adminId: req.user.userId, bookId: book.bookId, details: { title: book.title, isbn: book.isbn } });
  res.status(201).json(jsonSafe(book));
});

apiRouter.get('/books/:id/copies', authenticateAdmin, async (req, res) => res.json(jsonSafe(await ListBookCopies({ bookId: req.params.id }))));

apiRouter.put('/books/:id', authenticateAdmin, async (req, res) => {
  const book = await UpdateBook({
    bookId: req.params.id,
    isbn: req.body?.isbn,
    title: req.body?.title,
    author: req.body?.author,
    totalCopies: req.body?.total_copies,
    imageUrl: req.body?.image_url,
    categories: req.body?.categories,
  });
  await recordAudit({ action: 'Book details updated', adminId: req.user.userId, bookId: book.bookId, details: { title: book.title, isbn: book.isbn } });
  res.json(jsonSafe(book));
});
apiRouter.patch('/books/:id/archive', authenticateAdmin, async (req, res) => {
  const book = await SetBookArchived({ bookId: req.params.id, isArchived: req.body?.is_archived });
  await recordAudit({ action: book.isArchived ? 'Book archived' : 'Book restored', adminId: req.user.userId, bookId: book.bookId, details: { title: book.title } });
  res.json(jsonSafe(book));
});

apiRouter.use('/admin', authenticateAdmin);

apiRouter.get('/admin/me', (req, res) => {
  res.json({ user: { name: req.user.name, email: req.user.email, role: req.user.role } });
});

apiRouter.get('/admin/requests', async (req, res) => {
  res.json(jsonSafe(await ListAdminRequests({ status: req.query.status ?? 'Pending' })));
});

apiRouter.get('/admin/borrowers', async (_req, res) => res.json(jsonSafe(await ListBorrowers())));
apiRouter.post('/admin/borrowers', async (req, res) => {
  const borrower = await RegisterBorrower(req.body ?? {});
  await recordAudit({ action: 'Borrower registered', adminId: req.user.userId, borrowerId: borrower.borrowerId, details: { name: borrower.name, memberId: borrower.memberId } });
  res.status(201).json(jsonSafe(borrower));
});
apiRouter.put('/admin/borrowers/:id', async (req, res) => {
  const borrower = await UpdateBorrower({ borrowerId: req.params.id, ...(req.body ?? {}) });
  await recordAudit({ action: 'Borrower updated', adminId: req.user.userId, borrowerId: borrower.borrowerId, details: { name: borrower.name, memberId: borrower.memberId, status: borrower.status } });
  res.json(jsonSafe(borrower));
});
apiRouter.put('/admin/borrowers/:id/status', async (req, res) => {
  const borrower = await UpdateBorrowerStatus({ borrowerId: req.params.id, status: req.body?.status });
  await recordAudit({ action: 'Borrower status changed', adminId: req.user.userId, borrowerId: borrower.borrowerId, details: { name: borrower.name, status: borrower.status } });
  res.json(jsonSafe(borrower));
});
apiRouter.delete('/admin/borrowers/:id', async (req, res) => {
  const borrower = await DeleteBorrower({ borrowerId: req.params.id });
  await recordAudit({ action: 'Borrower deleted', adminId: req.user.userId, details: { name: borrower.name, memberId: borrower.memberId } });
  res.json({ deleted: true });
});
apiRouter.post('/admin/checkout', async (req, res) => {
  const request = await CheckoutBook({ adminId: req.user.userId, borrowerId: req.body?.borrower_id, newBorrower: req.body?.new_borrower, bookId: req.body?.book_id, loanDays: req.body?.loan_days ?? 14 });
  if (request.borrowerCreated) await recordAudit({ action: 'Borrower registered at checkout', adminId: req.user.userId, borrowerId: request.borrowerRecordId, details: { name: request.borrowerRecord?.name, memberId: request.borrowerRecord?.memberId } });
  await recordAudit({ action: 'Book checked out', adminId: req.user.userId, borrowerId: request.borrowerRecordId, bookId: request.bookId, requestId: request.requestId, details: { dueDate: request.dueDate } });
  res.status(201).json(jsonSafe(request));
});
apiRouter.get('/admin/transactions', async (_req, res) => res.json(jsonSafe(await ListTransactions())));
apiRouter.get('/admin/audit-events', async (_req, res) => res.json(jsonSafe(await ListAuditEvents())));
apiRouter.get('/admin/library-settings', async (_req, res) => {
  const [settings, admin] = await Promise.all([
    prisma.librarySetting.findMany({ where: { settingKey: { in: ['default_loan_days', 'max_concurrent_books', 'admin_contact'] } } }),
    prisma.user.findUnique({ where: { userId: BigInt(_req.user.userId) }, select: { name: true } }),
  ]);
  const values = Object.fromEntries(settings.map(({ settingKey, value }) => [settingKey, value]));
  res.json({ adminName: admin?.name ?? _req.user.name, adminContact: values.admin_contact ?? '', defaultLoanDays: Number(values.default_loan_days ?? 14), maxConcurrentBooks: Number(values.max_concurrent_books ?? 3) });
});
apiRouter.put('/admin/library-settings', async (req, res) => {
  const adminName = typeof req.body?.admin_name === 'string' ? req.body.admin_name.trim() : '';
  const adminContact = typeof req.body?.admin_contact === 'string' ? req.body.admin_contact.trim() : null;
  const days = Number(req.body?.default_loan_days);
  const maxConcurrentBooks = Number(req.body?.max_concurrent_books);
  if (!adminName || adminName.length > 160) return res.status(400).json({ error: 'Admin name is required and must be 160 characters or fewer' });
  if (adminContact === null || adminContact.length > 60) return res.status(400).json({ error: 'Contact number must be 60 characters or fewer' });
  if (!Number.isInteger(days) || days < 1 || days > 30) return res.status(400).json({ error: 'Default loan period must be from 1 to 30 days' });
  if (!Number.isInteger(maxConcurrentBooks) || maxConcurrentBooks < 1 || maxConcurrentBooks > 30) return res.status(400).json({ error: 'Concurrent book limit must be from 1 to 30' });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { userId: BigInt(req.user.userId) }, data: { name: adminName } });
    for (const [settingKey, value] of [['admin_contact', adminContact], ['default_loan_days', String(days)], ['max_concurrent_books', String(maxConcurrentBooks)]]) {
      await tx.librarySetting.upsert({ where: { settingKey }, create: { settingKey, value }, update: { value } });
    }
  });
  await recordAudit({ action: 'Admin profile and library policy updated', adminId: req.user.userId, details: { adminName, defaultLoanDays: days, maxConcurrentBooks } });
  res.json({ adminName, adminContact, defaultLoanDays: days, maxConcurrentBooks });
});
apiRouter.post('/admin/renewals/:id', async (req, res) => {
  const request = await RenewLoan({ adminId: req.user.userId, requestId: req.params.id, loanDays: req.body?.loan_days ?? 14 });
  await recordAudit({ action: 'Loan renewed', adminId: req.user.userId, borrowerId: request.borrowerRecordId, bookId: request.bookId, requestId: request.requestId, details: { dueDate: request.dueDate, daysAdded: req.body?.loan_days ?? 14 } });
  res.json(jsonSafe(request));
});

apiRouter.post('/admin/returns/:id', async (req, res) => {
  const request = await MarkBookReturned({
    adminId: req.user.userId,
    requestId: req.params.id,
    resolution: req.body?.resolution ?? 'Returned',
    note: req.body?.note ?? '',
  });
  await recordAudit({ action: `Book ${request.resolution?.toLowerCase() ?? 'returned'}`, adminId: req.user.userId, borrowerId: request.borrowerRecordId, bookId: request.bookId, requestId: request.requestId, details: { note: request.resolutionNote } });
  res.json(jsonSafe(request));
});
