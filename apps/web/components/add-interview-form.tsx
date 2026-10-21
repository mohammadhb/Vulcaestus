'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Field, Notice } from './ui';

export function AddInterviewForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    stage: 'Recruiter screen',
    scheduledAt: '',
    interviewer: '',
    location: '',
    notes: '',
  });

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-3.5 w-3.5" /> Log interview
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-ink-200 p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await postJson('/api/interviews', {
            applicationId,
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
      <div className="grid gap-3 sm:grid-cols-2">
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
        <Field label="Location / link">
          <input className="input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input min-h-16" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save interview
        </Button>
      </div>
    </form>
  );
}
