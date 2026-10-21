import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vulcaestus/db';
import { structuredResumeSchema } from '@vulcaestus/types';
import { requireProfile } from '../auth.js';
import { HttpError, audit, jsonValue } from '../lib/http.js';
import { extractResumeText } from '../services/resume-file.js';
import { heuristicResumeStructure } from '../services/resume-parse.js';
import { runAiJson } from '../services/ai.js';

export async function resumeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/resumes', async (request) => {
    const auth = requireProfile(request);
    const resumes = await prisma.resume.findMany({
      where: { profileId: auth.profile.id, deletedAt: null },
      orderBy: [{ isMaster: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        isMaster: true,
        originalFilename: true,
        mimeType: true,
        version: true,
        sourceFormat: true,
        structured: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { resumes };
  });

  app.get('/api/resumes/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const resume = await prisma.resume.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!resume) throw new HttpError(404, 'Resume not found');
    return { resume };
  });

  app.post('/api/resumes', async (request, reply) => {
    const auth = requireProfile(request);
    const file = await request.file();
    if (!file) throw new HttpError(400, 'No resume file uploaded');
    if (file.file.truncated) throw new HttpError(413, 'Resume file is too large (max 10 MB)');
    const buffer = await file.toBuffer();
    const extracted = await extractResumeText(buffer, file.mimetype, file.filename);
    if (extracted.text.length < 50) {
      throw new HttpError(400, 'Could not extract enough text from this resume. Try a text-based PDF or DOCX.');
    }
    const isMaster = (request.query as Record<string, string>).master === 'true';
    const structured = heuristicResumeStructure(extracted.text);

    const resume = await prisma.$transaction(async (tx) => {
      if (isMaster) {
        await tx.resume.updateMany({
          where: { profileId: auth.profile.id, isMaster: true },
          data: { isMaster: false },
        });
      }
      return tx.resume.create({
        data: {
          profileId: auth.profile.id,
          name: file.filename.replace(/\.[^.]+$/, '') || 'Resume',
          isMaster,
          originalFilename: file.filename,
          mimeType: file.mimetype,
          rawText: extracted.text,
          structured: jsonValue(structured),
          sourceFormat: extracted.format,
        },
      });
    });

    await audit({
      userId: auth.user.id,
      action: 'resume.uploaded',
      entityType: 'resume',
      entityId: resume.id,
      metadata: { filename: file.filename, format: extracted.format, isMaster, characters: extracted.text.length },
      ip: request.ip,
    });

    return reply.code(201).send({
      resume,
      note: 'Structured with deterministic extraction. Run "Improve structure with AI" for a richer parse.',
    });
  });

  app.post('/api/resumes/:id/structure', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const resume = await prisma.resume.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!resume) throw new HttpError(404, 'Resume not found');

    const ai = await runAiJson({
      kind: 'RESUME_STRUCTURE',
      promptName: 'resume-structure',
      entityType: 'resume',
      entityId: resume.id,
      inputRefs: { profileId: auth.profile.id, resumeId: resume.id },
      schema: structuredResumeSchema,
      variables: { rawText: resume.rawText.slice(0, 20000) },
      system: 'You extract resume facts. Never add information that is not in the source text. Return only JSON.',
    });

    if (!ai) {
      return {
        resume,
        warning: 'AI structuring was unavailable. Deterministic extraction was kept.',
      };
    }
    const updated = await prisma.resume.update({
      where: { id: resume.id },
      data: { structured: jsonValue(ai.data) },
    });
    await audit({
      userId: auth.user.id,
      action: 'resume.structured_with_ai',
      entityType: 'resume',
      entityId: resume.id,
      metadata: { model: ai.model, promptVersion: ai.promptVersion },
      ip: request.ip,
    });
    return { resume: updated, model: ai.model };
  });

  app.patch('/api/resumes/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = z
      .object({
        name: z.string().min(1).max(200).optional(),
        isMaster: z.boolean().optional(),
        structured: structuredResumeSchema.optional(),
        rawText: z.string().min(1).max(200_000).optional(),
      })
      .parse(request.body);

    const existing = await prisma.resume.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!existing) throw new HttpError(404, 'Resume not found');

    const resume = await prisma.$transaction(async (tx) => {
      if (input.isMaster) {
        await tx.resume.updateMany({
          where: { profileId: auth.profile.id, isMaster: true, id: { not: id } },
          data: { isMaster: false },
        });
      }
      return tx.resume.update({
        where: { id },
        data: {
          name: input.name,
          isMaster: input.isMaster,
          structured: input.structured ? jsonValue(input.structured) : undefined,
          rawText: input.rawText,
          version: input.structured || input.rawText ? { increment: 1 } : undefined,
        },
      });
    });
    await audit({
      userId: auth.user.id,
      action: 'resume.updated',
      entityType: 'resume',
      entityId: resume.id,
      metadata: { fields: Object.keys(input) },
      ip: request.ip,
    });
    return { resume };
  });

  app.delete('/api/resumes/:id', async (request) => {
    const auth = requireProfile(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const resume = await prisma.resume.findFirst({
      where: { id, profileId: auth.profile.id, deletedAt: null },
    });
    if (!resume) throw new HttpError(404, 'Resume not found');
    await prisma.resume.update({
      where: { id },
      data: { deletedAt: new Date(), isMaster: false },
    });
    await audit({
      userId: auth.user.id,
      action: 'resume.deleted',
      entityType: 'resume',
      entityId: id,
      ip: request.ip,
    });
    return { ok: true };
  });
}
