import { prisma } from '../db/prisma.js';
import { ServiceError } from './borrow-request-service.js';

function parseId(value, field) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
    throw new ServiceError(`${field} must be a positive integer`);
  }
  return BigInt(value);
}

export async function ListAdminRequests({ status = 'Pending' } = {}) {
  if (!['Pending', 'Approved', 'Denied'].includes(status)) {
    throw new ServiceError('status must be Pending, Approved, or Denied');
  }
  return prisma.borrowRequest.findMany({
    where: { status },
    include: {
      borrower: { select: { userId: true, name: true, email: true } },
      borrowerRecord: { select: { borrowerId: true, name: true, email: true, address: true } },
      book: { select: { bookId: true, isbn: true, title: true, author: true } },
      loan: true,
      statusChangedByUser: { select: { userId: true, name: true } },
    },
    orderBy: [{ requestDate: 'asc' }, { requestId: 'asc' }],
  });
}

export async function ListMyRequests({ borrowerId }) {
  const parsedBorrowerId = parseId(borrowerId, 'borrowerId');
  return prisma.borrowRequest.findMany({
    where: { borrowerId: parsedBorrowerId },
    include: {
      book: { select: { bookId: true, isbn: true, title: true, author: true } },
      statusChangedByUser: { select: { userId: true, name: true } },
    },
    orderBy: [{ requestDate: 'desc' }, { requestId: 'desc' }],
  });
}

/** Mark one active approved loan as returned and restore exactly one copy. */
export async function MarkBookReturned({ adminId, requestId }) {
  const parsedAdminId = parseId(adminId, 'adminId');
  const parsedRequestId = parseId(requestId, 'requestId');

  return prisma.$transaction(async (tx) => {
    const admins = await tx.$queryRaw`
      SELECT user_id FROM users WHERE user_id = ${parsedAdminId} AND role = 'Admin'
    `;
    if (admins.length === 0) throw new ServiceError('Admin not found or not authorized', 403);

    const rows = await tx.$queryRaw`
      SELECT request_id, book_id, status, return_date
      FROM borrow_requests WHERE request_id = ${parsedRequestId} FOR UPDATE
    `;
    const request = rows[0];
    if (!request) throw new ServiceError('Borrow request not found', 404);
    if (request.status !== 'Approved') throw new ServiceError('Only approved requests can be returned', 409);
    if (request.return_date !== null) throw new ServiceError('This request has already been returned', 409);

    const returned = await tx.borrowRequest.updateMany({
      where: { requestId: parsedRequestId, status: 'Approved', returnDate: null },
      data: { returnDate: new Date() },
    });
    if (returned.count !== 1) throw new ServiceError('This request has already been returned', 409);

    await tx.loan.updateMany({
      where: { requestId: parsedRequestId, returnDate: null },
      data: { returnDate: new Date() },
    });

    await tx.book.update({
      where: { bookId: request.book_id },
      data: { availableCopies: { increment: 1 } },
    });

    return tx.borrowRequest.findUnique({
      where: { requestId: parsedRequestId },
      include: { book: { select: { bookId: true, title: true, availableCopies: true } } },
    });
  });
}
