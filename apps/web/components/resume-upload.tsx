'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UploadCloud } from 'lucide-react';
import { clientApi } from '@/lib/client';
import { Button, Notice } from './ui';

export function ResumeUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [master, setMaster] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!file) return;
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
          const body = new FormData();
          body.append('file', file);
          const result = await clientApi<{ resume: { id: string }; note: string }>(
            `/api/resumes${master ? '?master=true' : ''}`,
            { method: 'POST', body },
          );
          setMessage(result.note);
          setFile(null);
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-ink-300 bg-ink-50/50 px-6 py-10 text-center transition hover:border-accent-400 hover:bg-accent-50/30">
        <UploadCloud className="h-8 w-8 text-ink-400" />
        <span className="mt-3 text-sm font-semibold text-ink-800">
          {file ? file.name : 'Choose a resume file'}
        </span>
        <span className="mt-1 text-xs text-ink-500">PDF, DOCX, Markdown, or plain text · max 10 MB</span>
        <input
          type="file"
          accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
          className="sr-only"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-600">
        <input type="checkbox" checked={master} onChange={(event) => setMaster(event.target.checked)} />
        Use as master resume (replaces the previous master flag)
      </label>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button type="submit" disabled={!file || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
        {busy ? 'Extracting…' : 'Upload resume'}
      </Button>
    </form>
  );
}
