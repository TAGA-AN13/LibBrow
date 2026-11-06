import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const MAX_OPEN_REQUESTS = 3;
const MAX_TRANSACTION_ATTEMPTS = 3;

function parseId(value, fieldName) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
    throw new ServiceError(`${fieldName} must be a positive integer`);
  }
  return BigInt(value);
}

export class ServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

async function withSerializationRetry(work) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (error?.code !== 'P2034' || attempt >= MAX_TRANSACTION_ATTEMPTS) throw error;
    }
  }
}

/** Create a pending request for the authenticated borrower. */
export async function CreateBorrowRequest({ borrowerId, bookId }) {
  const parsedBorrowerId = parseId(borrowerId, 'borrowerId');
  const parsedBookId = parseId(bookId, 'bookId');

  return withSerializationRetry(() => prisma.$transaction(async (tx) => {
    // Serialize concurrent submissions by this borrower so the three-request
    // limit cannot be bypassed by simultaneous requests.
    const borrowerRows = await tx.$queryRaw`
      SELECT user_id, role FROM users WHERE user_id = ${parsedBorrowerId} FOR UPDATE
    `;
    const borrower = borrowerRows[0];
    if (!borrower) throw new ServiceError('Borrower not found', 404);
    if (borrower.role !== 'Borrower') throw new ServiceError('Only Borrowers can submit requests', 403);

    const openCount = await tx.borrowRequest.count({
      where: {
        borrowerId: parsedBorrowerId,
        OR: [
          { status: 'Pending' },
          { status: 'Approved', returnDate: null },
        ],
      },
    });
    if (openCount >= MAX_OPEN_REQUESTS) {
      throw new ServiceError('A borrower may have at most 3 pending or unreturned approved requests', 409);
    }

    const book = await tx.book.findUnique({ where: { bookId: parsedBookId } });
    if (!book) throw new ServiceError('Book not found', 404);
    if (book.availableCopies <= 0) throw new ServiceError('No copies are currently available', 409);

    return tx.borrowRequest.create({
      data: {
        borrowerId: parsedBorrowerId,
        bookId: parsedBookId,
        status: 'Pending',
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

/** Admin decision for a pending request. Approval reserves one available copy. */
export async function ProcessRequestApproval({ adminId, requestId, action, loanPeriodDays = 14 }) {
  const parsedAdminId = parseId(adminId, 'adminId');
  const parsedRequestId = parseId(requestId, 'requestId');
  if (!['Approve', 'Deny'].includes(action)) {
    throw new ServiceError("action must be either 'Approve' or 'Deny'");
  }
  if (!Number.isInteger(loanPeriodDays) || loanPeriodDays < 1 || loanPeriodDays > 30) {
    throw new ServiceError('loanPeriodDays must be an integer from 1 to 30');
  }

  return prisma.$transaction(async (tx) => {
    const admins = await tx.$queryRaw`
      SELECT user_id FROM users WHERE user_id = ${parsedAdminId} AND role = 'Admin'
    `;
    if (admins.length === 0) throw new ServiceError('Admin not found or not authorized', 403);

    // Lock the request row so simultaneous decisions cannot both take effect.
    const rows = await tx.$queryRaw`
      SELECT request_id, book_id, status, borrower_id, borrower_record_id,
             customer_name, customer_email, customer_address, requested_loan_days
      FROM borrow_requests
      WHERE request_id = ${parsedRequestId}
      FOR UPDATE
    `;
    const request = rows[0];
    if (!request) throw new ServiceError('Borrow request not found', 404);
    if (request.status !== 'Pending') throw new ServiceError('Only pending requests can be processed', 409);

    if (action === 'Deny') {
      return tx.borrowRequest.update({
        where: { requestId: parsedRequestId },
        data: { status: 'Denied', statusChangedBy: parsedAdminId },
      });
    }

    // Conditional decrement prevents stock from ever going below zero, even
    // when separate admins approve requests for the last copy at the same time.
    const decrement = await tx.book.updateMany({
      where: { bookId: request.book_id, availableCopies: { gt: 0 } },
      data: { availableCopies: { decrement: 1 } },
    });
    if (decrement.count !== 1) throw new ServiceError('No copies are currently available', 409);

    const borrowDate = new Date();
    borrowDate.setUTCHours(0, 0, 0, 0);
    const dueDate = new Date(borrowDate);
    const requestedDays = request.requested_loan_days ?? loanPeriodDays;
    dueDate.setUTCDate(dueDate.getUTCDate() + requestedDays);

    let borrower = request.borrower_record_id
      ? await tx.borrower.findUnique({ where: { borrowerId: request.borrower_record_id } })
      : null;
    if (!borrower) {
      const legacyBorrower = request.borrower_id
        ? await tx.user.findUnique({ where: { userId: request.borrower_id } })
        : null;
      const name = request.customer_name ?? legacyBorrower?.name;
      const email = request.customer_email ?? legacyBorrower?.email;
      if (!name || !email) throw new ServiceError('Borrower details are missing from this request', 409);
      borrower = await tx.borrower.create({
        data: {
          name,
          email,
          address: request.customer_address ?? 'In-store pickup',
        },
      });
    }

    await tx.loan.create({
      data: {
        requestId: parsedRequestId,
        borrowerId: borrower.borrowerId,
        bookId: request.book_id,
        actualBorrowDate: borrowDate,
        dueDate,
      },
    });

    return tx.borrowRequest.update({
      where: { requestId: parsedRequestId },
      data: {
        status: 'Approved',
        statusChangedBy: parsedAdminId,
        actualBorrowDate: borrowDate,
        dueDate,
        borrowerRecordId: borrower.borrowerId,
      },
    });
  });
}
