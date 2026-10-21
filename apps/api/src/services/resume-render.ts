import type { CandidateProfile, Resume, TailoredResume } from '@vulcaestus/db';
import type { StructuredResume } from '@vulcaestus/types';

export function structuredOf(resume: Resume | null | undefined): StructuredResume | null {
  if (!resume?.structured) return null;
  const structured = resume.structured as StructuredResume;
  if (!structured || typeof structured !== 'object') return null;
  return structured;
}

function contactLine(profile: CandidateProfile): string {
  return [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedinUrl,
    profile.githubUrl,
    profile.portfolioUrl,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function masterResumeMarkdown(profile: CandidateProfile, resume: Resume): string {
  const structured = structuredOf(resume);
  if (!structured) {
    return `# ${profile.fullName}\n\n${contactLine(profile)}\n\n${resume.rawText}`;
  }
  const lines: string[] = [`# ${profile.fullName}`];
  if (structured.headline || profile.headline) lines.push(`_${structured.headline ?? profile.headline}_`);
  lines.push(contactLine(profile), '');
  if (structured.summary || profile.summary) {
    lines.push('## Summary', structured.summary || profile.summary || '', '');
  }
  if (structured.experience.length > 0) {
    lines.push('## Experience');
    for (const job of structured.experience) {
      lines.push(`### ${job.role || 'Role'} — ${job.company || 'Company'}`);
      const dates = [job.startDate, job.endDate].filter(Boolean).join(' – ');
      const meta = [dates, job.location].filter(Boolean).join(' · ');
      if (meta) lines.push(meta);
      if (job.summary) lines.push(job.summary);
      for (const achievement of job.achievements ?? []) {
        const technologies =
          achievement.technologies?.length > 0 ? ` (${achievement.technologies.join(', ')})` : '';
        lines.push(`- ${achievement.description}${technologies}`);
      }
      lines.push('');
    }
  }
  const skills = structured.skills
    .map((skill) => (typeof skill === 'string' ? skill : skill.name))
    .filter(Boolean);
  if (skills.length > 0) lines.push('## Skills', skills.join(', '), '');
  if (structured.projects.length > 0) {
    lines.push('## Projects');
    for (const project of structured.projects) {
      lines.push(`### ${project.name}`);
      if (project.description) lines.push(project.description);
      if (project.technologies.length > 0) lines.push(project.technologies.join(', '));
      for (const achievement of project.achievements ?? []) lines.push(`- ${achievement.description}`);
      lines.push('');
    }
  }
  if (structured.education.length > 0) {
    lines.push('## Education');
    for (const item of structured.education) {
      lines.push(
        `- ${[item.degree, item.field, item.institution].filter(Boolean).join(', ')}${item.endDate ? ` (${item.endDate})` : ''}`,
      );
    }
    lines.push('');
  }
  if (structured.certifications.length > 0) {
    lines.push('## Certifications');
    for (const item of structured.certifications) {
      lines.push(`- ${[item.name, item.issuer, item.date].filter(Boolean).join(', ')}`);
    }
    lines.push('');
  }
  if (structured.languages.length > 0) {
    lines.push('## Languages');
    lines.push(structured.languages.map((item) => `${item.name}${item.level ? ` (${item.level})` : ''}`).join(', '), '');
  }
  return lines.join('\n');
}

export function tailoredResumeMarkdown(profile: CandidateProfile, tailored: TailoredResume): string {
  const data = (tailored.contentJson ?? {}) as Record<string, unknown>;
  const experience = Array.isArray(data.experience) ? data.experience : [];
  const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
  const lines = [`# ${profile.fullName}`];
  if (profile.headline) lines.push(`_${profile.headline}_`);
  lines.push(contactLine(profile), '');
  if (typeof data.summary === 'string' && data.summary) lines.push('## Summary', data.summary, '');
  if (experience.length > 0) {
    lines.push('## Experience');
    for (const item of experience as Array<Record<string, unknown>>) {
      lines.push(`### ${String(item.role ?? 'Role')} — ${String(item.company ?? 'Company')}`);
      const dates = [item.startDate, item.endDate].filter(Boolean).join(' – ');
      const meta = [dates, item.location].filter(Boolean).join(' · ');
      if (meta) lines.push(String(meta));
      if (item.summary) lines.push(String(item.summary));
      const achievements = Array.isArray(item.achievements) ? item.achievements : [];
      for (const achievement of achievements as Array<Record<string, unknown>>) {
        if (!achievement.description) continue;
        const technologies =
          Array.isArray(achievement.technologies) && achievement.technologies.length > 0
            ? ` (${achievement.technologies.join(', ')})`
            : '';
        lines.push(`- ${String(achievement.description)}${technologies}`);
      }
      lines.push('');
    }
  }
  if (skills.length > 0) lines.push('## Skills', skills.join(', '), '');
  const education = Array.isArray(data.education) ? data.education : [];
  if (education.length > 0) {
    lines.push('## Education');
    for (const item of education as Array<Record<string, unknown>>) {
      lines.push(`- ${[item.degree, item.field, item.institution].filter(Boolean).join(', ')}`);
    }
    lines.push('');
  }
  const certifications = Array.isArray(data.certifications) ? data.certifications : [];
  if (certifications.length > 0) {
    lines.push('## Certifications');
    for (const item of certifications as Array<Record<string, unknown>>) {
      lines.push(`- ${[item.name, item.issuer].filter(Boolean).join(', ')}`);
    }
    lines.push('');
  }
  const languages = Array.isArray(data.languages) ? data.languages : [];
  if (languages.length > 0) {
    lines.push('## Languages');
    for (const item of languages as Array<Record<string, unknown>>) {
      lines.push(`- ${String(item.name ?? item)}`);
    }
  }
  return lines.join('\n');
}

export function atsVersion(markdown: string): string {
  return markdown
    .replace(/[_*`]/g, '')
    .replace(/^### /gm, '')
    .replace(/^## /gm, '')
    .replace(/^# /gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
