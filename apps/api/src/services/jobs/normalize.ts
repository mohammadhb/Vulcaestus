import { createHash } from 'node:crypto';
import {
  normalizeCompany,
  normalizeUrl,
  type JobInput,
  type Seniority,
  type RemoteType,
  type EmploymentType,
} from '@vulcaestus/types';

const SKILL_ALIASES: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  node: 'node.js',
  nodejs: 'node.js',
  'node.js': 'node.js',
  reactjs: 'react',
  react: 'react',
  vuejs: 'vue',
  vue: 'vue',
  k8s: 'kubernetes',
  kubernetes: 'kubernetes',
  postgres: 'postgresql',
  postgresql: 'postgresql',
  mongo: 'mongodb',
  mongodb: 'mongodb',
  aws: 'aws',
  'amazon web services': 'aws',
  gcp: 'gcp',
  'google cloud': 'gcp',
  azure: 'azure',
  docker: 'docker',
  terraform: 'terraform',
  java: 'java',
  spring: 'spring',
  'spring boot': 'spring boot',
  python: 'python',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  graphql: 'graphql',
  rest: 'rest',
  grpc: 'grpc',
  redis: 'redis',
  kafka: 'kafka',
  sql: 'sql',
  nosql: 'nosql',
  html: 'html',
  css: 'css',
  tailwind: 'tailwind css',
  'tailwind css': 'tailwind css',
  nextjs: 'next.js',
  'next.js': 'next.js',
  playwright: 'playwright',
  cypress: 'cypress',
  jest: 'jest',
  vitest: 'vitest',
  git: 'git',
  linux: 'linux',
  nginx: 'nginx',
  microservices: 'microservices',
  devops: 'devops',
  ci: 'ci/cd',
  'ci/cd': 'ci/cd',
  ml: 'machine learning',
  'machine learning': 'machine learning',
  llm: 'llm',
  'large language models': 'llm',
  rag: 'rag',
  langchain: 'langchain',
  pytorch: 'pytorch',
  tensorflow: 'tensorflow',
  pandas: 'pandas',
  numpy: 'numpy',
};

const KNOWN_SKILLS = Object.keys(SKILL_ALIASES).sort((a, b) => b.length - a.length);

export function canonicalSkill(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return SKILL_ALIASES[normalized] ?? normalized;
}

export function normalizeSkillList(values: string[]): string[] {
  return [...new Set(values.map(canonicalSkill).filter((value) => value.length > 0))];
}

export function detectRemoteType(text: string): RemoteType {
  const value = text.toLowerCase();
  if (/\b(fully remote|remote[- ]first|100% remote|work from anywhere|remote)\b/.test(value)) return 'REMOTE';
  if (/\b(hybrid|partially remote|flexible remote|2 days? (?:in|at) (?:the )?office)\b/.test(value)) return 'HYBRID';
  if (/\b(on[- ]?site|in[- ]office|in person|office[- ]based)\b/.test(value)) return 'ONSITE';
  return 'UNKNOWN';
}

export function detectEmploymentType(text: string): EmploymentType {
  const value = text.toLowerCase();
  if (/\bintern(ship)?\b/.test(value)) return 'INTERNSHIP';
  if (/\bpart[- ]time\b/.test(value)) return 'PART_TIME';
  if (/\b(freelance|freelancer)\b/.test(value)) return 'FREELANCE';
  if (/\b(contract|contractor|fixed[- ]term)\b/.test(value)) return 'CONTRACT';
  if (/\b(temporary|temp)\b/.test(value)) return 'TEMPORARY';
  if (/\b(full[- ]time|permanent)\b/.test(value)) return 'FULL_TIME';
  return 'UNKNOWN';
}

export function detectSeniority(title: string, description = ''): Seniority {
  const value = `${title} ${description.slice(0, 500)}`.toLowerCase();
  if (/\b(ceo|cto|cio|chief|vp|vice president)\b/.test(value)) return 'EXECUTIVE';
  if (/\b(director|head of)\b/.test(value)) return 'DIRECTOR';
  if (/\b(principal|architect)\b/.test(value)) return 'PRINCIPAL';
  if (/\b(staff|tech lead|team lead|lead engineer|lead developer)\b/.test(value)) return 'LEAD';
  if (/\b(senior|sr\.?)\b/.test(value)) return 'SENIOR';
  if (/\b(junior|jr\.?|entry[- ]level|graduate|working student)\b/.test(value)) return 'JUNIOR';
  if (/\b(intern|internship)\b/.test(value)) return 'INTERN';
  if (/\b(mid[- ]level|intermediate)\b/.test(value)) return 'MID';
  return 'UNKNOWN';
}

