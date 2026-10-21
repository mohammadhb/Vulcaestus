import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { prisma } from '@vulcaestus/db';
import { requireProfile } from '../auth.js';
import { HttpError, audit } from '../lib/http.js';
import { storagePath } from '../lib/storage.js';
import { masterResumeMarkdown, tailoredResumeMarkdown } from '../services/resume-render.js';
import { markdownToDocx, markdownToPdf, coverLetterToMarkdown } from '../services/documents.js';

type Format = 'md' | 'pdf' | 'docx';

function parseFormat(value: unknown): Format {
  return value === 'docx' || value === 'md' ? value : 'pdf';
}

function filename(value: string, format: Format): string {
  const base = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'document';
  return `${base}.${format === 'md' ? 'md' : format}`;
}

async function sendMarkdown(
  reply: import('fastify').FastifyReply,
  markdown: string,
  name: string,
  format: Format,
): Promise<void> {
  if (format === 'md') {
    reply
      .header('content-type', 'text/markdown; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename(name, format)}"`)
      .send(markdown);
    return;
  }
  if (format === 'docx') {
    const buffer = await markdownToDocx(markdown);
    reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('content-disposition', `attachment; filename="${filename(name, format)}"`)
      .send(buffer);
    return;
  }
  const buffer = await markdownToPdf(markdown);
  reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `attachment; filename="${filename(name, format)}"`)
    .send(buffer);
}

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/documents/resume/:id', async (request, reply) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const format = parseFormat((request.query as Record<string, unknown>).format);
    const resume = await prisma.resume.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!resume) throw new HttpError(404, 'Resume not found');
    const markdown = masterResumeMarkdown(auth.profile, resume);
    await sendMarkdown(reply, markdown, `${auth.profile.fullName}-resume`, format);
  });

  app.get('/api/tailored-resumes/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const tailored = await prisma.tailoredResume.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { job: { select: { id: true, title: true, company: true } } },
    });
    if (!tailored) throw new HttpError(404, 'Tailored resume not found');
    return { tailoredResume: tailored };
  });

  app.get('/api/documents/tailored/:id', async (request, reply) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const format = parseFormat((request.query as Record<string, unknown>).format);
    const tailored = await prisma.tailoredResume.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { job: true },
    });
    if (!tailored) throw new HttpError(404, 'Tailored resume not found');
    const markdown = tailored.contentMarkdown || tailoredResumeMarkdown(auth.profile, tailored);
    await sendMarkdown(
      reply,
      markdown,
      `${auth.profile.fullName}-${tailored.job.company}-resume`,
      format,
    );
  });

  app.patch('/api/tailored-resumes/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        contentMarkdown: z.string().min(20).max(100_000).optional(),
        status: z.enum(['DRAFT', 'APPROVED', 'REJECTED']).optional(),
      })
      .parse(request.body);
    const existing = await prisma.tailoredResume.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!existing) throw new HttpError(404, 'Tailored resume not found');
    const tailored = await prisma.tailoredResume.update({
      where: { id },
      data: {
        contentMarkdown: input.contentMarkdown,
        atsMarkdown: input.contentMarkdown
          ? input.contentMarkdown.replace(/[_*`]/g, '').replace(/^#{1,3} /gm, '')
          : undefined,
        status: input.status,
      },
    });
    await audit({
      userId: auth.user.id,
      action: input.status === 'APPROVED' ? 'resume.approved' : 'resume.edited',
      entityType: 'tailoredResume',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { tailoredResume: tailored };
  });

  app.get('/api/cover-letters/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const coverLetter = await prisma.coverLetter.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { job: { select: { id: true, title: true, company: true } } },
    });
    if (!coverLetter) throw new HttpError(404, 'Cover letter not found');
    return { coverLetter };
  });

  app.get('/api/documents/cover-letter/:id', async (request, reply) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const format = parseFormat((request.query as Record<string, unknown>).format);
    const coverLetter = await prisma.coverLetter.findFirst({
      where: { id, profileId: auth.profile.id },
      include: { job: true },
    });
    if (!coverLetter) throw new HttpError(404, 'Cover letter not found');
    await sendMarkdown(
      reply,
      coverLetterToMarkdown(coverLetter.content),
      `${auth.profile.fullName}-${coverLetter.job.company}-cover-letter`,
      format,
    );
  });

  app.patch('/api/cover-letters/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        content: z.string().min(20).max(50_000).optional(),
        status: z.enum(['DRAFT', 'APPROVED', 'REJECTED']).optional(),
      })
      .parse(request.body);
    const existing = await prisma.coverLetter.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!existing) throw new HttpError(404, 'Cover letter not found');
    const coverLetter = await prisma.coverLetter.update({ where: { id }, data: input });
    await audit({
      userId: auth.user.id,
      action: input.status === 'APPROVED' ? 'cover_letter.approved' : 'cover_letter.edited',
      entityType: 'coverLetter',
      entityId: id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { coverLetter };
  });

  app.get('/api/browser-actions', async (request) => {
    const auth = requireProfile(request);
    const query = request.query as Record<string, unknown>;
    const applicationId = typeof query.applicationId === 'string' ? query.applicationId : undefined;
    const actions = await prisma.browserAction.findMany({
      where: {
        profileId: auth.profile.id,
        ...(applicationId ? { applicationId } : {}),
      },
      include: { job: { select: { title: true, company: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { browserActions: actions };
  });

  app.get('/api/browser-actions/:id/screenshot/:index', async (request, reply) => {
    const auth = requireProfile(request);
    const { id, index } = z
      .object({ id: z.string().uuid(), index: z.coerce.number().int().min(0) })
      .parse(request.params);
    const action = await prisma.browserAction.findFirst({
      where: { id, profileId: auth.profile.id },
    });
    if (!action) throw new HttpError(404, 'Browser action not found');
    const screenshot = action.screenshots[index];
    if (!screenshot) throw new HttpError(404, 'Screenshot not found');
    try {
      const buffer = await readFile(storagePath(screenshot.replace(/^\/?data\//, '')));
      reply.header('content-type', 'image/png').send(buffer);
    } catch {
      throw new HttpError(404, 'Screenshot file is missing');
    }
  });
}
