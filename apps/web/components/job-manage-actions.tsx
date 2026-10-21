'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { clientApi, postJson } from '@/lib/client';
import { Button, Notice } from './ui';

export function JobManageActions({
  jobId,
  archived,
  deleted,
}: {
  jobId: string;
  archived: boolean;
  deleted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, navigateAway = false) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (navigateAway) router.push('/jobs?view=deleted');
      else router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {deleted ? (
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run('restore', () => postJson(`/api/jobs/${jobId}/restore`))}>
            {busy === 'restore' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Restore
          </Button>
        ) : (
          <>
            {archived ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run('unarchive', () => clientApi(`/api/jobs/${jobId}/archive`, { method: 'DELETE' }))}
              >
                {busy === 'unarchive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                Unarchive
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run('archive', () => postJson(`/api/jobs/${jobId}/archive`))}
              >
                {busy === 'archive' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600 hover:bg-rose-50"
              disabled={busy !== null}
              onClick={() => {
                if (!window.confirm('Delete this job? It can be restored from Jobs → Deleted.')) return;
                void run('delete', () => clientApi(`/api/jobs/${jobId}`, { method: 'DELETE' }), true);
              }}
            >
              {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          </>
        )}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
