'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { patchJson } from '@/lib/client';
import { Button, Field, Notice } from './ui';

const STATUSES = [
  'DISCOVERED',
  'SHORTLISTED',
  'TAILORING',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'APPLYING',
  'SUBMITTED',
  'RECRUITER_SCREEN',
  'INTERVIEW',
  'FINAL_ROUND',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
  'ARCHIVED',
];

export function ApplicationStatusControl({
  applicationId,
  status,
  notes,
  applicationUrl,
  submittedAt,
}: {
  applicationId: string;
  status: string;
  notes: string | null;
  applicationUrl: string | null;
  submittedAt: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    status,
    notes: notes ?? '',
    applicationUrl: applicationUrl ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
          await patchJson(`/api/applications/${applicationId}`, {
            status: form.status,
            notes: form.notes || null,
            ...(form.applicationUrl ? { applicationUrl: form.applicationUrl } : {}),
          });
          setMessage('Application updated.');
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Application URL" hint={submittedAt ? `Submitted ${new Date(submittedAt).toLocaleDateString()}` : undefined}>
          <input
            className="input"
            type="url"
            value={form.applicationUrl}
            onChange={(event) => setForm({ ...form, applicationUrl: event.target.value })}
            placeholder="https://…"
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          className="input min-h-24"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
          placeholder="Recruiter name, next steps, interview notes…"
        />
      </Field>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save changes
      </Button>
    </form>
  );
}
