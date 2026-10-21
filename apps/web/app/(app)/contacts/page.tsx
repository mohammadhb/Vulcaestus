import Link from 'next/link';
import { Search, Users } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { Contact } from '@/lib/types';
import { formatDate, scoreTone, titleCase } from '@/lib/format';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  PageShell,
  buttonClass,
} from '@/components/ui';
import { ContactForm } from '@/components/contact-form';
import { DeleteContactButton, ImportContacts } from '@/components/contact-tools';

export const metadata = { title: 'Contacts' };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['q', 'company', 'category']) {
    const value = params[key];
    if (typeof value === 'string' && value) query.set(key, value);
  }
  query.set('pageSize', '100');
  const data = await safeApi<{ contacts: Contact[]; total: number }>(`/api/contacts?${query.toString()}`);
  const contacts = data?.contacts ?? [];

  const categories = [
    'HIRING_MANAGER',
    'RECRUITER',
    'ENGINEERING_MANAGER',
    'TEAM_MEMBER',
    'ALUMNI',
    'FORMER_COLLEAGUE',
    'MUTUAL_CONNECTION',
    'SECOND_DEGREE',
    'OTHER',
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Referrals"
        title="Contacts"
        description="People you know or have verified. Ranking and message generation use only what you enter here."
        actions={
          <>
            <ImportContacts />
            <ContactForm />
          </>
        }
      />

      <Card className="mb-5">
        <form className="grid gap-3 p-4 sm:grid-cols-[1fr_220px_200px_auto]" action="/contacts" method="get">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              name="q"
              defaultValue={typeof params.q === 'string' ? params.q : ''}
              className="input pl-9"
              placeholder="Name, company, or title"
            />
          </label>
          <input
            name="company"
            defaultValue={typeof params.company === 'string' ? params.company : ''}
            className="input"
            placeholder="Company"
          />
          <select name="category" defaultValue={typeof params.category === 'string' ? params.category : ''} className="input">
            <option value="">Any category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {titleCase(category)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass('primary')}>
              Filter
            </button>
            <Link href="/contacts" className={buttonClass('ghost')}>
              Reset
            </Link>
          </div>
        </form>
      </Card>

      {contacts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No contacts yet"
            description="Add people you actually know at target companies, or import a CSV. The system never scrapes LinkedIn."
            action={<ContactForm />}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((contact) => (
            <Card key={contact.id} className="flex h-full flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{contact.name}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {contact.title ?? 'Title unknown'}
                  </p>
                  <p className="truncate text-xs text-ink-700">{contact.company}</p>
                </div>
                <Badge tone={scoreTone(contact.relevanceScore)}>{contact.relevanceScore}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge>{titleCase(contact.category)}</Badge>
                <Badge
                  tone={
                    contact.verified
                      ? 'border-accent-200 bg-accent-50 text-accent-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }
                >
                  {contact.verified ? 'Verified' : 'Unverified'}
                </Badge>
              </div>
              {contact.reason ? <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-ink-500">{contact.reason}</p> : null}
              {contact.notes ? <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-400">{contact.notes}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {contact.linkedinUrl ? (
                  <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="link text-[11px]">
                    LinkedIn ↗
                  </a>
                ) : null}
                {contact.email ? <span className="text-[11px] text-ink-400">{contact.email}</span> : null}
                <span className="ml-auto text-[10px] text-ink-400">{formatDate(contact.createdAt)}</span>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
                <Link href={`/outreach?contact=${contact.id}`} className="link text-[11px]">
                  Draft outreach
                </Link>
                <DeleteContactButton contactId={contact.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
