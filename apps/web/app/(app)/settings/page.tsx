import { BadgeCheck, Bot, Database, Lock, Server, ShieldAlert, Users } from 'lucide-react';
import { api, safeApi } from '@/lib/api';
import type { Me, User } from '@/lib/types';
import { Badge, Card, CardBody, CardHeader, PageHeader, PageShell, Notice } from '@/components/ui';
import { SettingsForm, TestNotificationButton } from '@/components/settings-form';
import { SourcesManager } from '@/components/sources-manager';
import { ProvidersManager } from '@/components/providers-manager';
import { PromptsManager, UsersManager, PasswordForm } from '@/components/admin-managers';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const me = await api<Me>('/api/auth/me');
  const settingsData = await safeApi<{
    settings: Record<string, unknown>;
    runtime: Record<string, unknown>;
    integrations: { telegram: boolean; email: boolean; browserWorker: string };
  }>('/api/settings');
  const sources = await safeApi<{ sources: Array<Record<string, unknown> & { id: string; name: string; kind: string; enabled: boolean; config: Record<string, unknown>; lastRunAt: string | null; lastError: string | null }> }>(
    '/api/sources',
  );
  const admin = me.permissions.admin;
  const users = admin ? await safeApi<{ users: User[] }>('/api/users') : null;
  const providers = admin
    ? await safeApi<{
        providers: Array<{
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
        }>;
        defaults: { provider: string; model: string; baseUrl: string };
      }>('/api/providers')
    : null;
  const prompts = admin ? await safeApi<{ prompts: Array<{ name: string; version: string; content: string; source: 'database' | 'file' }> }>('/api/prompts') : null;

  const runtime = settingsData?.runtime ?? {};
  const integrations = settingsData?.integrations;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Sources, AI providers, prompts, limits, users, and integrations. Secrets are encrypted and never returned."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <ShieldAlert className="h-3.5 w-3.5" /> Dry run
          </div>
          <p className="mt-2 text-lg font-bold text-ink-900">{runtime.dryRun ? 'Enabled' : 'Disabled'}</p>
          <p className="mt-1 text-[11px] text-ink-500">Controlled by the DRY_RUN environment variable.</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <Bot className="h-3.5 w-3.5" /> AI
          </div>
          <p className="mt-2 text-lg font-bold text-ink-900">{runtime.aiEnabled ? 'Enabled' : 'Disabled'}</p>
          <p className="mt-1 text-[11px] text-ink-500">
            {String(runtime.aiProvider)} · {String(runtime.ollamaModel)}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <Server className="h-3.5 w-3.5" /> Integrations
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={integrations?.telegram ? 'border-accent-200 bg-accent-50 text-accent-800' : undefined}>
              Telegram {integrations?.telegram ? 'on' : 'off'}
            </Badge>
            <Badge tone={integrations?.email ? 'border-accent-200 bg-accent-50 text-accent-800' : undefined}>
              Email {integrations?.email ? 'on' : 'off'}
            </Badge>
            <Badge tone="border-accent-200 bg-accent-50 text-accent-800">Browser worker connected</Badge>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <Lock className="h-3.5 w-3.5" /> Security
          </div>
          <p className="mt-2 text-lg font-bold text-ink-900">Approval gated</p>
          <p className="mt-1 text-[11px] text-ink-500">No external action without a matching APPROVED record.</p>
        </div>
      </div>

      {!admin ? (
        <div className="mt-5">
          <Notice tone="info">
            You are signed in as a user. Workspace settings are read-only; ask an administrator to change sources,
            providers, or limits.
          </Notice>
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        <SettingsForm settings={settingsData?.settings ?? {}} canManage={admin} />

        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="Notifications" description="Dashboard records are always written; delivery is best effort." />
            <CardBody className="space-y-3 text-xs text-ink-600">
              <p className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                Configure TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID or SMTP variables in .env, then restart the API.
              </p>
              <TestNotificationButton />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Data & storage" description="Everything stays on this server." />
            <CardBody className="space-y-2 text-[11px] leading-relaxed text-ink-500">
              <p className="flex gap-2"><Database className="mt-0.5 h-3.5 w-3.5 shrink-0" /> PostgreSQL stores profiles, jobs, documents, approvals, and audit logs.</p>
              <p className="flex gap-2"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Each user has a private job catalog, profile, scores, applications, and outreach. Sources are admin-managed.</p>
              <p className="flex gap-2"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Provider API keys are encrypted with AES-256-GCM using SECRETS_KEY.</p>
              <p className="mt-2">Version {String(runtime.version ?? '1.0.0')}</p>
            </CardBody>
          </Card>
        </div>

        <SourcesManager
          sources={(sources?.sources ?? []) as Array<{ id: string; name: string; kind: string; enabled: boolean; config: Record<string, unknown>; lastRunAt: string | null; lastError: string | null }>}
          canManage={admin}
        />

        {admin ? (
          <>
            <ProvidersManager
              providers={providers?.providers ?? []}
              defaults={providers?.defaults ?? { provider: 'OLLAMA', model: 'qwen2.5:7b-instruct', baseUrl: 'http://ollama:11434' }}
            />
            <PromptsManager prompts={prompts?.prompts ?? []} />
            <UsersManager users={users?.users ?? []} currentUserId={me.user.id} />
          </>
        ) : null}

        <PasswordForm />
      </div>
    </PageShell>
  );
}
