import type { JobSource } from '@vulcaestus/db';
import type { JobInput } from '@vulcaestus/types';
import { env } from '../../env.js';
import { decryptSecret } from '../../lib/crypto.js';

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}

export function htmlToText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function configString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (value.startsWith('v1:')) {
    try {
      return decryptSecret(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

function sourceConfig(source: JobSource): Record<string, unknown> {
  return (source.config as Record<string, unknown>) ?? {};
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      'user-agent': 'vulcaestus/1.0 (self-hosted job search; contact: owner)',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Source returned HTTP ${response.status} for ${url.slice(0, 200)}`);
  }
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/rss+xml,application/xml,text/xml',
      'user-agent': 'vulcaestus/1.0 (self-hosted job search; contact: owner)',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Source returned HTTP ${response.status} for ${url.slice(0, 200)}`);
  }
  return response.text();
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[]) : [];
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

async function greenhouse(source: JobSource): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const token = configString(config, 'boardToken') ?? configString(config, 'token');
  if (!token) throw new Error('Greenhouse source requires config.boardToken');
  const payload = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  )) as { jobs?: unknown };
  return asArray(payload.jobs).map((job) => {
    const location = job.location as { name?: string } | undefined;
    return {
      title: str(job.title) ?? 'Untitled role',
      company: str(job.company_name) ?? token,
      location: location?.name ?? null,
      description: htmlToText(job.content) || 'No description provided by source.',
      url: str(job.absolute_url) ?? null,
      source: 'greenhouse',
      externalId: job.id ? String(job.id) : null,
      postedAt: str(job.updated_at) ? new Date(String(job.updated_at)) : null,
    };
  });
}

async function lever(source: JobSource): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const site = configString(config, 'site') ?? configString(config, 'company');
  if (!site) throw new Error('Lever source requires config.site');
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
  return asArray(payload).map((job) => {
    const categories = (job.categories ?? {}) as Record<string, unknown>;
    const lists = asArray(job.lists)
      .map((list) => `${str(list.text) ?? 'Section'}\n${htmlToText(list.content)}`)
      .join('\n\n');
    return {
      title: str(job.text) ?? 'Untitled role',
      company: site,
      location: str(categories.location) ?? null,
      remoteType: /remote/i.test(String(categories.location ?? '')) ? 'REMOTE' : undefined,
      employmentType: /contract/i.test(String(categories.commitment ?? '')) ? 'CONTRACT' : undefined,
      description: [htmlToText(job.descriptionPlain ?? job.description), lists].filter(Boolean).join('\n\n'),
      url: str(job.hostedUrl) ?? null,
      source: 'lever',
      externalId: job.id ? String(job.id) : null,
      postedAt: job.createdAt ? new Date(Number(job.createdAt)) : null,
    };
  });
}

async function remotive(): Promise<JobInput[]> {
  const payload = (await fetchJson('https://remotive.com/api/remote-jobs?limit=100')) as { jobs?: unknown };
  return asArray(payload.jobs).map((job) => ({
    title: str(job.title) ?? 'Untitled role',
    company: str(job.company_name) ?? 'Unknown company',
    location: str(job.candidate_required_location) ?? 'Remote',
    remoteType: 'REMOTE',
    employmentType: /contract/i.test(String(job.job_type))
      ? 'CONTRACT'
      : /part/i.test(String(job.job_type))
        ? 'PART_TIME'
        : 'FULL_TIME',
    description: htmlToText(job.description) || 'No description provided by source.',
    requiredSkills: Array.isArray(job.tags) ? job.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    url: str(job.url) ?? null,
    source: 'remotive',
    externalId: job.id ? String(job.id) : null,
    postedAt: str(job.publication_date) ? new Date(String(job.publication_date)) : null,
  }));
}

async function ashby(source: JobSource): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const org = configString(config, 'organization') ?? configString(config, 'org');
  if (!org) throw new Error('Ashby source requires config.organization');
  const payload = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
  )) as { jobs?: unknown };
  return asArray(payload.jobs).map((job) => ({
    title: str(job.title) ?? 'Untitled role',
    company: str(job.companyName) ?? org,
    location: str(job.location) ?? null,
    remoteType: job.isRemote === true ? 'REMOTE' : undefined,
    employmentType: /contract/i.test(String(job.employmentType)) ? 'CONTRACT' : undefined,
    description: htmlToText(job.descriptionHtml ?? job.descriptionPlain) || 'No description provided by source.',
    url: str(job.jobUrl) ?? str(job.applyUrl) ?? null,
    source: 'ashby',
    externalId: str(job.id) ?? null,
    postedAt: str(job.publishedAt) ? new Date(String(job.publishedAt)) : null,
  }));
}

