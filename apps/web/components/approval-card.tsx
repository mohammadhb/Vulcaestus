'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Edit3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { clientApi, patchJson, postJson } from '@/lib/client';
import type { ApprovalRequest } from '@/lib/types';
import { formatDateTime, titleCase } from '@/lib/format';
import { Badge, Button, Notice, buttonClass } from './ui';

export function ApprovalCard({
  approval,
  mode = 'linkedin',
  selected,
  onSelectedChange,
}: {
  approval: ApprovalRequest;
  mode?: 'linkedin' | 'application' | 'followup' | 'human';
  selected?: boolean;
  onSelectedChange?: (value: boolean) => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState(approval.content);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const metadata = approval.metadata ?? {};
  const contactName = typeof metadata.contactName === 'string' ? metadata.contactName : null;
  const contactTitle = typeof metadata.contactTitle === 'string' ? metadata.contactTitle : null;
  const company = typeof metadata.company === 'string' ? metadata.company : null;
  const jobTitle = typeof metadata.jobTitle === 'string' ? metadata.jobTitle : null;
  const jobId = typeof metadata.jobId === 'string' ? metadata.jobId : null;
  const applicationId = typeof metadata.applicationId === 'string' ? metadata.applicationId : null;
  const score = typeof metadata.score === 'number' ? metadata.score : null;
  const risks = Array.isArray(metadata.risks) ? (metadata.risks as string[]) : [];
  const missing = Array.isArray(metadata.missingRequirements) ? (metadata.missingRequirements as string[]) : [];
  const humanReview = Array.isArray(metadata.humanReviewQuestions)
    ? (metadata.humanReviewQuestions as string[])
    : [];
  const relationship = typeof metadata.relationship === 'string' ? metadata.relationship : null;
  const verified = metadata.relationshipVerified === true;
  const evidence = Array.isArray(metadata.evidence) ? (metadata.evidence as string[]) : [];
  const warnings = Array.isArray(metadata.warnings) ? (metadata.warnings as string[]) : [];
  const dryRun = metadata.dryRun === true;

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    setWarning(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'warning' in result) {
        const value = (result as { warning?: string }).warning;
        if (value) setWarning(value);
      }
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const isOutreach = mode === 'linkedin';
  const canRegenerate = approval.type === 'LINKEDIN_MESSAGE' || approval.type === 'REFERRAL_REQUEST';

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/40 px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {onSelectedChange ? (
              <input
                type="checkbox"
                checked={Boolean(selected)}
                onChange={(event) => onSelectedChange(event.target.checked)}
                className="mr-1 h-3.5 w-3.5 rounded border-ink-300"
                aria-label="Select approval"
              />
            ) : null}
            <Badge tone={approval.priority >= 90 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-ink-200 bg-white text-ink-600'}>
              {titleCase(approval.type)}
            </Badge>
            {approval.priority >= 90 ? <Badge tone="border-rose-200 bg-rose-50 text-rose-700">High priority</Badge> : null}
            {dryRun ? <Badge tone="border-indigo-200 bg-indigo-50 text-indigo-700">Dry run</Badge> : null}
            {typeof metadata.messageType === 'string' ? <Badge>{titleCase(metadata.messageType)}</Badge> : null}
          </div>
          <h3 className="mt-1.5 text-base font-semibold tracking-tight text-ink-900">
            {contactName ?? approval.title}
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            {[contactTitle, company].filter(Boolean).join(' · ') || approval.title}
          </p>
        </div>
        <div className="text-right text-[11px] text-ink-400">
          <p>{formatDateTime(approval.createdAt)}</p>
          {approval.expiresAt ? <p className="mt-0.5">Expires {formatDateTime(approval.expiresAt)}</p> : null}
        </div>
      </header>

      <div className="space-y-3 px-5 py-4">
        {mode === 'application' || mode === 'human' ? (
          <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3 text-xs leading-relaxed text-ink-700">
            <p className="whitespace-pre-wrap">{approval.content}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {score !== null ? <Badge tone="border-accent-200 bg-accent-50 text-accent-800">Score {score}</Badge> : null}
              {jobTitle ? <Badge>{jobTitle}</Badge> : null}
              {humanReview.length ? <Badge tone="border-rose-200 bg-rose-50 text-rose-700">{humanReview.length} human review</Badge> : null}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
              {relationship ? (
                <span>
                  Relationship: <strong className="text-ink-700">{relationship}</strong>{' '}
                  {verified ? (
                    <span className="text-accent-700">(verified)</span>
                  ) : (
                    <span className="text-amber-700">(unverified)</span>
                  )}
                </span>
              ) : (
                <span className="text-amber-700">Relationship not verified</span>
              )}
              {jobTitle ? (
                <span>
                  Role: <strong className="text-ink-700">{jobTitle}</strong>
                </span>
              ) : null}
              {score !== null ? <span>Match score: {score}</span> : null}
            </div>
            {jobId ? (
              <Link href={`/jobs/${jobId}`} className="link inline-flex items-center gap-1 text-[11px]">
                Open related job <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
            <label className="block">
              <span className="label">Message</span>
              <textarea
                className="input min-h-32 font-normal leading-relaxed"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void act('approve', () => postJson(`/api/approvals/${approval.id}/approve`));
                  }
                }}
              />
              <span className="mt-1 block text-[10px] text-ink-400">
                {content.length} characters · ⌘/Ctrl + Enter to approve
              </span>
            </label>
            {evidence.length ? (
              <details className="rounded-lg border border-ink-200 p-2.5 text-[11px] text-ink-600">
                <summary className="cursor-pointer font-semibold">Evidence used</summary>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {[...warnings, ...risks].length ? (
              <Notice tone="warning">
                <span className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{[...warnings, ...risks].join(' ')}</span>
                </span>
              </Notice>
            ) : null}
          </>
        )}

        {mode === 'application' && (missing.length > 0 || risks.length > 0) ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {missing.length ? (
              <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-2.5 text-[11px] text-rose-800">
                <p className="font-semibold">Missing requirements</p>
                <p className="mt-1">{missing.join(', ')}</p>
              </div>
            ) : null}
            {risks.length ? (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5 text-[11px] text-amber-900">
                <p className="font-semibold">Risks</p>
                <p className="mt-1">{risks.join(' ')}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === 'application' && applicationId ? (
          <Link href={`/applications/${applicationId}`} className="link inline-flex items-center gap-1 text-xs">
            Open application details <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}

        {error ? <Notice tone="danger">{error}</Notice> : null}
        {warning ? <Notice tone="warning">{warning}</Notice> : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <Button
            disabled={busy !== null}
            onClick={() => act('approve', () => postJson(`/api/approvals/${approval.id}/approve`))}
          >
            {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isOutreach ? 'Approve & prepare send' : 'Approve'}
          </Button>
          {isOutreach ? (
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() =>
                act('save', () =>
                  patchJson(`/api/approvals/${approval.id}`, {
                    content,
                  }),
                )
              }
            >
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
              Save edit
            </Button>
          ) : null}
          {canRegenerate ? (
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => act('regen', () => postJson(`/api/approvals/${approval.id}/regenerate`))}
            >
              {busy === 'regen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Regenerate
            </Button>
          ) : null}
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => act('postpone', () => postJson(`/api/approvals/${approval.id}/postpone`, { hours: 24 }))}
          >
            <CalendarClock className="h-4 w-4" /> Postpone 24h
          </Button>
          <Button
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50"
            disabled={busy !== null}
            onClick={() => {
              const note = window.prompt('Reason for rejecting (optional):') ?? undefined;
              void act('reject', () => postJson(`/api/approvals/${approval.id}/reject`, { note }));
            }}
          >
            {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Reject
          </Button>
          {applicationId ? (
            <Link href={`/applications/${applicationId}`} className={buttonClass('ghost', 'sm')}>
              <Send className="h-3.5 w-3.5" /> Details
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
