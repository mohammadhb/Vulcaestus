'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, Loader2 } from 'lucide-react';
import { postJson } from '@/lib/client';
import type { ApprovalRequest } from '@/lib/types';
import { Button, Notice } from './ui';
import { ApprovalCard } from './approval-card';

export function ApprovalInbox({
  approvals,
  mode = 'linkedin',
}: {
  approvals: ApprovalRequest[];
  mode?: 'linkedin' | 'application' | 'followup' | 'human';
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const safeActions = approvals.filter((approval) =>
    ['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST', 'FOLLOWUP'].includes(approval.type),
  );

  if (approvals.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <p className="text-sm font-semibold text-ink-800">Nothing waiting here</p>
        <p className="mt-1 text-xs text-ink-500">
          Prepared messages and applications will appear in this inbox for explicit approval.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {safeActions.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-2.5 shadow-sm">
          <p className="text-xs text-ink-600">
            {selectedIds.length} selected · bulk approval only applies to outreach and follow-up actions
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelected(new Set(safeActions.map((approval) => approval.id)))}
            >
              Select safe actions
            </Button>
            <Button
              size="sm"
              disabled={busy || selectedIds.length === 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                setResult(null);
                try {
                  const response = await postJson<{
                    approved: string[];
                    failed: Array<{ id: string; error: string }>;
                    skipped: string[];
                  }>('/api/approvals/bulk-approve', { approvalIds: selectedIds });
                  setResult(
                    `${response.approved.length} approved, ${response.skipped.length} skipped, ${response.failed.length} failed.`,
                  );
                  setSelected(new Set());
                  router.refresh();
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              Approve selected
            </Button>
          </div>
        </div>
      ) : null}
      {result ? <Notice tone="success">{result}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          mode={mode}
          selected={selected.has(approval.id)}
          onSelectedChange={
            ['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST', 'FOLLOWUP'].includes(approval.type)
              ? (value) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (value) next.add(approval.id);
                    else next.delete(approval.id);
                    return next;
                  });
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}
