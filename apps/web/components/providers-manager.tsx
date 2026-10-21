'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Plus, Star, Trash2, XCircle, Zap } from 'lucide-react';
import { clientApi, patchJson, postJson } from '@/lib/client';
import { formatDateTime, titleCase } from '@/lib/format';
import { Badge, Button, Card, CardBody, CardHeader, Field, Notice } from './ui';

interface Provider {
  id: string;
  name: string;
  provider: string;
  baseUrl: string | null;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  maskedKey: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  lastTestedAt: string | null;
}

const KINDS = ['OLLAMA', 'OPENAI', 'ANTHROPIC', 'OPENROUTER', 'OPENCODE', 'CUSTOM_OPENAI'];
const DEFAULT_MODELS: Record<string, string> = {
  OLLAMA: 'qwen2.5:7b-instruct',
  OPENAI: 'gpt-4o-mini',
  ANTHROPIC: 'claude-3-5-sonnet-latest',
  OPENROUTER: 'anthropic/claude-3.5-sonnet',
  OPENCODE: 'claude-sonnet-4',
  CUSTOM_OPENAI: 'model-name',
};

export function ProvidersManager({
  providers,
  defaults,
}: {
  providers: Provider[];
  defaults: { provider: string; model: string; baseUrl: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    provider: 'OPENROUTER',
    baseUrl: '',
    model: DEFAULT_MODELS.OPENROUTER ?? '',
    apiKey: '',
    isDefault: providers.length === 0,
  });

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'ok' in result) {
        const test = result as { ok: boolean; message: string; latencyMs: number };
        setMessage(`${test.ok ? 'Connection OK' : 'Connection failed'} (${test.latencyMs}ms): ${test.message}`);
      } else {
        setMessage(success);
      }
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
        title="AI providers"
        description="Ollama by default. Add OpenRouter, OpenCode, OpenAI, Anthropic, or any OpenAI-compatible endpoint."
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
            <Plus className="h-3.5 w-3.5" /> Add provider
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2 text-[11px] text-ink-500">
          Environment fallback: <strong>{defaults.provider}</strong> · {defaults.model} · {defaults.baseUrl}
        </div>

        {open ? (
          <form
            className="space-y-3 rounded-lg border border-ink-200 bg-ink-50/40 p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await run(
                'create',
                () =>
                  postJson('/api/providers', {
                    name: form.name,
                    provider: form.provider,
                    model: form.model,
                    baseUrl: form.baseUrl || null,
                    apiKey: form.apiKey || null,
                    enabled: true,
                    isDefault: form.isDefault,
                    settings: {},
                  }),
                'Provider added.',
              );
              setOpen(false);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Display name">
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required placeholder="OpenRouter — Sonnet" />
              </Field>
              <Field label="Provider">
                <select
                  className="input"
                  value={form.provider}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      provider: event.target.value,
                      model: DEFAULT_MODELS[event.target.value] ?? '',
                    })
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {titleCase(kind)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Model">
                <input className="input" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} required />
              </Field>
              <Field label="Base URL" hint="Leave blank for the provider default.">
                <input className="input" type="url" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://…" />
              </Field>
              <Field label="API key" hint="Encrypted with AES-256-GCM. Never returned to the browser." className="sm:col-span-2">
                <input className="input" type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} autoComplete="off" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
              Use as default provider
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy !== null}>
                Add provider
              </Button>
            </div>
          </form>
        ) : null}

        {providers.length === 0 ? (
          <p className="text-xs text-ink-400">No database providers configured. The environment Ollama fallback is used.</p>
        ) : (
          <div className="space-y-2">
            {providers.map((provider) => (
              <div key={provider.id} className="rounded-lg border border-ink-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-ink-800">{provider.name}</span>
                      <Badge>{titleCase(provider.provider)}</Badge>
                      {provider.isDefault ? <Badge tone="border-accent-200 bg-accent-50 text-accent-800"><Star className="h-3 w-3" /> Default</Badge> : null}
                      {!provider.enabled ? <Badge>Disabled</Badge> : null}
                      {provider.lastTestOk === true ? <Badge tone="border-accent-200 bg-accent-50 text-accent-800"><CheckCircle2 className="h-3 w-3" /> Reachable</Badge> : null}
                      {provider.lastTestOk === false ? <Badge tone="border-rose-200 bg-rose-50 text-rose-700"><XCircle className="h-3 w-3" /> Failed</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-500">
                      {provider.model}
                      {provider.baseUrl ? ` · ${provider.baseUrl}` : ''}
                      {provider.hasApiKey ? ` · key ${provider.maskedKey}` : ' · no key'}
                    </p>
                    {provider.lastTestedAt ? <p className="text-[10px] text-ink-400">Tested {formatDateTime(provider.lastTestedAt)}</p> : null}
                    {provider.lastTestError ? <p className="mt-1 text-[10px] text-rose-700">{provider.lastTestError}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() => run(`test-${provider.id}`, () => postJson(`/api/providers/${provider.id}/test`), 'Provider reachable.')}
                    >
                      {busy === `test-${provider.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      Test
                    </Button>
                    {!provider.isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => run(`default-${provider.id}`, () => patchJson(`/api/providers/${provider.id}`, { isDefault: true }), 'Default provider updated.')}
                      >
                        Make default
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(`Delete provider "${provider.name}"?`)) return;
                        void run(`delete-${provider.id}`, () => clientApi(`/api/providers/${provider.id}`, { method: 'DELETE' }), 'Provider deleted.');
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
