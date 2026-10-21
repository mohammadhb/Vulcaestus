import type { StructuredResume } from '@vulcaestus/types';

const SECTION_ALIASES: Record<string, keyof SectionMap> = {
  summary: 'summary',
  profile: 'summary',
  'professional summary': 'summary',
  objective: 'summary',
  experience: 'experience',
  'work experience': 'experience',
  employment: 'experience',
  'professional experience': 'experience',
  skills: 'skills',
  'technical skills': 'skills',
  technologies: 'skills',
  education: 'education',
  certifications: 'certifications',
  certificates: 'certifications',
  projects: 'projects',
  languages: 'languages',
  achievements: 'achievements',
  'key achievements': 'achievements',
};

interface SectionMap {
  summary: string[];
  experience: string[];
  skills: string[];
  education: string[];
  certifications: string[];
  projects: string[];
  languages: string[];
  achievements: string[];
}

function emptySections(): SectionMap {
  return {
    summary: [],
    experience: [],
    skills: [],
    education: [],
    certifications: [],
    projects: [],
    languages: [],
    achievements: [],
  };
}

function normalizeHeading(line: string): string {
  return line
    .toLowerCase()
    .replace(/[:•\-–—]+$/g, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBullet(line: string): boolean {
  return /^\s*[-*•·–—]\s+/.test(line);
}

function cleanBullet(line: string): string {
  return line.replace(/^\s*[-*•·–—]\s+/, '').trim();
}

function splitList(value: string): string[] {
  return value
    .split(/[,;|•·\n]/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter((item) => item.length > 1 && item.length < 60);
}

const DATE_RANGE = /((?:19|20)\d{2}|present|current|now)/i;

/**
 * Deterministic, conservative resume extraction.
 * It only reorganises text that exists in the document. It never invents facts.
 */
export function heuristicResumeStructure(rawText: string): StructuredResume {
  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sections = emptySections();
  let current: keyof SectionMap = 'summary';
  let summaryHeadingSeen = false;
  const summaryLines: string[] = [];

  for (const line of lines) {
    const heading = normalizeHeading(line);
    const mapped = SECTION_ALIASES[heading];
    const looksLikeHeading = line.length <= 60 && !isBullet(line) && mapped !== undefined;
    if (looksLikeHeading && mapped) {
      current = mapped;
      if (mapped === 'summary') {
        summaryHeadingSeen = true;
        summaryLines.length = 0;
      }
      continue;
    }
    if (current === 'summary') {
      if (!summaryHeadingSeen && /@|https?:\/\/|linkedin\.com|github\.com|\+?\d[\d ()-]{7,}/i.test(line)) {
        continue;
      }
      summaryLines.push(line);
    } else sections[current].push(line.replace(/^#{1,6}\s*/, '').trim());
  }

  const skills = splitList(sections.skills.join('\n'));

  const experience: StructuredResume['experience'] = [];
  let currentExperience: StructuredResume['experience'][number] | null = null;
  const bareDateRange = /^((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current|now)$/i;
  for (const line of sections.experience) {
    if (isBullet(line)) {
      const description = cleanBullet(line);
      if (!currentExperience) {
        currentExperience = {
          company: '',
          role: '',
          achievements: [],
          technologies: [],
        };
        experience.push(currentExperience);
      }
      currentExperience.achievements.push({ description, technologies: [], metrics: [] });
      continue;
    }

    const bareDates = line.match(bareDateRange);
    if (bareDates) {
      if (!currentExperience) {
        currentExperience = { company: '', role: '', achievements: [], technologies: [] };
        experience.push(currentExperience);
      }
      currentExperience.startDate = bareDates[1];
      currentExperience.endDate = bareDates[2];
      continue;
    }

    if (DATE_RANGE.test(line) && line.length < 160) {
      const directDate = line.match(/((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|current|now)/i);
      const header = directDate ? line.replace(directDate[0], '').replace(/[|,]+$/, '').trim() : line;
      currentExperience = {
        company: '',
        role: header,
        achievements: [],
        technologies: [],
        ...(directDate ? { startDate: directDate[1], endDate: directDate[2] } : {}),
      };
      const separators = [' — ', ' – ', ' | ', ' at ', ' - '];
      const found = separators.find((separator) => header.includes(separator));
      if (found) {
        const [left, right] = header.split(found, 2);
        currentExperience.role = (left ?? '').trim();
        currentExperience.company = (right ?? '').replace(/[|,]+$/, '').trim();
      }
      experience.push(currentExperience);
      continue;
    }

    const separators = [' — ', ' – ', ' | ', ' at ', ' - '];
    const separator = separators.find((item) => line.includes(item));
    if (separator) {
      const needsNewEntry =
        !currentExperience ||
        currentExperience.achievements.length > 0 ||
        Boolean(currentExperience.startDate);
      if (needsNewEntry) {
        currentExperience = { company: '', role: '', achievements: [], technologies: [] };
        experience.push(currentExperience);
      }
      const [left, right] = line.split(separator, 2);
      currentExperience!.role = (left ?? '').trim();
      currentExperience!.company = (right ?? '').replace(/[|,]+$/, '').trim();
      continue;
    }

    if (line.length < 100 && !line.includes('.') && currentExperience && !currentExperience.company) {
      currentExperience.company = line;
      continue;
    }
    if (currentExperience) {
      currentExperience.achievements.push({ description: line, technologies: [], metrics: [] });
    }
  }

  const education = sections.education
    .filter((line) => !isBullet(line))
    .map((line) => ({ institution: line }));
  const certifications = sections.certifications
    .map((line) => cleanBullet(line))
    .filter(Boolean)
    .map((name) => ({ name }));
  const languages = splitList(sections.languages.join(', ')).map((name) => ({ name }));
  const achievements = sections.achievements
    .map((line) => cleanBullet(line))
    .filter(Boolean)
    .map((description) => ({ description, technologies: [], metrics: [] }));

  return {
    summary: summaryLines.slice(0, 4).join(' ').slice(0, 1200),
    experience: experience.filter((item) => item.company || item.role),
    skills: skills.map((name) => ({ name })),
    projects: [],
    education,
    certifications,
    languages,
    achievements,
  };
}
