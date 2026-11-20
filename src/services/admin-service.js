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
      book: { select: { bookId: true, isbn: true, title: true, author: true, imageUrl: true } },
      loan: true,
      statusChangedByUser: { select: { userId: true, name: true } },
    },
    orderBy: [{ requestDate: 'asc' }, { requestId: 'asc' }],
  });
}

export async function ListBorrowers() {
  const records = await prisma.borrower.findMany({
    include: { requests: { where: { status: 'Approved' }, select: { returnDate: true, resolution: true } } },
    orderBy: [{ name: 'asc' }, { borrowerId: 'asc' }],
  });
  return records.map(({ requests, ...borrower }) => ({
    ...borrower,
    transactionSummary: {
      unreturned: requests.filter((request) => !request.returnDate).length,
      returned: requests.filter((request) => Boolean(request.returnDate) && request.resolution !== 'Lost').length,
      totalBorrowed: requests.length,
    },
  }));
}

const SOCIETY_ROLES = ['Student', 'Teacher / Faculty', 'School Staff', 'Parent / Guardian', 'Alumni', 'Community Member', 'Other'];
const BORROWER_STATUSES = ['Active', 'Inactive', 'Suspended'];

function borrowerData({ member_id: memberId, contact_number: contactNumber, full_name: name, email, society_role: societyRole, status = 'Active' }) {
  if (typeof memberId !== 'string' || !memberId.trim()) throw new ServiceError('Member or student ID is required');
  if (typeof contactNumber !== 'string' || !contactNumber.trim()) throw new ServiceError('Contact number is required');
  if (typeof name !== 'string' || !name.trim()) throw new ServiceError('Full name is required');
  if (typeof email !== 'string' || !email.trim() || !email.includes('@')) throw new ServiceError('A valid borrower email is required');
  if (!SOCIETY_ROLES.includes(societyRole)) throw new ServiceError('Choose a valid role in society');
  if (!BORROWER_STATUSES.includes(status)) throw new ServiceError('Choose a valid borrower status');
  return { memberId: memberId.trim(), contactNumber: contactNumber.trim(), societyRole, status, name: name.trim(), email: email.trim() };
}

export async function RegisterBorrower(input) {
  return prisma.borrower.create({ data: borrowerData(input) });
}

export async function UpdateBorrower({ borrowerId, member_id: memberId, contact_number: contactNumber, full_name: name, email, society_role: societyRole, status }) {
  const borrowerKey = parseId(borrowerId, 'borrowerId');
  if (typeof memberId !== 'string' || !memberId.trim()) throw new ServiceError('Member or student ID is required');
  if (typeof contactNumber !== 'string' || !contactNumber.trim()) throw new ServiceError('Contact number is required');
  if (typeof name !== 'string' || !name.trim()) throw new ServiceError('Full name is required');
  if (typeof email !== 'string' || !email.trim() || !email.includes('@')) throw new ServiceError('A valid borrower email is required');
  if (!SOCIETY_ROLES.includes(societyRole)) throw new ServiceError('Choose a valid role in society');
  if (!BORROWER_STATUSES.includes(status)) throw new ServiceError('Choose a valid borrower status');
  return prisma.borrower.update({ where: { borrowerId: borrowerKey }, data: { memberId: memberId.trim(), contactNumber: contactNumber.trim(), name: name.trim(), email: email.trim(), societyRole, status } });
}

export async function UpdateBorrowerStatus({ borrowerId, status }) {
  const parsedBorrowerId = parseId(borrowerId, 'borrowerId');
  if (!BORROWER_STATUSES.includes(status)) throw new ServiceError('status must be Active, Inactive, or Suspended');
  return prisma.borrower.update({ where: { borrowerId: parsedBorrowerId }, data: { status } });
}