export function parseSalary(text: string): { salaryMin?: number; salaryMax?: number; currency?: string } {
  const value = text.replace(/\s+/g, ' ');
  const currency = /€|\beur\b/i.test(value)
    ? 'EUR'
    : /\$|\busd\b/i.test(value)
      ? 'USD'
      : /£|\bgbp\b/i.test(value)
        ? 'GBP'
        : /chf/i.test(value)
          ? 'CHF'
          : undefined;

  const range = value.match(
    /([€$£]?\s?\d[\d.,]*\s?[kK]?)\s?(?:-|–|to)\s?([€$£]?\s?\d[\d.,]*\s?[kK]?)/,
  );
  if (!range) return { currency };

  const parse = (raw: string): number | undefined => {
    const cleaned = raw.replace(/[€$£\s]/g, '');
    const multiplier = /k$/i.test(cleaned) ? 1000 : 1;
    const numeric = Number(cleaned.replace(/[kK]/g, '').replace(/,/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return Math.round(numeric * multiplier);
  };

  return { salaryMin: parse(range[1] ?? ''), salaryMax: parse(range[2] ?? ''), currency };
}

export function extractRequirements(description: string): {
  requirements: string[];
  responsibilities: string[];
} {
  const lines = description
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/^[\s•*\-–—]+/, '').trim())
    .filter((line) => line.length > 8 && line.length < 400);

  const requirements: string[] = [];
  const responsibilities: string[] = [];
  let section: 'requirements' | 'responsibilities' | null = null;

  for (const line of lines) {
    const heading = line.toLowerCase().replace(/[:]+$/, '');
    if (/^(requirements|required|qualifications|must have|you have|what you bring|your profile)/.test(heading)) {
      section = 'requirements';
      continue;
    }
    if (/^(responsibilities|what you will do|your role|the role|tasks|duties)/.test(heading)) {
      section = 'responsibilities';
      continue;
    }
    if (heading.length < 45 && /^(benefits|about us|perks|what we offer|nice to have)/.test(heading)) {
      section = null;
      continue;
    }
    if (section === 'requirements') requirements.push(line);
    else if (section === 'responsibilities') responsibilities.push(line);
    else if (/must have|you have|experience with|proficien|knowledge of|degree in/i.test(line)) {
      requirements.push(line);
    }
  }

  return { requirements: requirements.slice(0, 40), responsibilities: responsibilities.slice(0, 40) };
}

export function extractSkills(description: string): string[] {
  const value = description.toLowerCase();
  const found: string[] = [];
  for (const skill of KNOWN_SKILLS) {
    if (skill.length < 2) continue;
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i');
    if (pattern.test(value)) found.push(canonicalSkill(skill));
  }
  return [...new Set(found)].slice(0, 40);
}

