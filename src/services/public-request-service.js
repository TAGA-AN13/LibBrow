import { randomBytes } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { ServiceError } from './borrow-request-service.js';

function parseBookId(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) throw new ServiceError('book_id must be a positive integer');
  return BigInt(value);
}

function requiredText(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw new ServiceError(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new ServiceError(`${field} must be ${max} characters or fewer`);
  return normalized;
}

export async function CreatePublicBorrowRequest({ name, email, bookId, loanDays }) {
  const customerName = requiredText(name, 'name', 160);
  const customerEmail = requiredText(email, 'email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new ServiceError('email must be a valid email address');
  const parsedBookId = parseBookId(bookId);
  const requestedLoanDays = loanDays === undefined || loanDays === null || loanDays === ''
    ? 14 : Number(loanDays);
  if (!Number.isInteger(requestedLoanDays) || requestedLoanDays < 1 || requestedLoanDays > 30) {
    throw new ServiceError('loan_days must be an integer from 1 to 30');
  }

  const book = await prisma.book.findUnique({ where: { bookId: parsedBookId } });
  if (!book) throw new ServiceError('Book not found', 404);
  if (book.availableCopies < 1) throw new ServiceError('No copies are currently available', 409);

  const reference = randomBytes(18).toString('hex');
  const request = await prisma.borrowRequest.create({
    data: {
      bookId: parsedBookId,
      publicReference: reference,
      customerName,
      customerEmail,
      requestedLoanDays,
      status: 'Pending',
    },
    include: { book: { select: { title: true, author: true } } },
  });
  return {
    reference,
    status: request.status,
    requestDate: request.requestDate,
    requestedLoanDays,
    book: request.book,
  };
}

function publicRequestShape(request) {
  if (!request) throw new ServiceError('Request reference not found', 404);
  return {
    reference: request.publicReference,
    status: request.status,
    requestDate: request.requestDate,
    requestedLoanDays: request.requestedLoanDays,
    dueDate: request.loan?.dueDate ?? request.dueDate,
    returnNoticeDate: request.returnNoticeDate,
    returnDate: request.loan?.returnDate ?? request.returnDate,
    bookRating: request.bookRating,
    book: { title: request.book.title, author: request.book.author },
  };
}

export async function GetPublicBorrowRequest(reference) {
  if (typeof reference !== 'string' || !/^[a-f0-9]{36}$/.test(reference)) {
    throw new ServiceError('A valid request reference is required');
  }
  const request = await prisma.borrowRequest.findUnique({
    where: { publicReference: reference },
    include: { book: { select: { title: true, author: true } }, loan: true },
  });
  return publicRequestShape(request);
}

export async function SubmitReturnNotice(reference) {
  if (typeof reference !== 'string' || !/^[a-f0-9]{36}$/.test(reference)) {
    throw new ServiceError('A valid request reference is required');
  }
  const request = await prisma.borrowRequest.findUnique({ where: { publicReference: reference } });
  if (!request) throw new ServiceError('Request reference not found', 404);
  if (request.status !== 'Approved') throw new ServiceError('A return notice can only be sent for an approved loan', 409);
  if (request.returnDate) throw new ServiceError('This loan has already been returned', 409);

  if (!request.returnNoticeDate) {
    await prisma.borrowRequest.updateMany({
      where: { requestId: request.requestId, returnNoticeDate: null, returnDate: null },
      data: { returnNoticeDate: new Date() },
    });
  }
  return GetPublicBorrowRequest(reference);
}

export async function RateReturnedBook(reference, rating) {
  if (typeof reference !== 'string' || !/^[a-f0-9]{36}$/.test(reference)) {
    throw new ServiceError('A valid request reference is required');
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ServiceError('rating must be a whole number from 1 to 5');
  }

  const request = await prisma.borrowRequest.findUnique({
    where: { publicReference: reference },
    include: { book: { select: { title: true, author: true } }, loan: true },
  });
  if (!request) throw new ServiceError('Request reference not found', 404);
  if (request.status !== 'Approved' || !(request.loan?.returnDate ?? request.returnDate)) {
    throw new ServiceError('You can rate this book after its return is confirmed', 409);
  }

  await prisma.borrowRequest.update({
    where: { requestId: request.requestId },
    data: { bookRating: rating },
  });
  return GetPublicBorrowRequest(reference);
}
