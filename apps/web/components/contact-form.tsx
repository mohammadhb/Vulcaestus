'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Field, Notice } from './ui';

export function ContactForm({
  company: fixedCompany,
  jobId,
  compact = false,
}: {
  company?: string;
  jobId?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company: fixedCompany ?? '',
    name: '',
    title: '',
    linkedinUrl: '',
    email: '',
    category: 'OTHER',
    relationship: '',
    verified: false,
    notes: '',
  });

  if (!open) {
    return (
      <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add contact
      </Button>
    );
  }

  return (
    <form
      className="card w-full space-y-3 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await postJson('/api/contacts', {
            ...form,
            company: form.company || fixedCompany,
            jobId: jobId ?? undefined,
            relationship: form.relationship || undefined,
            notes: form.notes || undefined,
            linkedinUrl: form.linkedinUrl || undefined,
            email: form.email || undefined,
          });
          setOpen(false);
          setForm({ ...form, name: '', title: '', linkedinUrl: '', email: '', relationship: '', notes: '' });
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Add a contact{fixedCompany ? ` at ${fixedCompany}` : ''}</p>
        <button type="button" className="text-xs text-ink-500 hover:underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!fixedCompany ? (
          <Field label="Company">
            <input
              className="input"
              value={form.company}
              onChange={(event) => setForm({ ...form, company: event.target.value })}
              required
            />
          </Field>
        ) : null}
        <Field label="Name">
          <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Title">
          <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <Field label="LinkedIn URL">
          <input
            className="input"
            type="url"
            value={form.linkedinUrl}
            onChange={(event) => setForm({ ...form, linkedinUrl: event.target.value })}
            placeholder="https://www.linkedin.com/in/…"
          />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label="Category">
          <select className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {[
              'HIRING_MANAGER',
              'RECRUITER',
              'ENGINEERING_MANAGER',
              'TEAM_MEMBER',
              'ALUMNI',
              'FORMER_COLLEAGUE',
              'MUTUAL_CONNECTION',
              'SECOND_DEGREE',
              'OTHER',
            ].map((category) => (
              <option key={category} value={category}>
                {category.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Relationship" hint="Only if verified. Never inferred.">
          <input
            className="input"
            value={form.relationship}
            onChange={(event) => setForm({ ...form, relationship: event.target.value })}
            placeholder="e.g. former colleague"
          />
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-xs text-ink-600">
        <input
          type="checkbox"
          checked={form.verified}
          onChange={(event) => setForm({ ...form, verified: event.target.checked })}
        />
        I have verified this relationship
      </label>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Add contact'}
        </Button>
      </div>
    </form>
  );
}
