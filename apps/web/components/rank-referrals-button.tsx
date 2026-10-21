'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Notice } from './ui';

export function RankReferralsButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          setMessage(null);
          try {
            const result = await postJson<{ contacts: unknown[]; note: string }>(`/api/jobs/${jobId}/referrals`);
            setMessage(result.note);
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
        Rank contacts
      </Button>
      {message ? <Notice tone="info">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
