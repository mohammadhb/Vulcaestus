'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Field, Notice } from './ui';

export function ImportJobForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    company: '',
    location: '',
    url: '',
    description: '',
    requiredSkills: '',
    remoteType: 'UNKNOWN',
  });

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Import job
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
          const result = await postJson<{ job: { id: string } }>('/api/jobs', {
            title: form.title,
            company: form.company,
            location: form.location || null,
            url: form.url || null,
            description: form.description,
            requiredSkills: form.requiredSkills
              ? form.requiredSkills.split(',').map((skill) => skill.trim()).filter(Boolean)
              : [],
            remoteType: form.remoteType,
            source: 'manual',
          });
          router.push(`/jobs/${result.job.id}`);
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Import a job</p>
        <button type="button" className="text-xs text-ink-500 hover:underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job title">
          <input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
        </Field>
        <Field label="Company">
          <input className="input" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} required />
        </Field>
        <Field label="Location">
          <input className="input" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        </Field>
        <Field label="Job URL">
          <input
            className="input"
            type="url"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
            placeholder="https://…"
          />
        </Field>
      </div>
      <Field label="Description" hint="Paste the full posting. Scoring and skill extraction use this text.">
        <textarea
          className="input min-h-40"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          required
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Required skills (comma separated)" hint="Optional; extracted from the description if empty.">
          <input
            className="input"
            value={form.requiredSkills}
            onChange={(event) => setForm({ ...form, requiredSkills: event.target.value })}
            placeholder="TypeScript, PostgreSQL, AWS"
          />
        </Field>
        <Field label="Work mode">
          <select className="input" value={form.remoteType} onChange={(event) => setForm({ ...form, remoteType: event.target.value })}>
            <option value="UNKNOWN">Not specified</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE">On-site</option>
          </select>
        </Field>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Importing…' : 'Import job'}
        </Button>
      </div>
    </form>
  );
}
