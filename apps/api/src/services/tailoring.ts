import type { CandidateProfile, Job, Resume, TailoredResume } from '@vulcaestus/db';
import { prisma } from '@vulcaestus/db';
import {
  tailoredResumeSchema,
  type StructuredResume,
  type TailoredResumeResult,
} from '@vulcaestus/types';
import { runAiJson, runAiText } from './ai.js';
import { atsVersion, masterResumeMarkdown, structuredOf } from './resume-render.js';
import { canonicalSkill } from './jobs/normalize.js';
import { jsonValue } from '../lib/http.js';

interface AllowedEvidence {
  companies: Set<string>;
  roles: Set<string>;
  skills: Set<string>;
  sourceText: string;
  structured: StructuredResume | null;
}

function allowedEvidence(profile: CandidateProfile, resume: Resume): AllowedEvidence {
  const structured = structuredOf(resume);
  const companies = new Set<string>();
  const roles = new Set<string>();
  const skills = new Set<string>(profile.technologies.map(canonicalSkill));
  for (const experience of structured?.experience ?? []) {
    if (experience.company) companies.add(experience.company.toLowerCase().trim());
    if (experience.role) roles.add(experience.role.toLowerCase().trim());
    for (const skill of experience.technologies ?? []) skills.add(canonicalSkill(skill));
  }
  for (const project of structured?.projects ?? []) {
    for (const skill of project.technologies ?? []) skills.add(canonicalSkill(skill));
  }
  for (const skill of structured?.skills ?? []) {
    if (typeof skill === 'string') skills.add(canonicalSkill(skill));
    else if (skill?.name) skills.add(canonicalSkill(skill.name));
  }
  return {
    companies,
    roles,
    skills,
    sourceText: `${resume.rawText}\n${JSON.stringify(structured ?? {})}`.toLowerCase(),
    structured,
  };
}

function numberTokens(value: string): string[] {
  return [...value.matchAll(/\b\d[\d.,]*%?\b/g)].map((match) => match[0].replace(/[.,]$/, ''));
}

function sanitizeTailored(
  profile: CandidateProfile,
  resume: Resume,
  candidate: TailoredResumeResult,
  job: Job,
): { data: TailoredResumeResult; warnings: string[] } {
  const evidence = allowedEvidence(profile, resume);
  const warnings: string[] = [];
  const source = evidence.structured;

  const experience = candidate.experience.filter((item) => {
    const company = item.company?.toLowerCase().trim() ?? '';
    const role = item.role?.toLowerCase().trim() ?? '';
    const companyOk = evidence.companies.size === 0 || evidence.companies.has(company);
    const roleOk = evidence.roles.size === 0 || evidence.roles.has(role);
    if (!companyOk || !roleOk) {
      warnings.push(`Removed an experience entry not found in the master resume: "${item.role} — ${item.company}".`);
      return false;
    }
    return true;
  });

  for (const item of experience) {
    for (const achievement of item.achievements) {
      const keptTechnologies = (achievement.technologies ?? []).filter((technology) =>
        evidence.skills.has(canonicalSkill(technology)),
      );
      if (keptTechnologies.length !== (achievement.technologies ?? []).length) {
        warnings.push('Removed technologies not evidenced in the master profile.');
        achievement.technologies = keptTechnologies;
      }
      const unsupportedMetrics = (achievement.metrics ?? []).filter((metric) =>
        numberTokens(metric).some((token) => !evidence.sourceText.includes(token.toLowerCase())),
      );
      if (unsupportedMetrics.length > 0) {
        warnings.push(`Removed an unsupported metric: ${unsupportedMetrics.join(', ')}.`);
        achievement.metrics = (achievement.metrics ?? []).filter(
          (metric) => !unsupportedMetrics.includes(metric),
        );
      }
    }
  }

  const skills = (candidate.skills ?? []).filter((skill) => evidence.skills.has(canonicalSkill(skill)));
  if (skills.length !== (candidate.skills ?? []).length) {
    warnings.push('Removed skills not evidenced in the master profile.');
  }

  const summaryNumbers = numberTokens(candidate.summary);
  const unsupportedSummaryNumbers = summaryNumbers.filter(
    (token) => !evidence.sourceText.includes(token.toLowerCase()),
  );
  let summary = candidate.summary;
  if (unsupportedSummaryNumbers.length > 0) {
    warnings.push('Replaced the generated summary because it contained unsupported numbers.');
    summary =
      source?.summary ||
      profile.summary ||
      `${profile.fullName} is targeting ${job.title} roles with evidenced experience in ${skills.slice(0, 6).join(', ') || profile.targetTitles.join(', ')}.`;
  }

  if (experience.length === 0 && (source?.experience.length ?? 0) > 0) {
    warnings.push('All generated experience entries were unsupported; restored the master experience section.');
    experience.push(...source!.experience);
  }

  return {
    data: {
      ...candidate,
      summary,
      experience,
      skills: skills.length > 0 ? skills : source?.skills.map((skill) => (typeof skill === 'string' ? skill : skill.name)) ?? [],
      education: source?.education ?? [],
      certifications: source?.certifications ?? [],
      languages: source?.languages ?? [],
      changeNotes: [...(candidate.changeNotes ?? []), ...warnings].slice(0, 40),
    },
    warnings,
  };
}

