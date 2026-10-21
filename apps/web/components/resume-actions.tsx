'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Star, Trash2 } from 'lucide-react';
import { clientApi, patchJson, postJson } from '@/lib/client';
import { Button, Notice } from './ui';

export function ResumeActions({ resumeId, isMaster }: { resumeId: string; isMaster: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'warning' in result) {
        const warning = (result as { warning?: string }).warning;
        setMessage(warning ?? success);
      } else {
        setMessage(success);
      }
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => run('structure', () => postJson(`/api/resumes/${resumeId}/structure`), 'Structure improved.')}
        >
          {busy === 'structure' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Improve structure with AI
        </Button>
        {!isMaster ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => run('master', () => patchJson(`/api/resumes/${resumeId}`, { isMaster: true }), 'Master resume updated.')}
          >
            {busy === 'master' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
            Make master
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="text-rose-600 hover:bg-rose-50"
          disabled={busy !== null}
          onClick={async () => {
            if (!window.confirm('Delete this resume? Tailored versions already generated are kept.')) return;
            setBusy('delete');
            try {
              await clientApi(`/api/resumes/${resumeId}`, { method: 'DELETE' });
              router.refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Delete
        </Button>
      </div>
      {message ? <Notice tone="info">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
