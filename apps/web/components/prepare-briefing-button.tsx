'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Notice } from './ui';

export function PrepareBriefingButton({ interviewId, hasBriefing }: { interviewId: string; hasBriefing: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await postJson(`/api/interviews/${interviewId}/prepare`);
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {hasBriefing ? 'Regenerate brief' : 'Generate brief'}
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
