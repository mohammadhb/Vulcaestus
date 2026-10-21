'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { clientApi, patchJson, postJson } from '@/lib/client';
import { formatDateTime, titleCase } from '@/lib/format';
import { Badge, Button, Card, CardBody, CardHeader, Field, Notice } from './ui';

interface Source {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  lastError: string | null;
}

const KINDS = [
  'GREENHOUSE',
  'LEVER',
  'REMOTIVE',
  'ASHBY',
  'WORKABLE',
  'RSS',
  'SERPAPI_GOOGLE',
  'INDEED_PARTNER',
  'ZIPRECRUITER_PARTNER',
  'LINKEDIN_MANUAL',
  'MANUAL',
];

const CONFIG_HINT: Record<string, string> = {
  GREENHOUSE: '{"boardToken": "company"}',
  LEVER: '{"site": "company"}',
  ASHBY: '{"organization": "company"}',
  WORKABLE: '{"account": "company"}',
  RSS: '{"url": "https://example.com/jobs.rss"}',
  SERPAPI_GOOGLE: '{"apiKey": "…", "query": "backend engineer", "location": "Berlin"}',
  INDEED_PARTNER: '{"endpoint": "authorized partner URL", "apiKey": "…"}',
  ZIPRECRUITER_PARTNER: '{"endpoint": "authorized partner URL", "apiKey": "…"}',
  REMOTIVE: '{}',
  LINKEDIN_MANUAL: '{}',
  MANUAL: '{}',
};

export function SourcesManager({ sources, canManage }: { sources: Source[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'GREENHOUSE', config: '{"boardToken": ""}', enabled: true });

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Job sources"
        description="Official APIs and user-supplied feeds. No scraping, stealth, or CAPTCHA bypass."
        action={
          canManage ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  run('defaults', () => postJson('/api/sources/defaults'), 'Recommended sources added (Remotive + LinkedIn manual placeholder).')
                }
              >
                Add defaults
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
                <Plus className="h-3.5 w-3.5" /> Add source
              </Button>
            </div>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {open && canManage ? (
          <form
            className="space-y-3 rounded-lg border border-ink-200 bg-ink-50/40 p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              let config: Record<string, unknown>;
              try {
                config = JSON.parse(form.config || '{}') as Record<string, unknown>;
              } catch {
                setError('Config must be valid JSON');
                return;
              }
              await run(
                'create',
                () => postJson('/api/sources', { name: form.name, kind: form.kind, config, enabled: form.enabled }),
                'Source added.',
              );
              setOpen(false);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </Field>
              <Field label="Source type">
                <select
                  className="input"
                  value={form.kind}
                  onChange={(event) =>
                    setForm({ ...form, kind: event.target.value, config: CONFIG_HINT[event.target.value] ?? '{}' })
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {titleCase(kind)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Configuration (JSON)" hint={`Example: ${CONFIG_HINT[form.kind] ?? '{}'}`}>
              <textarea className="input min-h-20 font-mono text-[11px]" value={form.config} onChange={(event) => setForm({ ...form, config: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy !== null}>
                Add source
              </Button>
            </div>
          </form>
        ) : null}

        {sources.length === 0 ? (
          <p className="text-xs text-ink-400">No sources configured. Add Remotive to start discovering remote roles.</p>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <div key={source.id} className="rounded-lg border border-ink-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-ink-800">{source.name}</span>
                      <Badge>{titleCase(source.kind)}</Badge>
                      <Badge tone={source.enabled ? 'border-accent-200 bg-accent-50 text-accent-800' : undefined}>
                        {source.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-ink-400">
                      Last run: {source.lastRunAt ? formatDateTime(source.lastRunAt) : 'never'}
                    </p>
                    {source.lastError ? <p className="mt-1 text-[10px] text-rose-700">Last error: {source.lastError}</p> : null}
                    <pre className="mt-1 max-h-20 overflow-auto rounded bg-ink-50 p-1.5 text-[10px] text-ink-500">
                      {JSON.stringify(source.config, null, 2)}
                    </pre>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null || !source.enabled}
                      onClick={() => run(`run-${source.id}`, () => postJson(`/api/sources/${source.id}/run`), `${source.name} completed.`)}
                    >
                      {busy === `run-${source.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Run
                    </Button>
                    {canManage ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => run(`toggle-${source.id}`, () => patchJson(`/api/sources/${source.id}`, { enabled: !source.enabled }), 'Source updated.')}
                        >
                          {source.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:bg-rose-50"
                          disabled={busy !== null}
                          onClick={() => {
                            if (!window.confirm(`Delete source "${source.name}"?`)) return;
                            void run(`delete-${source.id}`, () => clientApi(`/api/sources/${source.id}`, { method: 'DELETE' }), 'Source deleted.');
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </CardBody>
    </Card>
  );
}