function fallbackTailored(
  profile: CandidateProfile,
  resume: Resume,
  job: Job,
): { data: TailoredResumeResult; warnings: string[] } {
  const source = structuredOf(resume);
  const required = new Set(job.requiredSkills.map(canonicalSkill));
  const candidateSkills =
    source?.skills.map((skill) => (typeof skill === 'string' ? skill : skill.name)) ?? [];
  const ordered = [...candidateSkills].sort((a, b) => {
    const left = required.has(canonicalSkill(a)) ? 0 : 1;
    const right = required.has(canonicalSkill(b)) ? 0 : 1;
    return left - right;
  });
  return {
    data: {
      summary:
        source?.summary ||
        profile.summary ||
        `${profile.fullName} is applying for the ${job.title} role at ${job.company}.`,
      experience: source?.experience ?? [],
      skills: ordered.length > 0 ? ordered : profile.technologies,
      education: source?.education ?? [],
      certifications: source?.certifications ?? [],
      languages: source?.languages ?? [],
      coverLetter: '',
      applicationSummary: `${profile.fullName} — ${profile.headline ?? profile.targetTitles[0] ?? 'Candidate'} applying for ${job.title} at ${job.company}.`,
      changeNotes: [
        'Deterministic fallback used because the AI was unavailable or returned invalid output.',
        'All content is preserved from the master resume; only skill ordering changed.',
      ],
    },
    warnings: ['AI tailoring unavailable. Deterministic version generated from master resume.'],
  };
}

export async function generateTailoredResume(
  profile: CandidateProfile,
  resume: Resume,
  job: Job,
): Promise<TailoredResume> {
  const ai = await runAiJson({
    kind: 'RESUME_TAILORING',
    promptName: 'resume-tailoring',
    entityType: 'job',
    entityId: job.id,
    inputRefs: { profileId: profile.id, resumeId: resume.id, jobId: job.id },
    schema: tailoredResumeSchema,
    variables: {
      candidate: {
        fullName: profile.fullName,
        headline: profile.headline,
        summary: profile.summary,
        location: profile.location,
        skills: profile.technologies,
        targetTitles: profile.targetTitles,
      },
      resume: {
        structured: structuredOf(resume),
        rawText: resume.rawText.slice(0, 12000),
      },
      job: {
        title: job.title,
        company: job.company,
        description: job.description.slice(0, 9000),
        requirements: job.requirements,
        requiredSkills: job.requiredSkills,
        preferredSkills: job.preferredSkills,
      },
    },
    system:
      'You edit resumes without inventing facts. Return only JSON. Every claim must exist in the supplied source material.',
  });

  const fallback = fallbackTailored(profile, resume, job);
  const sanitized = ai
    ? sanitizeTailored(profile, resume, tailoredResumeSchema.parse(ai.data), job)
    : fallback;
  const data = sanitized.data;

  const contentJson = {
    ...data,
    sourceResumeId: resume.id,
    jobId: job.id,
    warnings: [...(ai ? [] : ['AI unavailable; deterministic fallback used.']), ...sanitized.warnings],
  };
  const markdown = buildTailoredMarkdown(profile, data);

  return prisma.tailoredResume.create({
    data: {
      jobId: job.id,
      masterResumeId: resume.id,
      profileId: profile.id,
      contentMarkdown: markdown,
      contentJson: jsonValue(contentJson),
      atsMarkdown: atsVersion(markdown),
      diff: jsonValue({
        changeNotes: data.changeNotes,
        warnings: sanitized.warnings,
        blockedAdditions: sanitized.warnings.filter((warning) => /Removed/.test(warning)),
        sourceResumeId: resume.id,
      }),
      status: 'DRAFT',
      model: ai?.model ?? 'deterministic',
      promptVersion: ai?.promptVersion ?? 'deterministic',
    },
  });
}

