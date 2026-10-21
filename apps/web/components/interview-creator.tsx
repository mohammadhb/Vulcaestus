'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Field, Notice } from './ui';

export function InterviewCreator({ applications }: { applications: Array<{ id: string; title: string; company: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicationId: applications[0]?.id ?? '',
    stage: 'Recruiter screen',
    scheduledAt: '',
    interviewer: '',
    location: '',
    notes: '',
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} disabled={applications.length === 0}>
        <CalendarPlus className="h-4 w-4" /> Log interview
      </Button>
    );
  }

  return (
    <form
      className="card w-full space-y-3 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await postJson('/api/interviews', {
            applicationId: form.applicationId,
            stage: form.stage,
            scheduledAt: new Date(form.scheduledAt).toISOString(),
            interviewer: form.interviewer || undefined,
            location: form.location || undefined,
            notes: form.notes || undefined,
          });
          setOpen(false);
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Log an interview</p>
        <button type="button" className="text-xs text-ink-500 hover:underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Application">
          <select className="input" value={form.applicationId} onChange={(event) => setForm({ ...form, applicationId: event.target.value })} required>
            {applications.map((application) => (
              <option key={application.id} value={application.id}>
                {application.title} — {application.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <input className="input" value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} required />
        </Field>
        <Field label="Date & time">
          <input
            className="input"
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
            required
          />
        </Field>
        <Field label="Interviewer">
          <input className="input" value={form.interviewer} onChange={(event) => setForm({ ...form, interviewer: event.target.value })} />
        </Field>
        <Field label="Location / meeting link">
          <input className="input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input min-h-16" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </Field>
      {applications.length === 0 ? <Notice tone="warning">Prepare an application first.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !form.applicationId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save interview
        </Button>
      </div>
    </form>
  );
}
