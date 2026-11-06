import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import { issueAccessToken } from '../middleware/auth.js';
import { ServiceError } from './borrow-request-service.js';

export async function Login({ email: rawEmail, password }) {
  if (typeof rawEmail !== 'string' || !rawEmail.trim() || typeof password !== 'string' || !password) {
    throw new ServiceError('Email and password are required');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new ServiceError('Password must be 72 UTF-8 bytes or fewer');
  }

  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ServiceError('Invalid email or password', 401);

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, user.passwordHash);
  } catch {
    // A malformed or non-bcrypt hash is treated as an invalid credential.
  }
  if (!passwordMatches) throw new ServiceError('Invalid email or password', 401);
  if (!['Admin', 'Borrower'].includes(user.role)) {
    throw new ServiceError('This account does not have an active application role', 403);
  }

  return {
    access_token: issueAccessToken(user),
    token_type: 'Bearer',
    expires_in: process.env.JWT_EXPIRES_IN || '1h',
    user: {
      user_id: user.userId.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}
