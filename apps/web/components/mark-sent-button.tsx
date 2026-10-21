'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Notice } from './ui';

export function MarkSentButton({ outreachId }: { outreachId: string }) {
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
          if (!window.confirm('Confirm that you sent this message manually?')) return;
          setBusy(true);
          setError(null);
          try {
            await postJson(`/api/outreach/${outreachId}/mark-sent`);
            router.refresh();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Mark sent
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
