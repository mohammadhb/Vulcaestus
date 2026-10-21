'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Briefcase,
  ChevronDown,
  Filter,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { clientApi, postJson } from '@/lib/client';
import type { BatchRun, Job } from '@/lib/types';
import { formatDate, scoreTone, statusTone, titleCase, salaryLabel } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Notice,
  Progress,
  buttonClass,
  cn,
} from './ui';

export interface JobCounts {
  active: number;
  archived: number;
  deleted: number;
  unscored: number;
}

type View = 'active' | 'archived' | 'deleted';

function viewHref(params: Record<string, string>, view: View): string {
  const next = new URLSearchParams(params);
  next.set('view', view);
  next.delete('page');
  return `/jobs?${next.toString()}`;
}

function pageHref(params: Record<string, string>, page: number): string {
  const next = new URLSearchParams(params);
  next.set('page', String(page));
  return `/jobs?${next.toString()}`;
}

export function JobsWorkspace({
  jobs,
  total,
  page,
  pageSize,
  counts,
  params,
  sources,
}: {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  counts: JobCounts;
  params: Record<string, string>;
  sources: string[];
}) {
  const router = useRouter();
  const view = (params.view === 'archived' || params.view === 'deleted' ? params.view : 'active') as View;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filterKeys = ['q', 'source', 'remoteType', 'recommendation', 'minScore', 'hasApplication', 'sort'];
  const activeFilterCount = filterKeys.filter((key) => Boolean(params[key])).length;
  const [showFilters, setShowFilters] = useState(activeFilterCount > 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fast, setFast] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchRun | null>(null);

  const allOnPageSelected = jobs.length > 0 && jobs.every((job) => selected.has(job.id));
  const selectedJobs = useMemo(() => jobs.filter((job) => selected.has(job.id)), [jobs, selected]);
  const activeBatch = Boolean(batch && ['QUEUED', 'RUNNING'].includes(batch.status));

  useEffect(() => {
    clientApi<{ batch: BatchRun | null }>('/api/jobs/batches/active')
      .then((result) => {
        if (result.batch) setBatch(result.batch);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!batch || !['QUEUED', 'RUNNING'].includes(batch.status)) return;
    const timer = setInterval(async () => {
      try {
        const result = await clientApi<{ batch: BatchRun }>(`/api/jobs/batches/${batch.id}`);
        setBatch(result.batch);
        if (!['QUEUED', 'RUNNING'].includes(result.batch.status)) {
          router.refresh();
        }
      } catch {
        // keep polling; transient API errors are not fatal
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [batch, router]);

  function toggle(jobId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  async function selectQuick(kind: string) {
    setError(null);
    setMessage(null);
    if (kind === 'page') {
      setSelected(new Set(jobs.map((job) => job.id)));
      return;
    }
    try {
      const query = new URLSearchParams(params);
      query.set('quick', kind);
      const result = await clientApi<{ ids: string[] }>(`/api/jobs/ids?${query.toString()}`);
      setSelected(new Set(result.ids));
      setMessage(
        result.ids.length === 0
          ? 'No jobs matched that quick selection.'
          : `${result.ids.length} job(s) selected.`,
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }

  async function runBulk(action: 'archive' | 'unarchive' | 'delete' | 'restore', ids: string[]) {
    if (ids.length === 0) return;
    if (action === 'delete' && !window.confirm(`Delete ${ids.length} job(s)? They can be restored from the Deleted view.`)) {
      return;
    }
    if (action === 'archive' && !window.confirm(`Archive ${ids.length} job(s)?`)) return;
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      const result = await postJson<{ updated: number }>('/api/jobs/bulk', { action, jobIds: ids });
      setSelected(new Set());
      setMessage(`${result.updated} job(s) ${action === 'delete' ? 'deleted' : action === 'restore' ? 'restored' : action === 'unarchive' ? 'unarchived' : 'archived'}.`);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function startScoring(explicitIds?: string[]) {
    const ids = explicitIds ?? [...selected];
    const scope = ids.length > 0 ? 'selected' : 'unscored';
    if (scope === 'unscored' && counts.unscored === 0) {
      setMessage('Every active job already has a score.');
      return;
    }
    setBusy('score');
    setError(null);
    setMessage(null);
    try {
      const result = await postJson<{ batch: BatchRun }>('/api/jobs/score-all', {
        scope,
        useAi: !fast,
        ...(scope === 'selected' ? { jobIds: ids } : {}),
      });
      setBatch(result.batch);
      setMessage(`Scoring ${result.batch.total} job(s) in the background${fast ? ' without AI' : ''}.`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelScoring() {
    if (!batch) return;
    try {
      const result = await postJson<{ batch: BatchRun }>(`/api/jobs/batches/${batch.id}/cancel`);
      setBatch(result.batch);
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
          {(['active', 'archived', 'deleted'] as const).map((item) => (
            <Link
              key={item}
              href={viewHref(params, item)}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition',
                view === item ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50',
              )}
            >
              {item}
              <span className={cn('ml-1.5 text-[10px]', view === item ? 'text-ink-300' : 'text-ink-400')}>
                {counts[item]}
              </span>
            </Link>
          ))}
        </div>

        <Button variant={showFilters ? 'secondary' : 'ghost'} onClick={() => setShowFilters((value) => !value)}>
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-accent-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
          <ChevronDown className={cn('h-3.5 w-3.5 transition', showFilters && 'rotate-180')} />
        </Button>

        <select
          className="input w-auto max-w-48 py-1.5 text-xs"
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value;
            event.target.value = '';
            if (value) void selectQuick(value);
          }}
          aria-label="Quick select jobs"
        >
          <option value="">Quick select…</option>
          <option value="unscored">Unscored jobs</option>
          <option value="strong">Strong matches (90+)</option>
          <option value="apply">Apply range (80–89)</option>
          <option value="no_application">No application yet</option>
          <option value="all">All matching filters</option>
          <option value="page">This page</option>
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <>
              <span className="text-xs font-medium text-ink-600">{selected.size} selected</span>
              {view === 'active' ? (
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => runBulk('archive', [...selected])}>
                  {busy === 'archive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                  Archive
                </Button>
              ) : null}
              {view === 'archived' ? (
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => runBulk('unarchive', [...selected])}>
                  <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                </Button>
              ) : null}
              {view === 'deleted' ? (
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => runBulk('restore', [...selected])}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
              ) : null}
              {view !== 'deleted' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50"
                  disabled={busy !== null}
                  onClick={() => runBulk('delete', [...selected])}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            </>
          ) : null}

          {view !== 'deleted' ? (
            <>
              <label className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-ink-600">
                <input type="checkbox" checked={fast} onChange={(event) => setFast(event.target.checked)} />
                Fast (no AI)
              </label>
              <Button size="sm" disabled={busy !== null || activeBatch} onClick={() => startScoring()}>
                {busy === 'score' || activeBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {activeBatch
                  ? 'Scoring…'
                  : selected.size > 0
                    ? `Score selected (${selected.size})`
                    : `Score all unscored (${counts.unscored})`}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {showFilters ? (
        <Card className="animate-in">
          <form className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6" action="/jobs" method="get">
            <input type="hidden" name="view" value={view} />
            <label className="relative xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input
                name="q"
                defaultValue={params.q ?? ''}
                className="input pl-9"
                placeholder="Search title, company, description"
              />
            </label>
            <select name="source" defaultValue={params.source ?? ''} className="input">
              <option value="">Any source</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {titleCase(source)}
                </option>
              ))}
            </select>
            <select name="remoteType" defaultValue={params.remoteType ?? ''} className="input">
              <option value="">Any work mode</option>
              {['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN'].map((mode) => (
                <option key={mode} value={mode}>
                  {titleCase(mode)}
                </option>
              ))}
            </select>
            <select name="recommendation" defaultValue={params.recommendation ?? ''} className="input">
              <option value="">Any recommendation</option>
              {['STRONG_APPLY', 'APPLY', 'REVIEW', 'LOW_PRIORITY', 'REJECT'].map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
            <select name="minScore" defaultValue={params.minScore ?? ''} className="input">
              <option value="">Any score</option>
              <option value="90">90+</option>
              <option value="80">80+</option>
              <option value="70">70+</option>
              <option value="60">60+</option>
            </select>
            <select name="hasApplication" defaultValue={params.hasApplication ?? ''} className="input">
              <option value="">Any application state</option>
              <option value="false">No application yet</option>
              <option value="true">Has an application</option>
            </select>
            <select name="sort" defaultValue={params.sort ?? 'newest'} className="input">
              <option value="newest">Newest first</option>
              <option value="score">Highest score</option>
            </select>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" className={buttonClass('primary', 'md', 'flex-1')}>
                Apply filters
              </button>
              <Link href={`/jobs?view=${view}`} className={buttonClass('ghost', 'md')}>
                Reset
              </Link>
            </div>
          </form>
        </Card>
      ) : null}

      {activeBatch && batch ? (
        <Card className="border-accent-200 bg-accent-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink-900">
                Scoring {batch.processed} / {batch.total}
                {batch.failed > 0 ? ` · ${batch.failed} failed` : ''}
              </p>
              <p className="text-[11px] text-ink-500">The run continues if you leave this page.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={cancelScoring}>
              Cancel run
            </Button>
          </div>
          <div className="mt-3">
            <Progress value={batch.total > 0 ? (batch.processed / batch.total) * 100 : 0} />
          </div>
        </Card>
      ) : null}

      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Briefcase className="h-8 w-8" />}
            title={view === 'active' ? 'No jobs match' : `No ${view} jobs`}
            description={
              view === 'active'
                ? 'Try clearing filters, importing a posting manually, or running discovery.'
                : `Jobs you ${view === 'archived' ? 'archive' : 'delete'} will appear here and can be restored.`
            }
          />
        </Card>
      ) : (
        <Card className="overflow-visible">
          <div className="hidden grid-cols-[32px_minmax(0,2.2fr)_minmax(0,1.2fr)_80px_120px_100px_130px_32px] gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 md:grid">
            <input
              type="checkbox"
              aria-label="Select all jobs on this page"
              checked={allOnPageSelected}
              onChange={(event) =>
                setSelected(event.target.checked ? new Set(jobs.map((job) => job.id)) : new Set())
              }
            />
            <span>Role</span>
            <span>Company / location</span>
            <span>Score</span>
            <span>Recommendation</span>
            <span>Status</span>
            <span>Discovered</span>
            <span />
          </div>
          <div className="divide-y divide-ink-100">
            {jobs.map((job) => {
              const score = job.scores?.[0];
              const application = job.applications?.[0];
              return (
                <div
                  key={job.id}
                  className={cn(
                    'grid gap-2 px-4 py-3 transition hover:bg-ink-50/60 md:grid-cols-[32px_minmax(0,2.2fr)_minmax(0,1.2fr)_80px_120px_100px_130px_32px] md:items-center md:gap-3',
                    selected.has(job.id) && 'bg-accent-50/40',
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${job.title}`}
                    checked={selected.has(job.id)}
                    onChange={() => toggle(job.id)}
                  />
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.id}`} className="truncate text-sm font-semibold text-ink-900 hover:text-accent-700">
                      {job.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-400">
                      <span className="rounded bg-ink-100 px-1.5 py-0.5">{job.source}</span>
                      {job.archivedAt ? <Badge tone="border-amber-200 bg-amber-50 text-amber-800">Archived</Badge> : null}
                      {job.deletedAt ? <Badge tone="border-rose-200 bg-rose-50 text-rose-700">Deleted</Badge> : null}
                      {job.salaryMin || job.salaryMax ? (
                        <span>{salaryLabel(job.salaryMin, job.salaryMax, job.currency)}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="min-w-0 text-xs">
                    <p className="truncate font-medium text-ink-700">{job.company}</p>
                    <p className="truncate text-[11px] text-ink-400">
                      {job.location ?? 'Location not stated'} · {titleCase(job.remoteType)}
                    </p>
                  </div>
                  <div>
                    {score ? (
                      <Badge tone={scoreTone(score.overallScore)}>{score.overallScore}/100</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-400">Unscored</span>
                    )}
                  </div>
                  <div className="text-xs font-medium text-ink-700">
                    {score ? titleCase(score.recommendation) : '—'}
                  </div>
                  <div>
                    {application ? (
                      <Badge tone={statusTone(application.status)}>{titleCase(application.status)}</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-400">No application</span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-400">{formatDate(job.discoveredAt)}</div>
                  <div className="justify-self-end">
                    <details className="relative">
                      <summary className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md text-ink-500 hover:bg-ink-100">
                        ⋯
                      </summary>
                      <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-ink-200 bg-white p-1 shadow-lg">
                        {view !== 'deleted' ? (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-700 hover:bg-ink-50"
                            onClick={() => {
                              void startScoring([job.id]);
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5" /> Score job
                          </button>
                        ) : null}
                        {view === 'active' ? (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-700 hover:bg-ink-50"
                            onClick={() => void runBulk('archive', [job.id])}
                          >
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </button>
                        ) : null}
                        {view === 'archived' ? (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-700 hover:bg-ink-50"
                            onClick={() => void runBulk('unarchive', [job.id])}
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                          </button>
                        ) : null}
                        {view !== 'deleted' ? (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50"
                            onClick={() => void runBulk('delete', [job.id])}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        ) : (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink-700 hover:bg-ink-50"
                            onClick={() => void runBulk('restore', [job.id])}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                        )}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            <span>
              Page {page} of {pages} · {total} total
              {selected.size > 0 ? ` · ${selected.size} selected` : ''}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={pageHref(params, page - 1)} className={buttonClass('secondary', 'sm')}>
                  Previous
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={pageHref(params, page + 1)} className={buttonClass('secondary', 'sm')}>
                  Next
                </Link>
              ) : null}
            </div>
          </div>
        </Card>
      )}

      {batch && !activeBatch ? (
        <Notice tone={batch.status === 'COMPLETED' ? 'success' : batch.status === 'FAILED' ? 'danger' : 'warning'}>
          Scoring run {batch.status.toLowerCase()}: {batch.processed} processed, {batch.failed} failed.
          {batch.error ? ` ${batch.error}` : ''}
        </Notice>
      ) : null}
    </div>
  );
}
