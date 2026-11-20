import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { ServiceError } from '../services/borrow-request-service.js';

const JWT_ISSUER = 'book-borrow-api';
const JWT_AUDIENCE = 'book-borrow-api';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  return secret;
}

export function assertAuthConfig() {
  getJwtSecret();
}

export function issueAccessToken(user, { authMethod } = {}) {
  return jwt.sign(
    { role: user.role, ...(authMethod ? { auth_method: authMethod } : {}) },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      subject: user.userId.toString(),
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    },
  );
}

export function authenticateToken(req, res, next) {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+([^\s]+)$/i)
    : null;
  if (!match) return res.status(401).json({ error: 'A Bearer access token is required' });

  let claims;
  try {
    claims = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (error) {
    if (error.message === 'JWT_SECRET must contain at least 32 bytes') return next(error);
    return res.status(401).json({ error: 'Access token is invalid or expired' });
  }

  if (
    typeof claims !== 'object'
    || !claims.sub
    || !['Admin', 'Borrower'].includes(claims.role)
    || !/^[1-9]\d*$/.test(claims.sub)
  ) {
    return res.status(401).json({ error: 'Access token claims are invalid' });
  }

  req.user = { userId: claims.sub, role: claims.role };
  next();
}

/** Validate the signed, short-lived local administrator session on API routes. */
export async function authenticateAdmin(req, res, next) {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+([^\s]+)$/i) : null;
  if (!match) return res.status(401).json({ error: 'A Bearer access token is required' });
  try {
    const claims = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
    });
    if (claims.auth_method !== 'local_admin' || claims.role !== 'Admin' || !/^[1-9]\d*$/.test(claims.sub ?? '')) {
      return res.status(401).json({ error: 'Administrator session is invalid' });
    }
    const user = await prisma.user.findUnique({
      where: { userId: BigInt(claims.sub) },
      select: { userId: true, name: true, email: true, role: true },
    });
    if (!user || user.role !== 'Admin') return res.status(403).json({ error: 'Administrator access is no longer active' });
    req.user = { userId: user.userId.toString(), name: user.name, email: user.email, role: 'Admin' };
    next();
  } catch (error) {
    if (error.message === 'JWT_SECRET must contain at least 32 bytes') return next(error);
    return res.status(401).json({ error: 'Administrator session is invalid or expired' });
  }
}

export const requireAuthenticatedUser = authenticateToken;

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      if (req.user?.role === 'Borrower' && role === 'Admin') {
        return res.status(403).json({ error: 'Admin role required' });
      }
      return next(new ServiceError(`${role} role required`, 403));
    }
    next();
  };
}
