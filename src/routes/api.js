import { Router } from 'express';
import { authenticateSupabaseStaff, authenticateSupabaseUser, authenticateToken, requireAuthenticatedUser, requireRole } from '../middleware/auth.js';
import { AddOrRestockBook, ListBooks, UpdateBook } from '../services/book-service.js';
import { ListAdminRequests, ListMyRequests, MarkBookReturned } from '../services/admin-service.js';
import { CreateBorrowRequest, ProcessRequestApproval } from '../services/borrow-request-service.js';
import { Login } from '../services/auth-service.js';
import { CreatePublicBorrowRequest, GetPublicBorrowRequest, RateReturnedBook, SubmitReturnNotice } from '../services/public-request-service.js';
import { CreateFirstAdmin, GetFirstAdminSetupStatus } from '../services/admin-bootstrap-service.js';

export const apiRouter = Router();

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) =>
    typeof entry === 'bigint' ? entry.toString() : entry));
}

apiRouter.post('/auth/login', async (req, res) => {
  res.json(await Login({ email: req.body?.email, password: req.body?.password }));
});

apiRouter.get('/books', async (_req, res) => {
  res.json(jsonSafe(await ListBooks()));
});

apiRouter.post('/public/requests', async (req, res) => {
  const result = await CreatePublicBorrowRequest({
    name: req.body?.name,
    email: req.body?.email,
    bookId: req.body?.book_id,
    loanDays: req.body?.loan_days,
  });
  res.status(201).json(jsonSafe(result));
});

apiRouter.get('/public/requests/:reference', async (req, res) => {
  res.json(jsonSafe(await GetPublicBorrowRequest(req.params.reference)));
});

apiRouter.post('/public/returns', async (req, res) => {
  res.json(jsonSafe(await SubmitReturnNotice(req.body?.reference)));
});

apiRouter.post('/public/ratings', async (req, res) => {
  res.json(jsonSafe(await RateReturnedBook(req.body?.reference, req.body?.rating)));
});

apiRouter.get('/admin/bootstrap-status', async (_req, res) => {
  res.json(await GetFirstAdminSetupStatus());
});

apiRouter.post('/admin/bootstrap', authenticateSupabaseUser, async (req, res) => {
  const user = await CreateFirstAdmin({
    authUser: req.authUser,
    name: req.body?.name,
    bootstrapKey: req.body?.bootstrap_key,
  });
  res.status(201).json({ user });
});

apiRouter.post('/requests', requireAuthenticatedUser, requireRole('Borrower'), async (req, res) => {
  const request = await CreateBorrowRequest({
    borrowerId: req.user.userId,
    bookId: req.body?.book_id,
  });
  res.status(201).json(jsonSafe(request));
});

apiRouter.get('/my-requests', requireAuthenticatedUser, requireRole('Borrower'), async (req, res) => {
  res.json(jsonSafe(await ListMyRequests({ borrowerId: req.user.userId })));
});

apiRouter.post('/books', authenticateSupabaseStaff, async (req, res) => {
  const book = await AddOrRestockBook({
    isbn: req.body?.isbn,
    title: req.body?.title,
    author: req.body?.author,
    copies: req.body?.copies,
    imageUrl: req.body?.image_url,
    categories: req.body?.categories,
  });
  res.status(201).json(jsonSafe(book));
});

apiRouter.put('/books/:id', authenticateSupabaseStaff, async (req, res) => {
  const book = await UpdateBook({
    bookId: req.params.id,
    isbn: req.body?.isbn,
    title: req.body?.title,
    author: req.body?.author,
    totalCopies: req.body?.total_copies,
    imageUrl: req.body?.image_url,
    categories: req.body?.categories,
  });
  res.json(jsonSafe(book));
});

apiRouter.use('/admin', authenticateSupabaseStaff);

apiRouter.get('/admin/me', (req, res) => {
  res.json({ user: { name: req.user.name, email: req.user.email, role: req.user.role } });
});

apiRouter.get('/admin/requests', async (req, res) => {
  res.json(jsonSafe(await ListAdminRequests({ status: req.query.status ?? 'Pending' })));
});

apiRouter.put('/admin/requests/:id', async (req, res) => {
  const request = await ProcessRequestApproval({
    adminId: req.user.userId,
    requestId: req.params.id,
    action: req.body?.action,
  });
  res.json(jsonSafe(request));
});

apiRouter.post('/admin/returns/:id', async (req, res) => {
  const request = await MarkBookReturned({
    adminId: req.user.userId,
    requestId: req.params.id,
  });
  res.json(jsonSafe(request));
});
