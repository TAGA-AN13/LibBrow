import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { issueAccessToken } from '../../src/middleware/auth.js';

describe('borrow request and approval workflow (PostgreSQL integration)', () => {
  let borrower;
  let admin;
  let book;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    borrower = await prisma.user.create({
      data: {
        name: 'Integration Borrower',
        email: `borrower-${suffix}@example.test`,
        passwordHash: 'not-used-by-this-suite',
        role: 'Borrower',
      },
    });
    admin = await prisma.user.create({
      data: {
        name: 'Integration Admin',
        email: `admin-${suffix}@example.test`,
        passwordHash: 'not-used-by-this-suite',
        role: 'Admin',
      },
    });
    const isbnSuffix = `${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    book = await prisma.book.create({
      data: {
        isbn: `978${isbnSuffix}`,
        title: `Integration Book ${suffix}`,
        author: 'Test Author',
        totalCopies: 2,
        availableCopies: 2,
      },
    });
  });

  afterEach(async () => {
    if (book?.bookId) {
      await prisma.borrowRequest.deleteMany({ where: { bookId: book.bookId } });
      await prisma.book.delete({ where: { bookId: book.bookId } });
    }
    if (borrower?.userId) await prisma.user.delete({ where: { userId: borrower.userId } });
    if (admin?.userId) await prisma.user.delete({ where: { userId: admin.userId } });
    borrower = undefined;
    admin = undefined;
    book = undefined;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function tokenFor(user) {
    return issueAccessToken(user);
  }

  async function createPendingRequest() {
    const response = await request(app)
      .post('/requests')
      .set('Authorization', `Bearer ${tokenFor(borrower)}`)
      .send({ book_id: book.bookId.toString() });
    expect(response.status).toBe(201);
    return response.body;
  }

  it('lets a Borrower create a Pending request without changing inventory', async () => {
    const response = await request(app)
      .post('/requests')
      .set('Authorization', `Bearer ${tokenFor(borrower)}`)
      .send({ book_id: book.bookId.toString() });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('Pending');

    const [savedRequest, savedBook] = await Promise.all([
      prisma.borrowRequest.findUnique({ where: { requestId: BigInt(response.body.requestId) } }),
      prisma.book.findUnique({ where: { bookId: book.bookId } }),
    ]);
    expect(savedRequest.status).toBe('Pending');
    expect(savedBook.availableCopies).toBe(2);
  });

  it('lets an Admin approve a pending request and decrements inventory by one', async () => {
    const pending = await createPendingRequest();

    const response = await request(app)
      .put(`/admin/requests/${pending.requestId}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ action: 'Approve' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('Approved');
    expect(response.body.actualBorrowDate).toBeTruthy();
    expect(response.body.dueDate).toBeTruthy();

    const [savedRequest, savedBook] = await Promise.all([
      prisma.borrowRequest.findUnique({ where: { requestId: BigInt(pending.requestId) } }),
      prisma.book.findUnique({ where: { bookId: book.bookId } }),
    ]);
    expect(savedRequest.status).toBe('Approved');
    expect(savedBook.availableCopies).toBe(1);
  });

  it('rejects approval if stock reached zero after the request was submitted', async () => {
    const pending = await createPendingRequest();
    await prisma.book.update({
      where: { bookId: book.bookId },
      data: { availableCopies: 0 },
    });

    const response = await request(app)
      .put(`/admin/requests/${pending.requestId}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ action: 'Approve' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/no copies are currently available/i);

    const [savedRequest, savedBook] = await Promise.all([
      prisma.borrowRequest.findUnique({ where: { requestId: BigInt(pending.requestId) } }),
      prisma.book.findUnique({ where: { bookId: book.bookId } }),
    ]);
    expect(savedRequest.status).toBe('Pending');
    expect(savedRequest.actualBorrowDate).toBeNull();
    expect(savedBook.availableCopies).toBe(0);
  });

  it('returns 403 when a Borrower token calls the Admin approval endpoint', async () => {
    const pending = await createPendingRequest();

    const response = await request(app)
      .put(`/admin/requests/${pending.requestId}`)
      .set('Authorization', `Bearer ${tokenFor(borrower)}`)
      .send({ action: 'Approve' });

    expect(response.status).toBe(403);
    const savedRequest = await prisma.borrowRequest.findUnique({
      where: { requestId: BigInt(pending.requestId) },
    });
    const savedBook = await prisma.book.findUnique({ where: { bookId: book.bookId } });
    expect(savedRequest.status).toBe('Pending');
    expect(savedBook.availableCopies).toBe(2);
  });
});
