import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { ServiceError } from './borrow-request-service.js';

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ServiceError(`${field} must be a positive integer`);
  }
  return parsed;
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceError(`${field} is required`);
  }
  return value.trim();
}

function normalizeIsbn(value) {
  const isbn = String(value ?? '').replaceAll('-', '').replaceAll(' ', '');
  if (!/^\d{13}$/.test(isbn)) throw new ServiceError('isbn must be a 13-digit ISBN');
  return isbn;
}

function parseBookId(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) throw new ServiceError('bookId must be a positive integer');
  return BigInt(value);
}

function validateBookMetadata({ imageUrl: rawImageUrl, categories: rawCategories }) {
  const imageUrl = rawImageUrl == null || rawImageUrl === '' ? null : String(rawImageUrl);
  if (imageUrl && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(imageUrl) || imageUrl.length > 2_800_000)) {
    throw new ServiceError('Book cover must be a PNG, JPEG, or WebP image no larger than 2 MB');
  }
  const allowedCategories = new Set(['Biography', 'Children’s', 'Education', 'Fantasy', 'Fiction', 'History', 'Horror', 'Music', 'Mystery', 'Nonfiction', 'Other', 'Romance', 'Science Fiction', 'Self-help', 'Young Adult']);
  if (!Array.isArray(rawCategories) || rawCategories.some((category) => typeof category !== 'string' || !allowedCategories.has(category))) {
    throw new ServiceError('categories must be a list of supported book categories');
  }
  return { imageUrl, categories: [...new Set(rawCategories)] };
}

/** Return the public catalog fields only. */
export async function ListBooks() {
  return prisma.book.findMany({
    select: {
      bookId: true,
      isbn: true,
      title: true,
      author: true,
      imageUrl: true,
      categories: true,
      totalCopies: true,
      availableCopies: true,
    },
    orderBy: [{ title: 'asc' }, { bookId: 'asc' }],
  });
}

/** Correct a saved title's catalog details and total copy count. */
export async function UpdateBook({ bookId: rawBookId, isbn: rawIsbn, title: rawTitle, author: rawAuthor, totalCopies: rawTotalCopies, imageUrl: rawImageUrl, categories: rawCategories }) {
  const bookId = parseBookId(rawBookId);
  const isbn = normalizeIsbn(rawIsbn);
  const title = requiredText(rawTitle, 'title');
  const author = requiredText(rawAuthor, 'author');
  const totalCopies = positiveInteger(rawTotalCopies, 'total_copies');
  const { imageUrl, categories } = validateBookMetadata({ imageUrl: rawImageUrl, categories: rawCategories });
  return prisma.$transaction(async (tx) => {
    const existing = await tx.book.findUnique({ where: { bookId } });
    if (!existing) throw new ServiceError('Book not found', 404);
    const borrowedCopies = existing.totalCopies - existing.availableCopies;
    if (totalCopies < borrowedCopies) {
      throw new ServiceError(`Total copies cannot be fewer than ${borrowedCopies} copies currently on loan`, 409);
    }
    return tx.book.update({
      where: { bookId },
      data: { isbn, title, author, imageUrl, categories, totalCopies, availableCopies: totalCopies - borrowedCopies },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Add a title or add copies to an existing ISBN. */
export async function AddOrRestockBook({ isbn: rawIsbn, title: rawTitle, author: rawAuthor, copies: rawCopies, imageUrl: rawImageUrl, categories: rawCategories }) {
  const isbn = normalizeIsbn(rawIsbn);
  const title = requiredText(rawTitle, 'title');
  const author = requiredText(rawAuthor, 'author');
  const copies = positiveInteger(rawCopies ?? 1, 'copies');
  const { imageUrl, categories } = validateBookMetadata({ imageUrl: rawImageUrl, categories: rawCategories ?? [] });

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.book.findUnique({ where: { isbn } });
        if (!existing) {
          return tx.book.create({
            data: {
              isbn,
              title,
              author,
              imageUrl,
              categories,
              totalCopies: copies,
              availableCopies: copies,
            },
          });
        }

        if (existing.title !== title || existing.author !== author) {
          throw new ServiceError('ISBN already exists with different title or author', 409);
        }
        return tx.book.update({
          where: { bookId: existing.bookId },
          data: {
            totalCopies: { increment: copies },
            availableCopies: { increment: copies },
            ...(imageUrl ? { imageUrl } : {}),
            ...(categories.length ? { categories } : {}),
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // A simultaneous first insert can conflict on ISBN; retry so this call
      // observes the winning row and performs a normal restock.
      if (['P2002', 'P2034'].includes(error?.code) && attempt < 3) continue;
      if (error?.code === 'P2002') throw new ServiceError('A book with this ISBN already exists', 409);
      throw error;
    }
  }
}
