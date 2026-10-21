'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Radar } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Notice } from './ui';

interface DiscoverResponse {
  created: number;
  results: Array<{ source: string; created: number; fetched: number; error?: string }>;
}

export function DiscoverButton({ sourceId, label = 'Discover jobs' }: { sourceId?: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={sourceId ? 'secondary' : 'primary'}
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setMessage(null);
          setError(null);
          try {
            const result = await postJson<DiscoverResponse>('/api/jobs/discover', sourceId ? { sourceId } : {});
            const failed = result.results.filter((item) => item.error);
            setMessage(
              result.results.length === 0
                ? 'No enabled sources. Configure one in Settings.'
                : `${result.created} new job(s). ${failed.length ? `${failed.length} source(s) reported issues.` : 'Sources completed.'}`,
            );
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        {loading ? 'Searching…' : label}
      </Button>
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
