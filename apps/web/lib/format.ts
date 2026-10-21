export function formatDate(value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(date);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function scoreTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-ink-100 text-ink-500 border-ink-200';
  if (score >= 90) return 'bg-accent-50 text-accent-800 border-accent-200';
  if (score >= 80) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 70) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (score >= 60) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function statusTone(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
    EXPIRED: 'bg-ink-100 text-ink-500 border-ink-200',
    CANCELLED: 'bg-ink-100 text-ink-500 border-ink-200',
    SENT: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    SCHEDULED: 'bg-sky-50 text-sky-800 border-sky-200',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
    DRAFT: 'bg-ink-100 text-ink-600 border-ink-200',
    READY_FOR_APPROVAL: 'bg-amber-50 text-amber-800 border-amber-200',
    APPLYING: 'bg-sky-50 text-sky-800 border-sky-200',
    SUBMITTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    INTERVIEW: 'bg-violet-50 text-violet-800 border-violet-200',
    FINAL_ROUND: 'bg-violet-50 text-violet-800 border-violet-200',
    OFFER: 'bg-accent-50 text-accent-800 border-accent-200',
    DISCOVERED: 'bg-ink-100 text-ink-600 border-ink-200',
    SHORTLISTED: 'bg-sky-50 text-sky-800 border-sky-200',
    TAILORING: 'bg-amber-50 text-amber-700 border-amber-200',
    HUMAN_REVIEW: 'bg-rose-50 text-rose-700 border-rose-200',
    ANSWERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    SIMULATED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    AWAITING_HUMAN: 'bg-amber-50 text-amber-800 border-amber-200',
    SUCCEEDED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    STRONG_APPLY: 'bg-accent-50 text-accent-800 border-accent-200',
    APPLY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW_PRIORITY: 'bg-orange-50 text-orange-700 border-orange-200',
    REJECT: 'bg-rose-50 text-rose-700 border-rose-200',
  };
  return map[status] ?? 'bg-ink-100 text-ink-600 border-ink-200';
}

export function salaryLabel(min?: number | null, max?: number | null, currency?: string | null): string {
  if (!min && !max) return 'Not posted';
  const format = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
  if (min && max && min !== max) return `${format(min)} – ${format(max)} ${currency ?? ''}`;
  return `${format((min ?? max)!)} ${currency ?? ''}`.trim();
}

export function truncate(value: string, length = 180): string {
  return value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'V';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
