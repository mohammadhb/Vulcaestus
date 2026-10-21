'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2, Upload } from 'lucide-react';
import { clientApi, postJson } from '@/lib/client';
import { Button, Field, Notice } from './ui';

export function DeleteContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-rose-600 hover:bg-rose-50"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm('Remove this contact? Existing outreach records are kept.')) return;
        setBusy(true);
        try {
          await clientApi(`/api/contacts/${contactId}`, { method: 'DELETE' });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
      Remove
    </Button>
  );
}

export function ImportContacts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('name,company,title,linkedin_url,email,category,relationship,notes\n');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" /> Import CSV
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
        setMessage(null);
        try {
          const result = await postJson<{ created: number; skipped: number }>('/api/contacts/import', { csv });
          setMessage(`Imported ${result.created} contact(s); ${result.skipped} skipped.`);
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Import contacts from CSV</p>
        <button type="button" className="text-xs text-ink-500 hover:underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <Field label="CSV content" hint="Required columns: name, company. Relationship is marked verified only when provided.">
        <textarea className="input min-h-40 font-mono text-[11px]" value={csv} onChange={(event) => setCsv(event.target.value)} />
      </Field>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Importing…' : 'Import contacts'}
        </Button>
      </div>
    </form>
  );
}
