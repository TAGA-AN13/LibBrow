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

export function issueAccessToken(user) {
  return jwt.sign(
    { role: user.role },
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

/** Validate a Supabase Auth access token and map the email to an Admin record. */
async function resolveSupabaseIdentity(req, res) {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+([^\s]+)$/i)
    : null;
  if (!match) {
    res.status(401).json({ error: 'A Supabase Bearer access token is required' });
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    res.status(503).json({ error: 'Staff authentication is not configured on the API' });
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${match[1]}` },
    });
    if (!response.ok) {
      res.status(401).json({ error: 'Supabase session is invalid or expired' });
      return null;
    }
    const authUser = await response.json();
    if (!authUser?.email) {
      res.status(401).json({ error: 'Supabase account has no email address' });
      return null;
    }
    return authUser;
  } catch (error) {
    throw error;
  }
}

export async function authenticateSupabaseUser(req, res, next) {
  try {
    const authUser = await resolveSupabaseIdentity(req, res);
    if (!authUser) return;
    req.authUser = authUser;
    next();
  } catch (error) {
    next(error);
  }
}

export async function authenticateSupabaseStaff(req, res, next) {
  try {
    const authUser = await resolveSupabaseIdentity(req, res);
    if (!authUser) return;
    const user = await prisma.user.findUnique({
      where: { email: authUser.email.toLowerCase() },
      select: { userId: true, name: true, email: true, role: true },
    });
    if (!user || user.role !== 'Admin') {
      res.status(403).json({ error: 'This Supabase account is not an authorized staff member' });
      return;
    }

    req.user = { userId: user.userId.toString(), role: 'Admin', name: user.name, email: user.email, authUserId: authUser.id };
    next();
  } catch (error) {
    next(error);
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
