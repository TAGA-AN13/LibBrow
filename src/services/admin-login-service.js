import { timingSafeEqual, randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { issueAccessToken } from '../middleware/auth.js';
import { ServiceError } from './borrow-request-service.js';

function matchesCredential(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  const candidateBytes = Buffer.from(candidate, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

export async function AdminLogin({ username, password }) {
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredUsername || !configuredPassword) {
    throw new ServiceError('Admin sign-in is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in the API .env file.', 503);
  }
  if (!matchesCredential(username, configuredUsername) || !matchesCredential(password, configuredPassword)) {
    throw new ServiceError('Incorrect username or password', 401);
  }

  let admin = await prisma.user.findFirst({
    where: { role: 'Admin' },
    orderBy: { userId: 'asc' },
    select: { userId: true, name: true, email: true, role: true },
  });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        name: 'Library Admin',
        email: `admin-${randomUUID()}@local.invalid`,
        passwordHash: 'local-env-auth-only',
        role: 'Admin',
      },
      select: { userId: true, name: true, email: true, role: true },
    });
  }

  const accessToken = issueAccessToken(admin, { authMethod: 'local_admin' });
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: process.env.JWT_EXPIRES_IN || '1h',
    user: { name: admin.name, email: admin.email, role: admin.role },
  };
}