function buildTailoredMarkdown(profile: CandidateProfile, data: TailoredResumeResult): string {
  const contact = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedinUrl,
    profile.githubUrl,
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = [`# ${profile.fullName}`];
  if (profile.headline) lines.push(`_${profile.headline}_`);
  lines.push(contact, '', '## Summary', data.summary, '', '## Experience');
  for (const item of data.experience) {
    lines.push(`### ${item.role} — ${item.company}`);
    const meta = [item.startDate, item.endDate, item.location].filter(Boolean).join(' · ');
    if (meta) lines.push(meta);
    if (item.summary) lines.push(item.summary);
    for (const achievement of item.achievements) {
      const technologies =
        achievement.technologies?.length > 0 ? ` (${achievement.technologies.join(', ')})` : '';
      lines.push(`- ${achievement.description}${technologies}`);
    }
    lines.push('');
  }
  if ((data.skills ?? []).length > 0) lines.push('## Skills', (data.skills ?? []).join(', '), '');
  if ((data.education ?? []).length > 0) {
    lines.push('## Education');
    for (const item of data.education ?? []) {
      lines.push(`- ${[item.degree, item.field, item.institution].filter(Boolean).join(', ')}`);
    }
    lines.push('');
  }
  if ((data.certifications ?? []).length > 0) {
    lines.push('## Certifications');
    for (const item of data.certifications ?? []) {
      lines.push(`- ${[item.name, item.issuer].filter(Boolean).join(', ')}`);
    }
    lines.push('');
  }
  if ((data.languages ?? []).length > 0) {
    lines.push('## Languages');
    for (const item of data.languages ?? []) {
      lines.push(`- ${[item.name, item.level].filter(Boolean).join(' — ')}`);
    }
  }
  return lines.join('\n');
}

export async function generateCoverLetter(
  profile: CandidateProfile,
  resume: Resume,
  job: Job,
  score?: { strongMatches: string[]; missingRequirements: string[] } | null,
): Promise<{ content: string; model: string; promptVersion: string }> {
  const ai = await runAiText({
    kind: 'COVER_LETTER',
    promptName: 'cover-letter',
    entityType: 'job',
    entityId: job.id,
    inputRefs: { profileId: profile.id, resumeId: resume.id, jobId: job.id },
    variables: {
      candidate: {
        fullName: profile.fullName,
        headline: profile.headline,
        location: profile.location,
        summary: profile.summary,
        targetTitles: profile.targetTitles,
        technologies: profile.technologies,
      },
      resume: masterResumeMarkdown(profile, resume).slice(0, 9000),
      job: {
        title: job.title,
        company: job.company,
        description: job.description.slice(0, 7000),
        requirements: job.requirements,
      },
      matches: score ?? { strongMatches: [], missingRequirements: [] },
    },
  });

  if (ai) return { content: ai.text, model: ai.model, promptVersion: ai.promptVersion };

  const structured = structuredOf(resume);
  const topAchievement = structured?.experience
    .flatMap((experience) => experience.achievements.map((achievement) => achievement.description))
    .find(Boolean);
  const content = [
    `Dear Hiring Team at ${job.company},`,
    '',
    `I am applying for the ${job.title} role. ${profile.summary ?? structured?.summary ?? profile.headline ?? ''}`.trim(),
    topAchievement ? `In a previous role, I ${topAchievement.replace(/^[A-Z]/, (c) => c.toLowerCase())}` : '',
    `My background includes ${profile.technologies.slice(0, 5).join(', ') || 'the skills listed in my resume'}. I would welcome the opportunity to discuss how this experience fits the role.`,
    '',
    'Thank you for your time and consideration.',
    '',
    profile.fullName,
  ]
    .filter((line) => line !== '')
    .join('\n\n');

  return { content, model: 'deterministic', promptVersion: 'deterministic' };
}
