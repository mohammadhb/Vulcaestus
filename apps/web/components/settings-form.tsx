'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { clientApi } from '@/lib/client';
import { Button, Card, CardBody, CardHeader, Field, Notice } from './ui';

export function SettingsForm({
  settings,
  canManage,
}: {
  settings: Record<string, unknown>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    followupDays: String(settings.followupDays ?? 7),
    maxJobsPerDay: String(settings.maxJobsPerDay ?? 200),
    maxFollowupsPerDay: String(settings.maxFollowupsPerDay ?? 20),
    notificationsEnabled: Boolean(settings.notificationsEnabled ?? true),
    aiEnabled: Boolean(settings.aiEnabled ?? true),
    defaultAutomationMode: String(settings.defaultAutomationMode ?? 'SAFE_MODE'),
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        title="Automation & limits"
        description="Server-enforced limits. Dry run is controlled by the DRY_RUN environment variable and cannot be disabled here."
      />
      <CardBody>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              await clientApi('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({
                  followupDays: Number(form.followupDays),
                  maxJobsPerDay: Number(form.maxJobsPerDay),
                  maxFollowupsPerDay: Number(form.maxFollowupsPerDay),
                  notificationsEnabled: form.notificationsEnabled,
                  aiEnabled: form.aiEnabled,
                  defaultAutomationMode: form.defaultAutomationMode,
                  linkedinHandoffOnly: true,
                }),
              });
              setMessage('Settings saved.');
              router.refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Follow-up delay (days)">
            <input className="input" type="number" min="1" max="90" value={form.followupDays} onChange={(event) => setForm({ ...form, followupDays: event.target.value })} disabled={!canManage} />
          </Field>
          <Field label="Max jobs discovered per day">
            <input className="input" type="number" min="1" max="2000" value={form.maxJobsPerDay} onChange={(event) => setForm({ ...form, maxJobsPerDay: event.target.value })} disabled={!canManage} />
          </Field>
          <Field label="Max follow-ups per day">
            <input className="input" type="number" min="1" max="200" value={form.maxFollowupsPerDay} onChange={(event) => setForm({ ...form, maxFollowupsPerDay: event.target.value })} disabled={!canManage} />
          </Field>
          <Field label="Default automation mode">
            <select className="input" value={form.defaultAutomationMode} onChange={(event) => setForm({ ...form, defaultAutomationMode: event.target.value })} disabled={!canManage}>
              <option value="SAFE_MODE">Safe mode</option>
              <option value="ASSISTED_MODE">Assisted mode</option>
              <option value="AUTONOMOUS_MODE">Autonomous mode (configured categories only)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-ink-600">
            <input type="checkbox" checked={form.notificationsEnabled} onChange={(event) => setForm({ ...form, notificationsEnabled: event.target.checked })} disabled={!canManage} />
            Enable notifications
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-600">
            <input type="checkbox" checked={form.aiEnabled} onChange={(event) => setForm({ ...form, aiEnabled: event.target.checked })} disabled={!canManage} />
            Enable AI generation (deterministic fallbacks still run)
          </label>
          <div className="sm:col-span-2">
            <Notice tone="info">
              LinkedIn remains prepare-and-handoff: the worker opens the profile and the approval queue records a manual
              send confirmation. This cannot be switched to automated sending.
            </Notice>
          </div>
          {!canManage ? (
            <div className="sm:col-span-2">
              <Notice tone="warning">Only administrators can change workspace settings.</Notice>
            </div>
          ) : null}
          {message ? <div className="sm:col-span-2"><Notice tone="success">{message}</Notice></div> : null}
          {error ? <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy || !canManage}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export function TestNotificationButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await clientApi('/api/settings/notifications/test', { method: 'POST' });
            setMessage('Test notification queued. Check Telegram/email/dashboard records.');
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Send test notification
      </Button>
      {message ? <Notice tone="info">{message}</Notice> : null}
    </div>
  );
}
