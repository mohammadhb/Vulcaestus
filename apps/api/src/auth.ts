import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, type CandidateProfile, type User } from '@vulcaestus/db';
import { env } from './env.js';
import { hashToken, randomToken } from './lib/crypto.js';
import { HttpError } from './lib/http.js';

export const SESSION_COOKIE = 'vulcaestus_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'USER';
  disabled: boolean;
}

export interface AuthContext {
  user: AuthUser;
  profile: CandidateProfile | null;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export interface SessionUser {
  user: AuthUser;
  profile: CandidateProfile | null;
  sessionId: string;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    disabled: user.disabled,
  };
}

export async function loadSession(request: FastifyRequest): Promise<AuthContext | null> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.disabled) return null;
  return {
    user: toAuthUser(session.user),
    profile: session.user.profile,
    sessionId: session.id,
  };
}

export async function createSession(
  userId: string,
  request: FastifyRequest,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 300),
    },
  });
  return { token, expiresAt };
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new HttpError(401, 'Authentication required');
  return request.auth;
}

export function requireProfile(request: FastifyRequest): AuthContext & { profile: CandidateProfile } {
  const auth = requireAuth(request);
  if (!auth.profile) {
    throw new HttpError(409, 'Create your candidate profile before using this feature');
  }
  return auth as AuthContext & { profile: CandidateProfile };
}

export function requireAdmin(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request);
  if (auth.user.role !== 'ADMIN') throw new HttpError(403, 'Administrator access required');
  return auth;
}

export function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? '';
  return (
    path === '/health' ||
    path === '/ready' ||
    path === '/api/auth/login' ||
    path === '/api/auth/setup' ||
    path === '/api/auth/status' ||
    path.startsWith('/api/webhooks/') ||
    path.startsWith('/api/internal/')
  );
}

export async function createDefaultProfile(
  userId: string,
  fullName: string,
  email: string,
): Promise<CandidateProfile> {
  return prisma.candidateProfile.create({
    data: {
      userId,
      fullName,
      email,
      summary: null,
      targetTitles: [],
      alternativeTitles: [],
      targetCountries: [],
      targetCities: [],
      industries: [],
      priorityCompanies: [],
      excludedCompanies: [],
      technologies: [],
      languages: [],
      employmentTypes: [],
      authorizedCountries: [],
    },
  });
}
