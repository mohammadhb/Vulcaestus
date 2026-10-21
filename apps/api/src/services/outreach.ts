import { prisma, type Contact, type Job, type MessageType, type OutreachMessage, type CandidateProfile } from '@vulcaestus/db';
import {
  generatedMessageSchema,
  type GeneratedMessage,
  type StructuredResume,
} from '@vulcaestus/types';
import { env } from '../env.js';
import { HttpError } from '../lib/http.js';
import { checkLimit } from '../lib/limits.js';
import { runAiJson } from './ai.js';
import { getOrCreateApproval } from './approval-store.js';
import { collectCandidateSkills, profileToScoringProfile } from './jobs/score.js';

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function fallbackMessage(
  type: MessageType,
  profile: CandidateProfile,
  contact: Contact,
  job: Job | null,
): GeneratedMessage {
  const skills = profile.technologies.slice(0, 3).join(', ');
  const role = job?.title ?? 'roles';
  const company = job?.company ?? contact.company;
  const relationship =
    contact.verified && contact.relationship ? ` We connected previously as ${contact.relationship}.` : '';
  const greeting = `Hi ${firstName(contact.name)},`;

  if (type === 'CONNECTION_REQUEST') {
    return {
      body: `${greeting} I'm exploring ${role} opportunities at ${company}. My background includes ${skills || 'relevant engineering experience'}.${relationship} Would you be open to connecting?`,
      evidence: [profile.fullName, skills, relationship].filter(Boolean),
      warnings: contact.verified ? [] : ['Relationship is not verified. Do not imply a prior connection.'],
    };
  }

  if (type === 'REFERRAL_REQUEST') {
    return {
      body: `${greeting} I'm preparing an application for the ${role} role at ${company}. My experience covers ${skills || 'the core requirements'}.${relationship} If you are comfortable doing so, would you be open to referring me or pointing me to the right person? No pressure either way.`,
      evidence: [profile.fullName, skills, role].filter(Boolean),
      warnings: contact.verified ? [] : ['Relationship is not verified. The message deliberately avoids claiming one.'],
    };
  }

  if (type === 'RECRUITER_OUTREACH' || type === 'HIRING_MANAGER_OUTREACH') {
    return {
      body: `${greeting} I'm interested in the ${role} role at ${company}. My background includes ${skills || 'relevant experience'}, and I'd be glad to share more if the role is still active.${relationship}`,
      evidence: [role, company, skills].filter(Boolean),
      warnings: contact.verified ? [] : ['Relationship is not verified.'],
    };
  }

  if (type === 'THANK_YOU' || type === 'POST_INTERVIEW_FOLLOW_UP') {
    return {
      body: `${greeting} Thank you for taking the time to speak with me about the ${role} role. I appreciated learning more about the team and remain interested in the opportunity.`,
      evidence: [role, company].filter(Boolean),
      warnings: [],
    };
  }

  return {
    body: `${greeting} I wanted to follow up on my application for the ${role} role at ${company}. I remain interested and would be happy to provide any additional information.${relationship}`,
    evidence: [role, company].filter(Boolean),
    warnings: contact.verified ? [] : ['Relationship is not verified.'],
  };
}

function evidencePayload(profile: CandidateProfile, contact: Contact, job: Job | null, resume?: StructuredResume | null) {
  return {
    candidate: {
      fullName: profile.fullName,
      headline: profile.headline,
      summary: profile.summary,
      location: profile.location,
      technologies: profile.technologies,
      targetTitles: profile.targetTitles,
      linkedinUrl: profile.linkedinUrl,
      githubUrl: profile.githubUrl,
    },
    contact: {
      name: contact.name,
      title: contact.title,
      company: contact.company,
      category: contact.category,
      relationship: contact.relationship,
      verifiedRelationship: contact.verified,
      notes: contact.notes,
    },
    job: job
      ? {
          title: job.title,
          company: job.company,
          location: job.location,
          requiredSkills: job.requiredSkills,
          description: job.description.slice(0, 4000),
        }
      : null,
    resumeHighlights: resume?.experience
      .flatMap((experience) => experience.achievements.map((achievement) => achievement.description))
      .slice(0, 5) ?? [],
  };
}

