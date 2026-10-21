import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@vulcaestus/db';
import { createDefaultProfile, requireAdmin, toAuthUser } from '../auth.js';
import { HttpError, audit } from '../lib/http.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  fullName: z.string().min(1).max(200),
  password: z.string().min(10).max(200),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
});

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', async (request) => {
    requireAdmin(request);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        disabled: true,
        createdAt: true,
        lastLoginAt: true,
        profile: { select: { id: true, fullName: true } },
      },
    });
    return { users };
  });

  app.post('/api/users', async (request, reply) => {
    const auth = requireAdmin(request);
    const input = createUserSchema.parse(request.body);
    const email = input.email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new HttpError(409, 'A user with that email already exists');
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name,
        role: input.role,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
    });
    await createDefaultProfile(user.id, input.fullName, email);
    await audit({
      userId: auth.user.id,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { email, role: input.role },
      ip: request.ip,
    });
    return reply.code(201).send({ user: toAuthUser(user) });
  });

  app.patch('/api/users/:id', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new HttpError(404, 'User not found');
    if (id === auth.user.id && input.disabled === true) {
      throw new HttpError(400, 'You cannot disable your own account');
    }
    if (id === auth.user.id && input.role === 'USER') {
      throw new HttpError(400, 'You cannot demote your own account');
    }
    const user = await prisma.user.update({
      where: { id },
      data: {
        name: input.name,
        role: input.role,
        disabled: input.disabled,
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
      },
    });
    if (input.disabled || input.password) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }
    await audit({
      userId: auth.user.id,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { user: toAuthUser(user) };
  });

  app.delete('/api/users/:id', async (request) => {
    const auth = requireAdmin(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (id === auth.user.id) throw new HttpError(400, 'You cannot delete your own account');
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, 'User not found');
    await prisma.user.delete({ where: { id } });
    await audit({
      userId: auth.user.id,
      action: 'user.deleted',
      entityType: 'user',
      entityId: id,
      metadata: { email: user.email },
      ip: request.ip,
    });
    return { ok: true };
  });
}
