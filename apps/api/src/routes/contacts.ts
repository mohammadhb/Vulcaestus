import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@vulcaestus/db';
import { contactInputSchema } from '@vulcaestus/types';
import { requireProfile } from '../auth.js';
import { HttpError, asString, audit, getPagination } from '../lib/http.js';
import { parseContactsCsv, rankContactsForJob } from '../services/referrals.js';

function cleanUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (!value || value.trim() === '') return null;
  return value.trim();
}

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/contacts', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const { page, pageSize, skip, take } = getPagination(query);
    const search = asString(query.q);
    const company = asString(query.company);
    const category = asString(query.category);
    const where: Prisma.ContactWhereInput = {
      profileId: auth.profile.id,
      deletedAt: null,
      ...(company ? { company: { contains: company, mode: 'insensitive' } } : {}),
      ...(category ? { category: category as 'RECRUITER' } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        include: { job: { select: { id: true, title: true, company: true } } },
        orderBy: [{ relevanceScore: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
    ]);
    return { contacts, total, page, pageSize };
  });

  app.post('/api/contacts', async (request, reply) => {
    const auth = requireProfile(request);
    const input = contactInputSchema.parse(request.body);
    const linkedinUrl = cleanUrl(input.linkedinUrl);
    const email = cleanUrl(input.email);
    const contact = await prisma.contact.create({
      data: {
        profileId: auth.profile.id,
        company: input.company,
        name: input.name,
        title: input.title,
        linkedinUrl,
        email,
        category: input.category,
        relationship: input.relationship,
        reason: input.reason,
        verified: input.verified,
        source: input.source,
        notes: input.notes,
        jobId: input.jobId,
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'contact.created',
      entityType: 'contact',
      entityId: contact.id,
      metadata: { company: contact.company },
      ip: request.ip,
    });
    return reply.code(201).send({ contact });
  });

  app.patch('/api/contacts/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = contactInputSchema.partial().parse(request.body);
    const existing = await prisma.contact.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!existing) throw new HttpError(404, 'Contact not found');
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...input,
        linkedinUrl: cleanUrl(input.linkedinUrl),
        email: cleanUrl(input.email),
      },
    });
    await audit({
      userId: auth.user.id,
      action: 'contact.updated',
      entityType: 'contact',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { contact };
  });

  app.delete('/api/contacts/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const existing = await prisma.contact.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!existing) throw new HttpError(404, 'Contact not found');
    await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit({
      userId: auth.user.id,
      action: 'contact.deleted',
      entityType: 'contact',
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.post('/api/contacts/import', async (request) => {
    const auth = requireProfile(request);
    const input = z.object({ csv: z.string().min(10).max(500_000) }).parse(request.body);
    const rows = parseContactsCsv(input.csv);
    if (rows.length === 0) {
      throw new HttpError(400, 'No contacts found. CSV needs at least name and company columns.');
    }
    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const category = row.category?.toUpperCase().replace(/\s+/g, '_');
      try {
        await prisma.contact.create({
          data: {
            profileId: auth.profile.id,
            name: row.name,
            company: row.company,
            title: row.title,
            linkedinUrl: row.linkedinUrl || null,
            email: row.email || null,
            category: (category as 'OTHER') ?? 'OTHER',
            relationship: row.relationship,
            notes: row.notes,
            source: 'csv_import',
            verified: Boolean(row.relationship),
          },
        });
        created += 1;
      } catch {
        skipped += 1;
      }
    }
    await audit({
      userId: auth.user.id,
      action: 'contacts.imported',
      entityType: 'contact',
      metadata: { created, skipped },
      ip: request.ip,
    });
    return { created, skipped, total: rows.length };
  });

  app.post('/api/contacts/rank', async (request) => {
    const auth = requireProfile(request);
    const input = z.object({ jobId: z.string().uuid() }).parse(request.body);
    const job = await prisma.job.findFirst({
      where: { id: input.jobId, profileId: auth.profile.id, deletedAt: null },
    });
    if (!job) throw new HttpError(404, 'Job not found');
    const contacts = await rankContactsForJob(auth.profile.id, job);
    return { contacts };
  });
}