async function workable(source: JobSource): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const account = configString(config, 'account') ?? configString(config, 'subdomain');
  if (!account) throw new Error('Workable source requires config.account');
  const payload = (await fetchJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`,
  )) as { jobs?: unknown };
  return asArray(payload.jobs).map((job) => {
    const location = (job.location ?? {}) as Record<string, unknown>;
    const locationText = [str(location.city), str(location.region), str(location.country)]
      .filter(Boolean)
      .join(', ');
    return {
      title: str(job.title) ?? 'Untitled role',
      company: account,
      location: locationText || null,
      remoteType: job.telecommuting === true ? 'REMOTE' : undefined,
      description: [htmlToText(job.description), htmlToText(job.requirements)].filter(Boolean).join('\n\n'),
      url: str(job.url) ?? str(job.shortlink) ?? null,
      source: 'workable',
      externalId: str(job.shortcode) ?? str(job.id) ?? null,
      postedAt: str(job.created_at) ? new Date(String(job.created_at)) : null,
    };
  });
}

function parseRss(xml: string): JobInput[] {
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  return items.slice(0, 100).flatMap((item) => {
    const read = (tag: string): string | undefined => {
      const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      if (!match?.[1]) return undefined;
      return htmlToText(match[1].replace(/<!\[CDATA\[|\]\]>/g, ''));
    };
    const title = read('title');
    const description = read('description') ?? read('content:encoded') ?? '';
    const link = read('link');
    if (!title) return [];
    const company =
      read('company') ??
      read('dc:creator') ??
      link?.match(/\/\/(?:www\.)?([^./]+)/)?.[1]?.replace(/-/g, ' ') ??
      'Unknown company';
    return [
      {
        title,
        company,
        description: description || 'No description provided by source.',
        url: link ?? null,
        source: 'rss',
        externalId: read('guid') ?? link ?? null,
        postedAt: read('pubDate') ? new Date(read('pubDate') as string) : null,
      },
    ];
  });
}

async function rss(source: JobSource): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const url = configString(config, 'url') ?? configString(config, 'feedUrl');
  if (!url) throw new Error('RSS source requires config.url');
  const xml = await fetchText(url);
  return parseRss(xml);
}

async function serpApiGoogle(source: JobSource): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const apiKey = configString(config, 'apiKey');
  if (!apiKey) throw new Error('Google Jobs via SerpAPI requires config.apiKey');
  const query = configString(config, 'query') ?? 'software engineer';
  const location = configString(config, 'location') ?? '';
  const params = new URLSearchParams({
    engine: 'google_jobs',
    q: query,
    api_key: apiKey,
    ...(location ? { location } : {}),
  });
  const payload = (await fetchJson(`https://serpapi.com/search.json?${params.toString()}`)) as {
    jobs_results?: unknown;
  };
  return asArray(payload.jobs_results).map((job) => {
    const applyOptions = asArray(job.apply_options);
    const url = str(applyOptions[0]?.link) ?? str(job.share_link) ?? null;
    const extensions = (job.detected_extensions ?? {}) as Record<string, unknown>;
    return {
      title: str(job.title) ?? 'Untitled role',
      company: str(job.company_name) ?? 'Unknown company',
      location: str(job.location) ?? null,
      description: htmlToText(job.description) || 'No description provided by source.',
      url,
      source: 'google_jobs',
      externalId: str(job.job_id) ?? url,
      postedAt: str(extensions.posted_at) ? new Date(String(extensions.posted_at)) : null,
    };
  });
}

async function authorizedPartner(source: JobSource, label: string): Promise<JobInput[]> {
  const config = sourceConfig(source);
  const endpoint = configString(config, 'endpoint');
  const apiKey = configString(config, 'apiKey');
  if (!endpoint || !apiKey) {
    throw new Error(
      `${label} requires an authorized partner API endpoint and key in this source's configuration. Manual job import remains available.`,
    );
  }
  const payload = (await fetchJson(endpoint, {
    headers: { authorization: `Bearer ${apiKey}` },
  })) as { jobs?: unknown };
  return asArray(payload.jobs).map((job) => ({
    title: str(job.title) ?? 'Untitled role',
    company: str(job.company) ?? str(job.company_name) ?? 'Unknown company',
    location: str(job.location) ?? null,
    description: htmlToText(job.description) || 'No description provided by source.',
    url: str(job.url) ?? str(job.apply_url) ?? null,
    source: label.toLowerCase().replace(/\s+/g, '_'),
    externalId: str(job.id) ?? str(job.job_id) ?? null,
    salaryMin: num(job.salary_min),
    salaryMax: num(job.salary_max),
    postedAt: str(job.posted_at) ? new Date(String(job.posted_at)) : null,
  }));
}

export async function runSource(source: JobSource): Promise<{ jobs: JobInput[]; note?: string }> {
  switch (source.kind) {
    case 'GREENHOUSE':
      return { jobs: await greenhouse(source) };
    case 'LEVER':
      return { jobs: await lever(source) };
    case 'REMOTIVE':
      return { jobs: await remotive() };
    case 'ASHBY':
      return { jobs: await ashby(source) };
    case 'WORKABLE':
      return { jobs: await workable(source) };
    case 'RSS':
      return { jobs: await rss(source) };
    case 'SERPAPI_GOOGLE':
      return { jobs: await serpApiGoogle(source) };
    case 'INDEED_PARTNER':
      return { jobs: await authorizedPartner(source, 'Indeed') };
    case 'ZIPRECRUITER_PARTNER':
      return { jobs: await authorizedPartner(source, 'ZipRecruiter') };
    case 'LINKEDIN_MANUAL':
      return {
        jobs: [],
        note: 'LinkedIn is manual-import only. Use Jobs → Import job with a URL and pasted description.',
      };
    case 'MANUAL':
      return { jobs: [], note: 'Manual source: jobs are imported through the Jobs page.' };
    default:
      throw new Error(`Unsupported source kind: ${String(source.kind)}`);
  }
}

export async function discoverFromSources(
  sources: JobSource[],
  limit = env.MAX_JOBS_PER_DAY,
): Promise<Array<{ source: string; fetched: number; error?: string }>> {
  const results: Array<{ source: string; fetched: number; error?: string }> = [];
  for (const source of sources) {
    try {
      const { jobs } = await runSource(source);
      results.push({ source: source.name, fetched: Math.min(jobs.length, limit) });
    } catch (error) {
      results.push({ source: source.name, fetched: 0, error: (error as Error).message });
    }
  }
  return results;
}