export async function DeleteBorrower({ borrowerId }) {
  const borrowerKey = parseId(borrowerId, 'borrowerId');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT borrower_id FROM public.borrowers WHERE borrower_id = ${borrowerKey} FOR UPDATE`;
    const borrower = await tx.borrower.findUnique({ where: { borrowerId: borrowerKey } });
    if (!borrower) throw new ServiceError('Borrower not found', 404);
    const transactionCount = await tx.borrowRequest.count({ where: { borrowerRecordId: borrowerKey } });
    if (transactionCount) throw new ServiceError('This borrower has transaction history and cannot be deleted. Set their status to Inactive to preserve the record.', 409);
    await tx.borrower.delete({ where: { borrowerId: borrowerKey } });
    return borrower;
  });
}

export async function CheckoutBook({ adminId, borrowerId, newBorrower, bookId, loanDays = 14 }) {
  const adminKey = parseId(adminId, 'adminId');
  const borrowerKey = borrowerId ? parseId(borrowerId, 'borrowerId') : null;
  if (!borrowerKey && !newBorrower) throw new ServiceError('Choose an existing borrower or enter new borrower details');
  const bookKey = parseId(bookId, 'bookId');
  if (!Number.isInteger(loanDays) || loanDays < 1 || loanDays > 30) throw new ServiceError('loan_days must be from 1 to 30');
  return prisma.$transaction(async (tx) => {
    const borrower = newBorrower
      ? await tx.borrower.create({ data: borrowerData(newBorrower) })
      : await tx.borrower.findUnique({ where: { borrowerId: borrowerKey } });
    if (!borrower) throw new ServiceError('Borrower not found', 404);
    if (borrower.status !== 'Active') throw new ServiceError('Only active borrowers may borrow books', 409);
    await tx.$queryRaw`SELECT borrower_id FROM public.borrowers WHERE borrower_id = ${borrower.borrowerId} FOR UPDATE`;
    const currentLoanCount = await tx.borrowRequest.count({ where: { borrowerRecordId: borrower.borrowerId, status: 'Approved', returnDate: null } });
    const limitSetting = await tx.librarySetting.findUnique({ where: { settingKey: 'max_concurrent_books' } });
    const maxConcurrentBooks = Number(limitSetting?.value ?? 3);
    if (currentLoanCount >= maxConcurrentBooks) {
      throw new ServiceError(`This borrower has reached the limit of ${maxConcurrentBooks} books at a time`, 409);
    }
    const book = await tx.book.findUnique({ where: { bookId: bookKey } });
    if (!book) throw new ServiceError('Book not found', 404);
    const stock = await tx.book.updateMany({ where: { bookId: bookKey, availableCopies: { gt: 0 } }, data: { availableCopies: { decrement: 1 } } });
    if (!stock.count) throw new ServiceError('No copies are currently available', 409);
    const borrowDate = new Date(); borrowDate.setUTCHours(0, 0, 0, 0);
    const dueDate = new Date(borrowDate); dueDate.setUTCDate(dueDate.getUTCDate() + loanDays);
    const request = await tx.borrowRequest.create({ data: { borrowerRecordId: borrower.borrowerId, customerName: borrower.name, customerEmail: borrower.email, customerAddress: borrower.address, bookId: bookKey, requestedLoanDays: loanDays, status: 'Approved', statusChangedBy: adminKey, actualBorrowDate: borrowDate, dueDate } });
    await tx.loan.create({ data: { requestId: request.requestId, borrowerId: borrower.borrowerId, bookId: bookKey, actualBorrowDate: borrowDate, dueDate } });
    const copy = await tx.bookCopy.findFirst({ where: { bookId: bookKey, status: 'Available' }, orderBy: { copyId: 'asc' } });
    if (copy) await tx.bookCopy.update({ where: { copyId: copy.copyId }, data: { status: 'On loan', requestId: request.requestId } });
    return { ...request, borrowerRecord: borrower, book, borrowerCreated: Boolean(newBorrower) };
  });
}

export async function ListTransactions() {
  return prisma.borrowRequest.findMany({ include: { borrowerRecord: true, book: { select: { bookId: true, isbn: true, title: true, author: true } } }, orderBy: [{ requestDate: 'desc' }, { requestId: 'desc' }] });
}

/** Mark one active approved loan as returned and restore exactly one copy. */
export async function MarkBookReturned({ adminId, requestId, resolution = 'Returned', note = '' }) {
  const parsedAdminId = parseId(adminId, 'adminId');
  const parsedRequestId = parseId(requestId, 'requestId');
  if (!['Returned', 'Lost', 'Damaged'].includes(resolution)) throw new ServiceError('Choose Returned, Lost, or Damaged');
  if (typeof note !== 'string' || note.length > 1000) throw new ServiceError('Staff note must be 1,000 characters or fewer');

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
      data: { returnDate: new Date(), resolution, resolutionNote: note.trim() || null },
    });
    if (returned.count !== 1) throw new ServiceError('This request has already been returned', 409);

    await tx.loan.updateMany({
      where: { requestId: parsedRequestId, returnDate: null },
      data: { returnDate: new Date(), resolution },
    });

    if (resolution === 'Returned') {
      await tx.book.update({ where: { bookId: request.book_id }, data: { availableCopies: { increment: 1 } } });
      await tx.bookCopy.updateMany({ where: { requestId: parsedRequestId }, data: { status: 'Available', requestId: null } });
    } else {
      await tx.book.update({ where: { bookId: request.book_id }, data: { totalCopies: { decrement: 1 } } });
      await tx.bookCopy.updateMany({ where: { requestId: parsedRequestId }, data: { status: resolution, requestId: null } });
    }

    return tx.borrowRequest.findUnique({
      where: { requestId: parsedRequestId },
      include: { book: { select: { bookId: true, title: true, availableCopies: true } } },
    });
  });
}

export async function RenewLoan({ adminId, requestId, loanDays = 14 }) {
  const parsedAdminId = parseId(adminId, 'adminId');
  const parsedRequestId = parseId(requestId, 'requestId');
  if (!Number.isInteger(loanDays) || loanDays < 1 || loanDays > 30) throw new ServiceError('Renewal period must be from 1 to 30 days');
  return prisma.$transaction(async (tx) => {
    const admins = await tx.$queryRaw`SELECT user_id FROM users WHERE user_id = ${parsedAdminId} AND role = 'Admin'`;
    if (!admins.length) throw new ServiceError('Admin not found or not authorized', 403);
    const request = await tx.borrowRequest.findUnique({ where: { requestId: parsedRequestId } });
    if (!request || request.status !== 'Approved' || request.returnDate) throw new ServiceError('Only active loans can be renewed', 409);
    const dueDate = new Date(Math.max(Date.now(), new Date(request.dueDate).getTime()));
    dueDate.setUTCHours(0, 0, 0, 0);
    dueDate.setUTCDate(dueDate.getUTCDate() + loanDays);
    const updated = await tx.borrowRequest.update({ where: { requestId: parsedRequestId }, data: { dueDate } });
    await tx.loan.updateMany({ where: { requestId: parsedRequestId, returnDate: null }, data: { dueDate } });
    return updated;
  });
}

export async function ListAuditEvents() {
  const events = await prisma.auditEvent.findMany({ include: { admin: { select: { userId: true, name: true } }, borrower: { select: { borrowerId: true, name: true } }, book: { select: { bookId: true, title: true } } }, orderBy: [{ createdAt: 'desc' }, { auditEventId: 'desc' }], take: 500 });
  return events.map((event) => ({ ...event, action: `${event.admin?.name ?? 'Admin'} · ${event.action}` }));
}
