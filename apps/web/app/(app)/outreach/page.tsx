import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { Contact, Job, OutreachMessage } from '@/lib/types';
import { formatDateTime, titleCase, statusTone } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  buttonClass,
  cn,
} from '@/components/ui';
import { NewOutreachForm } from '@/components/new-outreach-form';
import { MarkSentButton } from '@/components/mark-sent-button';

export const metadata = { title: 'Outreach' };

const FILTERS = ['', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'SENT', 'CANCELLED'];

export default async function OutreachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === 'string' ? params.status : '';
  const defaultContact = typeof params.contact === 'string' ? params.contact : undefined;
  const query = new URLSearchParams({ pageSize: '100' });
  if (status) query.set('status', status);
  const [data, contacts, jobs] = await Promise.all([
    safeApi<{ messages: OutreachMessage[]; total: number }>(`/api/outreach?${query.toString()}`),
    safeApi<{ contacts: Contact[] }>('/api/contacts?pageSize=100'),
    safeApi<{ jobs: Job[] }>('/api/jobs?pageSize=50&sort=newest'),
  ]);
  const messages = data?.messages ?? [];

  return (
    <PageShell>
      <PageHeader
        eyebrow="LinkedIn outreach"
        title="Outreach"
        description="Every draft is stored with its evidence. Approval prepares the message; you always press Send."
        actions={
          <NewOutreachForm
            contacts={contacts?.contacts ?? []}
            jobs={jobs?.jobs ?? []}
            defaultContact={defaultContact}
          />
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter || 'all'}
            href={`/outreach${filter ? `?status=${filter}` : ''}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              status === filter
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50',
            )}
          >
            {filter ? titleCase(filter) : 'All'}
          </Link>
        ))}
      </div>

      {messages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="No outreach messages"
            description="Add a contact, then draft a message tied to a specific job. It will appear in the approval inbox."
            action={<Link href="/contacts" className={buttonClass('secondary')}>Manage contacts</Link>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => {
            const warnings = Array.isArray(message.evidence?.warnings)
              ? (message.evidence.warnings as string[])
              : [];
            return (
              <Card key={message.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={statusTone(message.status)}>{titleCase(message.status)}</Badge>
                      <Badge>{titleCase(message.type)}</Badge>
                      {message.dryRun ? <Badge tone="border-indigo-200 bg-indigo-50 text-indigo-700">Dry run</Badge> : null}
                      <span className="text-[11px] text-ink-400">{formatDateTime(message.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-ink-900">
                      {message.contact?.name ?? 'Contact'}
                      {message.contact?.company ? <span className="font-normal text-ink-500"> · {message.contact.company}</span> : null}
                    </p>
                    {message.job ? (
                      <Link href={`/jobs/${message.job.id}`} className="link text-[11px]">
                        {message.job.title} at {message.job.company}
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {message.status === 'PENDING_APPROVAL' ? (
                      <Link href="/approvals/linkedin" className={buttonClass('primary', 'sm')}>
                        Review & approve
                      </Link>
                    ) : null}
                    {['APPROVED', 'SCHEDULED'].includes(message.status) ? (
                      <MarkSentButton outreachId={message.id} />
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-ink-100 bg-ink-50/50 p-3 text-xs leading-relaxed text-ink-700">
                  {message.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-ink-400">
                  <span>Model: {message.model}</span>
                  {message.sentAt ? <span>Sent {formatDateTime(message.sentAt)}</span> : null}
                  {message.contact?.linkedinUrl ? (
                    <a href={message.contact.linkedinUrl} target="_blank" rel="noreferrer" className="link">
                      Contact profile ↗
                    </a>
                  ) : null}
                  {warnings.length ? <span className="text-amber-600">{warnings.join(' ')}</span> : null}
                </div>
                {message.error ? <p className="mt-1 text-[11px] text-rose-700">{message.error}</p> : null}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
