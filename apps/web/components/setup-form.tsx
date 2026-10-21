'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/client';
import { Button, Field } from '@/components/ui';

export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    fullName: '',
    email: '',
    password: '',
    confirm: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (form.password !== form.confirm) {
          setError('Passwords do not match');
          return;
        }
        setLoading(true);
        try {
          await postJson('/api/auth/setup', {
            name: form.name,
            fullName: form.fullName,
            email: form.email,
            password: form.password,
          });
          router.push('/profile');
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Your name">
        <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </Field>
      <Field label="Full name (as on your resume)">
        <input
          className="input"
          value={form.fullName}
          onChange={(event) => setForm({ ...form, fullName: event.target.value })}
          required
        />
      </Field>
      <Field label="Email">
        <input
          className="input"
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          required
        />
      </Field>
      <Field label="Password" hint="At least 10 characters. Stored as a bcrypt hash.">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          minLength={10}
          required
        />
      </Field>
      <Field label="Confirm password">
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          minLength={10}
          required
        />
      </Field>
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Creating workspace…' : 'Create admin account'}
      </Button>
    </form>
  );
}
