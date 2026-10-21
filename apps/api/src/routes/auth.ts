import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@vulcaestus/db';
import { env } from '../env.js';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createDefaultProfile,
  createSession,
  requireAuth,
  setSessionCookie,
  toAuthUser,
} from '../auth.js';
import { HttpError, audit, jsonValue } from '../lib/http.js';
import { hashToken } from '../lib/crypto.js';

const passwordSchema = z.string().min(10, 'Password must be at least 10 characters').max(200);
const setupSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1).max(120),
  fullName: z.string().min(1).max(200),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/status', async () => {
    const userCount = await prisma.user.count();
    return {
      needsSetup: userCount === 0,
      registrationOpen: false,
      dryRun: env.DRY_RUN,
      version: '1.0.0',
    };
  });

  app.post('/api/auth/setup', async (request, reply) => {
    const input = setupSchema.parse(request.body);
    const userCount = await prisma.user.count();
    if (userCount > 0) throw new HttpError(409, 'Setup has already been completed');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        name: input.name,
        passwordHash,
        role: 'ADMIN',
        lastLoginAt: new Date(),
      },
    });
    await createDefaultProfile(user.id, input.fullName, input.email.toLowerCase().trim());
    const { token, expiresAt } = await createSession(user.id, request);
    setSessionCookie(reply, token, expiresAt);
    await audit({
      userId: user.id,
      action: 'auth.setup',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ip: request.ip,
    });
    const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
    return reply.code(201).send({ user: toAuthUser(user), profile });
  });

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const email = input.email.toLowerCase().trim();
      const user = await prisma.user.findUnique({ where: { email } });
      const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
      if (!user || !valid || user.disabled) {
        await audit({
          action: 'auth.login',
          result: 'denied',
          metadata: { email },
          ip: request.ip,
        });
        throw new HttpError(401, 'Invalid email or password');
      }
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await prisma.session.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      });
      const { token, expiresAt } = await createSession(user.id, request);
      setSessionCookie(reply, token, expiresAt);
      await audit({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: request.ip });
      const profile = await prisma.candidateProfile.findUnique({ where: { userId: user.id } });
      return { user: toAuthUser(user), profile };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    const auth = requireAuth(request);
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      include: { profile: true },
    });
    if (!user) throw new HttpError(401, 'Authentication required');
    return {
      user: toAuthUser(user),
      profile: user.profile,
      dryRun: env.DRY_RUN,
      permissions: {
        admin: user.role === 'ADMIN',
      },
    };
  });

  app.post('/api/auth/password', async (request) => {
    const auth = requireAuth(request);
    const input = z
      .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
      .parse(request.body);
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user) throw new HttpError(401, 'Authentication required');
    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) throw new HttpError(400, 'Current password is incorrect');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 12) },
    });
    await prisma.session.deleteMany({ where: { userId: user.id, id: { not: auth.sessionId } } });
    await audit({ userId: user.id, action: 'auth.password_changed', entityType: 'user', entityId: user.id, metadata: jsonValue({}) });
    return { ok: true };
  });
}
