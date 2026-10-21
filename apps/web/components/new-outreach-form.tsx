'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { postJson } from '@/lib/client';
import type { Contact, Job } from '@/lib/types';
import { Button, Field, Notice } from './ui';

const TYPES = [
  'CONNECTION_REQUEST',
  'REFERRAL_REQUEST',
  'RECRUITER_OUTREACH',
  'HIRING_MANAGER_OUTREACH',
  'FOLLOW_UP',
  'THANK_YOU',
  'POST_INTERVIEW_FOLLOW_UP',
];

export function NewOutreachForm({
  contacts,
  jobs,
  defaultContact,
}: {
  contacts: Contact[];
  jobs: Job[];
  defaultContact?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultContact));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    contactId: defaultContact ?? contacts[0]?.id ?? '',
    jobId: '',
    type: 'REFERRAL_REQUEST',
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Draft outreach
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
          await postJson('/api/outreach', {
            contactId: form.contactId,
            jobId: form.jobId || undefined,
            type: form.type,
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
        <p className="text-sm font-semibold">Draft a message</p>
        <button type="button" className="text-xs text-ink-500 hover:underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Contact">
          <select className="input" value={form.contactId} onChange={(event) => setForm({ ...form, contactId: event.target.value })} required>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} — {contact.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Related job (optional)">
          <select className="input" value={form.jobId} onChange={(event) => setForm({ ...form, jobId: event.target.value })}>
            <option value="">No specific job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} — {job.company}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Message type">
          <select className="input" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {contacts.length === 0 ? <Notice tone="warning">Add a contact first.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !form.contactId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Generate draft
        </Button>
      </div>
    </form>
  );
}
