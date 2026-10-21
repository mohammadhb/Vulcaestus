'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare } from 'lucide-react';
import { postJson } from '@/lib/client';
import type { Contact } from '@/lib/types';
import { Button, Notice } from './ui';

const TYPES = [
  'REFERRAL_REQUEST',
  'CONNECTION_REQUEST',
  'RECRUITER_OUTREACH',
  'HIRING_MANAGER_OUTREACH',
  'FOLLOW_UP',
  'THANK_YOU',
  'POST_INTERVIEW_FOLLOW_UP',
];

export function OutreachTrigger({ jobId, contact }: { jobId: string; contact: Contact }) {
  const router = useRouter();
  const [type, setType] = useState(
    contact.category === 'RECRUITER'
      ? 'RECRUITER_OUTREACH'
      : contact.category === 'HIRING_MANAGER' || contact.category === 'ENGINEERING_MANAGER'
        ? 'HIRING_MANAGER_OUTREACH'
        : 'REFERRAL_REQUEST',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[220px] py-1.5 text-xs" value={type} onChange={(event) => setType(event.target.value)}>
          {TYPES.map((item) => (
            <option key={item} value={item}>
              {item.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await postJson(`/api/jobs/${jobId}/outreach`, { contactId: contact.id, type });
              setDone(true);
              router.refresh();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
          Draft message
        </Button>
      </div>
      {done ? <Notice tone="success">Draft created. Review it in the approval inbox.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
