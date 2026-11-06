import { timingSafeEqual } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { ServiceError } from './borrow-request-service.js';

export async function GetFirstAdminSetupStatus() {
  const adminCount = await prisma.user.count({ where: { role: 'Admin' } });
  return {
    available: adminCount === 0,
    configured: Buffer.byteLength(process.env.ADMIN_BOOTSTRAP_KEY ?? '', 'utf8') >= 32,
  };
}

function checkBootstrapKey(candidate) {
  const expected = process.env.ADMIN_BOOTSTRAP_KEY;
  if (!expected || Buffer.byteLength(expected, 'utf8') < 32) {
    throw new ServiceError('First-admin setup is not configured. Set ADMIN_BOOTSTRAP_KEY on the API.', 503);
  }
  if (typeof candidate !== 'string') throw new ServiceError('Setup key is incorrect', 403);
  const expectedBytes = Buffer.from(expected, 'utf8');
  const candidateBytes = Buffer.from(candidate, 'utf8');
  if (candidateBytes.length !== expectedBytes.length || !timingSafeEqual(candidateBytes, expectedBytes)) {
    throw new ServiceError('Setup key is incorrect', 403);
  }
}

export async function CreateFirstAdmin({ authUser, name, bootstrapKey }) {
  checkBootstrapKey(bootstrapKey);
  if (!authUser?.id || !authUser.email) throw new ServiceError('A valid Supabase Auth account is required', 401);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) {
    throw new ServiceError('name is required and must be 160 characters or fewer');
  }

  const email = authUser.email.trim().toLowerCase();
  const displayName = name.trim();
  return prisma.$transaction(async (tx) => {
    // Serialize first-run claims. Only one signed-in Supabase account can create
    // the initial Admin record, even if multiple setup requests arrive together.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(7210483021)`;
    const existingAdmin = await tx.user.findFirst({ where: { role: 'Admin' }, select: { userId: true } });
    if (existingAdmin) throw new ServiceError('First-admin setup is already complete', 409);

    const existingUser = await tx.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ServiceError('This email already has an application user record. Use a separate Supabase Auth email for the first admin.', 409);
    }
    const admin = await tx.user.create({
      data: {
        name: displayName,
        email,
        passwordHash: 'supabase-auth-only',
        role: 'Admin',
      },
    });

    return { name: admin.name, email: admin.email, role: admin.role };
  });
}
