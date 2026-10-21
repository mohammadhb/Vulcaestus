'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { patchJson } from '@/lib/client';
import type { ApplicationAnswer } from '@/lib/types';
import { statusTone, titleCase } from '@/lib/format';
import { Badge, Button, Notice } from './ui';

export function AnswersEditor({
  applicationId,
  answers,
}: {
  applicationId: string;
  answers: ApplicationAnswer[];
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>(
    Object.fromEntries(answers.map((answer) => [answer.id, answer.answer])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (answers.length === 0) {
    return <p className="text-xs text-ink-400">No application questions have been prepared yet.</p>;
  }

  return (
    <div className="space-y-3">
      {answers.map((answer) => (
        <div key={answer.id} className="rounded-lg border border-ink-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="max-w-2xl text-xs font-semibold text-ink-800">{answer.question}</p>
            <div className="flex gap-1.5">
              <Badge tone={statusTone(answer.status)}>{titleCase(answer.status)}</Badge>
              {answer.sensitive ? <Badge tone="border-rose-200 bg-rose-50 text-rose-700">Sensitive</Badge> : null}
            </div>
          </div>
          <textarea
            className="input mt-2 min-h-16 text-xs"
            value={edits[answer.id] ?? ''}
            onChange={(event) => setEdits({ ...edits, [answer.id]: event.target.value })}
            placeholder="No confident answer. Edit before submitting."
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-ink-400">Source: {answer.source}</p>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(answer.id);
                setError(null);
                setMessage(null);
                try {
                  await patchJson(`/api/applications/${applicationId}/answers/${answer.id}`, {
                    answer: edits[answer.id] ?? '',
                    status: 'ANSWERED',
                  });
                  setMessage('Answer saved.');
                  router.refresh();
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === answer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save answer
            </Button>
          </div>
        </div>
      ))}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
