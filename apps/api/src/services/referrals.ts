import { prisma, type Contact, type Job } from '@vulcaestus/db';
import { normalizeCompany } from '@vulcaestus/types';
import { z } from 'zod';
import { runAiJson } from './ai.js';

const CATEGORY_WEIGHT: Record<string, number> = {
  FORMER_COLLEAGUE: 95,
  HIRING_MANAGER: 92,
  ENGINEERING_MANAGER: 88,
  ALUMNI: 84,
  MUTUAL_CONNECTION: 80,
  TEAM_MEMBER: 78,
  RECRUITER: 74,
  SECOND_DEGREE: 62,
  OTHER: 50,
};

const rankingSchema = z.object({
  ranked: z.array(
    z.object({
      contactId: z.string(),
      relevanceScore: z.number().min(0).max(100),
      reason: z.string(),
    }),
  ),
  warnings: z.array(z.string()).default([]),
});

export async function rankContactsForJob(
  profileId: string,
  job: Job,
): Promise<Contact[]> {
  const contacts = await prisma.contact.findMany({
    where: { profileId, deletedAt: null },
  });
  const matching = contacts.filter(
    (contact) => normalizeCompany(contact.company) === normalizeCompany(job.company),
  );
  if (matching.length === 0) return [];

  const ai = await runAiJson({
    kind: 'REFERRAL_DISCOVERY',
    promptName: 'referral',
    entityType: 'job',
    entityId: job.id,
    inputRefs: { profileId, jobId: job.id, contactIds: matching.map((contact) => contact.id) },
    schema: rankingSchema,
    variables: {
      job: {
        title: job.title,
        company: job.company,
        location: job.location,
        requiredSkills: job.requiredSkills,
        description: job.description.slice(0, 3000),
      },
      contacts: matching.map((contact) => ({
        contactId: contact.id,
        name: contact.name,
        title: contact.title,
        category: contact.category,
        relationship: contact.relationship,
        verified: contact.verified,
        notes: contact.notes,
      })),
    },
  });

  const updated: Contact[] = [];
  for (const contact of matching) {
    const base = CATEGORY_WEIGHT[contact.category] ?? 50;
    const verifiedBonus = contact.verified ? 4 : 0;
    const jobSpecificBonus = contact.jobId === job.id ? 4 : 0;
    const titleBonus = /engineer|developer|recruit|talent|manager/i.test(contact.title ?? '') ? 3 : 0;
    const deterministicScore = Math.min(99, base + verifiedBonus + jobSpecificBonus + titleBonus);
    const aiRank = ai?.data.ranked.find((item) => item.contactId === contact.id);
    const relevanceScore = aiRank ? Math.round((aiRank.relevanceScore + deterministicScore) / 2) : deterministicScore;
    const reason =
      aiRank?.reason ??
      `${contact.category.replace(/_/g, ' ').toLowerCase()} at ${job.company}${
        contact.verified ? ' with a verified relationship' : ' (relationship not verified)'
      }.`;

    updated.push(
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          relevanceScore,
          reason,
          jobId: contact.jobId ?? job.id,
        },
      }),
    );
  }

  return updated.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

export function parseContactsCsv(csv: string): Array<{
  name: string;
  company: string;
  title?: string;
  linkedinUrl?: string;
  email?: string;
  category?: string;
  relationship?: string;
  notes?: string;
}> {
  const lines = csv.replace(/\r/g, '').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else current += char;
    }
    values.push(current.trim());
    return values;
  };
  const header = parseLine(lines[0]!).map((value) => value.toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).flatMap((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = values[index] ?? '';
    });
    const name = row.name ?? row.full_name ?? '';
    const company = row.company ?? '';
    if (!name || !company) return [];
    return [
      {
        name,
        company,
        title: row.title || undefined,
        linkedinUrl: row.linkedin_url || row.linkedin || undefined,
        email: row.email || undefined,
        category: row.category || undefined,
        relationship: row.relationship || undefined,
        notes: row.notes || undefined,
      },
    ];
  });
}
