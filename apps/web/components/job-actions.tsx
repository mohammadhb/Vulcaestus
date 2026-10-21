'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button, Notice } from './ui';

interface Result {
  application?: { id: string };
  score?: { overallScore: number; recommendation: string };
  tailoredResume?: { id: string };
  coverLetter?: { id: string };
  warnings?: string[];
}

export function JobActions({
  jobId,
  applicationId,
  hasResume,
}: {
  jobId: string;
  applicationId?: string | null;
  hasResume: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, path: string, body?: unknown) {
    setBusy(key);
    setMessage(null);
    setError(null);
    try {
      const result = await postJson<Result>(path, body);
      if (result.application?.id) {
        router.push(`/applications/${result.application.id}`);
        return;
      }
      if (result.score) {
        setMessage(`Score: ${result.score.overallScore}/100 (${result.score.recommendation.replace(/_/g, ' ')}).`);
      } else if (result.tailoredResume) {
        setMessage('Tailored resume generated. Review it below.');
      } else if (result.coverLetter) {
        setMessage('Cover letter generated. Review it below.');
      } else {
        setMessage('Done.');
      }
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy !== null} onClick={() => run('score', `/api/jobs/${jobId}/score`)}>
          {busy === 'score' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Score job
        </Button>
        <Button disabled={busy !== null || !hasResume} onClick={() => run('prepare', `/api/jobs/${jobId}/prepare`)}>
          {busy === 'prepare' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {applicationId ? 'Regenerate application package' : 'Prepare application'}
        </Button>
        <Button variant="secondary" disabled={busy !== null || !hasResume} onClick={() => run('tailor', `/api/jobs/${jobId}/tailor`)}>
          {busy === 'tailor' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Tailor resume
        </Button>
        <Button variant="secondary" disabled={busy !== null || !hasResume} onClick={() => run('cover', `/api/jobs/${jobId}/cover-letter`)}>
          {busy === 'cover' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Cover letter
        </Button>
      </div>
      {!hasResume ? <Notice tone="warning">Upload a master resume before generating documents.</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
