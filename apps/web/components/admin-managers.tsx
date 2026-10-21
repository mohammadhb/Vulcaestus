'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, Save, Trash2, UserPlus } from 'lucide-react';
import { clientApi, patchJson, postJson } from '@/lib/client';
import { formatDate, titleCase } from '@/lib/format';
import type { User } from '@/lib/types';
import { Badge, Button, Card, CardBody, CardHeader, Field, Notice } from './ui';

interface Prompt {
  name: string;
  version: string;
  content: string;
  source: 'database' | 'file';
}

export function PromptsManager({ prompts }: { prompts: Prompt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { content: string; version: string }>>(
    Object.fromEntries(prompts.map((prompt) => [prompt.name, { content: prompt.content, version: prompt.version }])),
  );

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(success);
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
        title="Prompt versions"
        description="File prompts live in /prompts. Database overrides are versioned and recorded on every generation."
      />
      <CardBody className="space-y-3">
        {prompts.map((prompt) => {
          const draft = drafts[prompt.name] ?? { content: prompt.content, version: prompt.version };
          return (
            <details key={prompt.name} className="rounded-lg border border-ink-200 p-3">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-xs font-semibold text-ink-800">
                {prompt.name}
                <Badge>{prompt.version}</Badge>
                <Badge tone={prompt.source === 'database' ? 'border-amber-200 bg-amber-50 text-amber-800' : undefined}>
                  {prompt.source === 'database' ? 'Database override' : 'File'}
                </Badge>
              </summary>
              <div className="mt-3 space-y-2">
                <Field label="Version">
                  <input
                    className="input max-w-40"
                    value={draft.version}
                    onChange={(event) => setDrafts({ ...drafts, [prompt.name]: { ...draft, version: event.target.value } })}
                  />
                </Field>
                <Field label="Prompt content">
                  <textarea
                    className="input min-h-72 font-mono text-[11px]"
                    value={draft.content}
                    onChange={(event) => setDrafts({ ...drafts, [prompt.name]: { ...draft, content: event.target.value } })}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `save-${prompt.name}`,
                        () => clientApi(`/api/prompts/${prompt.name}`, { method: 'PUT', body: JSON.stringify(draft) }),
                        `${prompt.name} saved as a database override.`,
                      )
                    }
                  >
                    {busy === `save-${prompt.name}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save override
                  </Button>
                  {prompt.source === 'database' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `reset-${prompt.name}`,
                          () => clientApi(`/api/prompts/${prompt.name}`, { method: 'DELETE' }),
                          'Override removed; file prompt is active again.',
                        )
                      }
                    >
                      Reset to file
                    </Button>
                  ) : null}
                </div>
              </div>
            </details>
          );
        })}
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </CardBody>
    </Card>
  );
}

export function UsersManager({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    fullName: '',
    email: '',
    password: '',
    role: 'USER',
  });

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(success);
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
        title="Users"
        description="Admins manage accounts. Each user has a private profile, applications, approvals, and outreach."
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
            <UserPlus className="h-3.5 w-3.5" /> Add user
          </Button>
        }
      />
      <CardBody className="space-y-3">
        {open ? (
          <form
            className="space-y-3 rounded-lg border border-ink-200 bg-ink-50/40 p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await run(
                'create',
                () => postJson('/api/users', form),
                'User created.',
              );
              setOpen(false);
              setForm({ name: '', fullName: '', email: '', password: '', role: 'USER' });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account name">
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              </Field>
              <Field label="Full name">
                <input className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
              </Field>
              <Field label="Temporary password" hint="At least 10 characters.">
                <input className="input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={10} required />
              </Field>
              <Field label="Role">
                <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy !== null}>
                Create user
              </Button>
            </div>
          </form>
        ) : null}

        <div className="divide-y divide-ink-100">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-800">{user.name ?? user.email}</span>
                  <Badge tone={user.role === 'ADMIN' ? 'border-accent-200 bg-accent-50 text-accent-800' : undefined}>{titleCase(user.role)}</Badge>
                  {user.id === currentUserId ? <Badge>You</Badge> : null}
                  {user.disabled ? <Badge tone="border-rose-200 bg-rose-50 text-rose-700">Disabled</Badge> : null}
                </div>
                <p className="text-[11px] text-ink-500">{user.email}</p>
                <p className="text-[10px] text-ink-400">
                  Created {formatDate(user.createdAt)} · Last login {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'never'}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {user.id !== currentUserId ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `role-${user.id}`,
                          () => patchJson(`/api/users/${user.id}`, { role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' }),
                          'Role updated.',
                        )
                      }
                    >
                      {user.role === 'ADMIN' ? 'Make user' : 'Make admin'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        run(
                          `disable-${user.id}`,
                          () => patchJson(`/api/users/${user.id}`, { disabled: !user.disabled }),
                          user.disabled ? 'User enabled.' : 'User disabled and sessions revoked.',
                        )
                      }
                    >
                      {user.disabled ? 'Enable' : 'Disable'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => {
                        const password = window.prompt(`New password for ${user.email} (min 10 chars):`);
                        if (!password) return;
                        void run(`password-${user.id}`, () => patchJson(`/api/users/${user.id}`, { password }), 'Password reset.');
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      disabled={busy !== null}
                      onClick={() => {
                        if (!window.confirm(`Delete ${user.email} and all of their private data?`)) return;
                        void run(`delete-${user.id}`, () => clientApi(`/api/users/${user.id}`, { method: 'DELETE' }), 'User deleted.');
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {message ? <Notice tone="success">{message}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </CardBody>
    </Card>
  );
}

export function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Change password" description="Other sessions are revoked after a successful change." />
      <CardBody>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setMessage(null);
            try {
              await postJson('/api/auth/password', form);
              setMessage('Password changed.');
              setForm({ currentPassword: '', newPassword: '' });
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Current password">
            <input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required />
          </Field>
          <Field label="New password" hint="At least 10 characters.">
            <input className="input" type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} minLength={10} required />
          </Field>
          {message ? <div className="sm:col-span-2"><Notice tone="success">{message}</Notice></div> : null}
          {error ? <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