export function extractYearsExperience(text: string): number | undefined {
  const matches = [...text.matchAll(/(\d{1,2})\s*\+?\s*years?(?:\s+of)?\s+(?:[a-z+#./ ]{2,30}\s+)?experience/gi)];
  const values = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 50);
  return values.length > 0 ? Math.max(...values) : undefined;
}

export function detectVisaSponsorship(text: string): boolean | undefined {
  const value = text.toLowerCase();
  if (/(no visa sponsorship|sponsorship is not|unable to sponsor|cannot sponsor|without sponsorship)/.test(value)) {
    return false;
  }
  if (/(visa sponsorship|we sponsor|sponsorship available|sponsor visas)/.test(value)) return true;
  return undefined;
}

export function detectCountry(location: string | null | undefined): string | undefined {
  if (!location) return undefined;
  const value = location.toLowerCase();
  const countries: Array<[RegExp, string]> = [
    [/germany|deutschland|berlin|munich|münchen|hamburg|frankfurt|köln|cologne|stuttgart|düsseldorf/i, 'Germany'],
    [/netherlands|amsterdam|rotterdam|utrecht|the hague/i, 'Netherlands'],
    [/united kingdom|uk\b|london|manchester|edinburgh|bristol/i, 'United Kingdom'],
    [/ireland|dublin/i, 'Ireland'],
    [/france|paris|lyon|marseille/i, 'France'],
    [/spain|madrid|barcelona|valencia/i, 'Spain'],
    [/portugal|lisbon|porto/i, 'Portugal'],
    [/switzerland|zurich|zürich|geneva|basel/i, 'Switzerland'],
    [/austria|vienna|wien|graz/i, 'Austria'],
    [/sweden|stockholm|gothenburg/i, 'Sweden'],
    [/denmark|copenhagen/i, 'Denmark'],
    [/norway|oslo/i, 'Norway'],
    [/finland|helsinki/i, 'Finland'],
    [/poland|warsaw|krakow|kraków|wroclaw/i, 'Poland'],
    [/czech|prague|brno/i, 'Czech Republic'],
    [/canada|toronto|vancouver|montreal/i, 'Canada'],
    [/united states|usa|u\.s\.|new york|san francisco|seattle|austin|boston|chicago|los angeles/i, 'United States'],
    [/australia|sydney|melbourne|brisbane/i, 'Australia'],
  ];
  for (const [pattern, country] of countries) {
    if (pattern.test(value)) return country;
  }
  const remote = /remote|anywhere|worldwide|global/.test(value);
  return remote ? 'Remote' : undefined;
}

export interface NormalizedJob {
  title: string;
  company: string;
  companyNormalized: string;
  location: string | null;
  country: string | null;
  remoteType: RemoteType;
  employmentType: EmploymentType;
  seniority: Seniority;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  description: string;
  requirements: string[];
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  yearsExperience: number | null;
  educationRequirement: string | null;
  languageRequirements: string[];
  visaSponsorship: boolean | null;
  industry: string | null;
  url: string | null;
  canonicalUrl: string | null;
  externalId: string | null;
  source: string;
  postedAt: Date | null;
  fingerprint: string;
}

export function normalizeJobInput(input: JobInput): NormalizedJob {
  const description = input.description.trim();
  const title = input.title.trim().replace(/\s+/g, ' ');
  const company = input.company.trim().replace(/\s+/g, ' ');
  const location = input.location?.trim() || null;
  const salary = parseSalary(description);
  const extracted = extractRequirements(description);
  const skills = input.requiredSkills?.length
    ? normalizeSkillList(input.requiredSkills)
    : extractSkills(description);
  const preferred = normalizeSkillList(input.preferredSkills ?? []);
  const canonical = input.url ? normalizeUrl(input.url) : null;
  const companyNormalized = normalizeCompany(company);

  const fingerprint = createHash('sha256')
    .update(
      [
        companyNormalized,
        title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
        (location ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
      ].join('|'),
    )
    .digest('hex');

  return {
    title,
    company,
    companyNormalized,
    location,
    country: input.country?.trim() || detectCountry(location) || null,
    remoteType:
      input.remoteType && input.remoteType !== 'UNKNOWN'
        ? input.remoteType
        : detectRemoteType(`${title} ${location ?? ''} ${description}`),
    employmentType:
      input.employmentType && input.employmentType !== 'UNKNOWN'
        ? input.employmentType
        : detectEmploymentType(description),
    seniority:
      input.seniority && input.seniority !== 'UNKNOWN'
        ? input.seniority
        : detectSeniority(title, description),
    salaryMin: input.salaryMin ?? salary.salaryMin ?? null,
    salaryMax: input.salaryMax ?? salary.salaryMax ?? null,
    currency: input.currency ?? salary.currency ?? null,
    description,
    requirements: input.requirements?.length ? input.requirements : extracted.requirements,
    responsibilities: input.responsibilities?.length
      ? input.responsibilities
      : extracted.responsibilities,
    requiredSkills: skills,
    preferredSkills: preferred.filter((skill) => !skills.includes(skill)),
    yearsExperience: input.yearsExperience ?? extractYearsExperience(description) ?? null,
    educationRequirement: input.educationRequirement ?? null,
    languageRequirements: input.languageRequirements ?? [],
    visaSponsorship: input.visaSponsorship ?? detectVisaSponsorship(description) ?? null,
    industry: input.industry ?? null,
    url: input.url || null,
    canonicalUrl: canonical,
    externalId: input.externalId ?? null,
    source: input.source,
    postedAt: input.postedAt ?? null,
    fingerprint,
  };
}