export async function generateOutreach(input: {
  profile: CandidateProfile;
  contact: Contact;
  job: Job | null;
  applicationId?: string | null;
  type: MessageType;
  tone?: string;
}): Promise<OutreachMessage> {
  const limit = await checkLimit(input.profile.id, 'messagesSent', input.profile.dailyOutreachLimit);
  if (!limit.allowed) {
    throw new HttpError(429, `Daily outreach limit reached (${limit.used}/${limit.limit}).`);
  }

  const resume = await prisma.resume.findFirst({
    where: { profileId: input.profile.id, isMaster: true, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  const structured = (resume?.structured ?? null) as StructuredResume | null;
  const evidence = evidencePayload(input.profile, input.contact, input.job, structured);

  const ai = await runAiJson({
    kind: 'LINKEDIN_MESSAGE',
    promptName: 'linkedin-message',
    entityType: 'contact',
    entityId: input.contact.id,
    inputRefs: {
      profileId: input.profile.id,
      contactId: input.contact.id,
      jobId: input.job?.id,
      type: input.type,
    },
    schema: generatedMessageSchema,
    variables: {
      messageType: input.type,
      candidate: evidence.candidate,
      contact: evidence.contact,
      job: evidence.job,
      evidence: evidence.resumeHighlights,
      tone: input.tone ?? 'direct, friendly, professional',
    },
    system:
      'You write brief, honest outreach. Never invent relationships, shared history, or facts. Return only JSON.',
  });

  const fallback = fallbackMessage(input.type, input.profile, input.contact, input.job);
  const content = ai?.data ?? fallback;
  const maxLength = input.type === 'CONNECTION_REQUEST' ? 300 : 1400;
  const body = content.body.slice(0, maxLength);
  const warnings = [...(content.warnings ?? [])];
  if (input.contact.verified === false) {
    warnings.push('Contact relationship is not verified.');
  }

  const message = await prisma.outreachMessage.create({
    data: {
      profileId: input.profile.id,
      contactId: input.contact.id,
      jobId: input.job?.id ?? null,
      applicationId: input.applicationId ?? null,
      type: input.type,
      subject: content.subject,
      body,
      status: 'PENDING_APPROVAL',
      model: ai?.model ?? 'deterministic',
      promptVersion: ai?.promptVersion ?? 'deterministic',
      evidence: {
        evidence: content.evidence ?? [],
        warnings,
        contact: {
          name: input.contact.name,
          title: input.contact.title,
          company: input.contact.company,
          relationship: input.contact.relationship,
          verified: input.contact.verified,
          linkedinUrl: input.contact.linkedinUrl,
        },
        job: input.job ? { id: input.job.id, title: input.job.title, company: input.job.company } : null,
        generatedBy: ai ? 'ai' : 'deterministic',
      },
      dryRun: env.DRY_RUN,
    },
  });

  const approvalType = input.type === 'REFERRAL_REQUEST' ? 'REFERRAL_REQUEST' : 'LINKEDIN_MESSAGE';
  await getOrCreateApproval({
    profileId: input.profile.id,
    type: approvalType,
    entityType: 'outreach',
    entityId: message.id,
    title:
      input.type === 'REFERRAL_REQUEST'
        ? `Referral request to ${input.contact.name}`
        : `${input.type.replace(/_/g, ' ').toLowerCase()} to ${input.contact.name}`,
    content: body,
    metadata: {
      contactId: input.contact.id,
      contactName: input.contact.name,
      contactTitle: input.contact.title,
      company: input.contact.company,
      relationship: input.contact.relationship,
      relationshipVerified: input.contact.verified,
      jobId: input.job?.id,
      jobTitle: input.job?.title,
      messageType: input.type,
      evidence: content.evidence ?? [],
      warnings,
      linkedinUrl: input.contact.linkedinUrl,
    },
    priority: input.type === 'REFERRAL_REQUEST' ? 75 : 60,
    expiresInHours: 24 * 14,
  });

  return message;
}

export async function regenerateOutreach(input: {
  outreachId: string;
  profileId: string;
}): Promise<OutreachMessage> {
  const outreach = await prisma.outreachMessage.findFirst({
    where: { id: input.outreachId, profileId: input.profileId },
    include: { contact: true, job: true, profile: true },
  });
  if (!outreach) throw new HttpError(404, 'Outreach message not found');
  if (['SENT', 'CANCELLED'].includes(outreach.status)) {
    throw new HttpError(409, 'Sent or cancelled messages cannot be regenerated');
  }
  const profile = outreach.profile;
  const resume = await prisma.resume.findFirst({
    where: { profileId: profile.id, isMaster: true, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
  });
  const structured = (resume?.structured ?? null) as StructuredResume | null;
  const evidence = evidencePayload(profile, outreach.contact, outreach.job, structured);

  const ai = await runAiJson({
    kind: 'LINKEDIN_MESSAGE',
    promptName: 'linkedin-message',
    entityType: 'contact',
    entityId: outreach.contact.id,
    inputRefs: { outreachId: outreach.id, profileId: profile.id, regenerated: true },
    schema: generatedMessageSchema,
    variables: {
      messageType: outreach.type,
      candidate: evidence.candidate,
      contact: evidence.contact,
      job: evidence.job,
      evidence: evidence.resumeHighlights,
      tone: 'direct, friendly, professional; take a slightly different angle from the previous draft',
    },
  });

  const fallback = fallbackMessage(outreach.type, profile, outreach.contact, outreach.job);
  const content = ai?.data ?? fallback;
  const body = content.body.slice(0, outreach.type === 'CONNECTION_REQUEST' ? 300 : 1400);
  const updated = await prisma.outreachMessage.update({
    where: { id: outreach.id },
    data: {
      body,
      subject: content.subject ?? outreach.subject,
      model: ai?.model ?? 'deterministic',
      promptVersion: ai?.promptVersion ?? 'deterministic',
      evidence: {
        evidence: content.evidence ?? [],
        warnings: content.warnings ?? [],
        regeneratedAt: new Date().toISOString(),
      },
    },
  });
  await prisma.approvalRequest.updateMany({
    where: {
      entityId: outreach.id,
      status: 'PENDING',
      type: { in: ['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST'] },
    },
    data: { content: body },
  });
  return updated;
}

export function defaultMessageType(contact: Contact, hasJob: boolean): MessageType {
  if (contact.category === 'RECRUITER') return 'RECRUITER_OUTREACH';
  if (contact.category === 'HIRING_MANAGER' || contact.category === 'ENGINEERING_MANAGER') {
    return 'HIRING_MANAGER_OUTREACH';
  }
  if (hasJob && contact.verified) return 'REFERRAL_REQUEST';
  return hasJob ? 'REFERRAL_REQUEST' : 'CONNECTION_REQUEST';
}

export function outreachEvidenceSummary(message: OutreachMessage): Record<string, unknown> {
  return (message.evidence as Record<string, unknown>) ?? {};
}

export { collectCandidateSkills, profileToScoringProfile };
