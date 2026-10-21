import Link from 'next/link';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
type ButtonSize = 'sm' | 'md';

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-ink-900 text-white shadow-sm hover:bg-ink-800',
    secondary: 'border border-ink-200 bg-white text-ink-700 shadow-sm hover:bg-ink-50',
    ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    warning: 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  };
  return cn(base, sizes, variants[variant], extra);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
  target,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  target?: string;
}) {
  const external = href.startsWith('http');
  if (external) {
    return (
      <a href={href} target={target ?? '_blank'} rel="noreferrer" className={buttonClass(variant, size, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, size, className)} target={target}>
      {children}
    </Link>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('card', className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function Badge({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        tone ?? 'border-ink-200 bg-ink-50 text-ink-600',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: 'green' | 'amber' | 'violet' | 'blue' | 'rose';
  href?: string;
}) {
  const tone: Record<string, string> = {
    green: 'from-accent-50 to-white border-accent-100',
    amber: 'from-amber-50 to-white border-amber-100',
    violet: 'from-violet-50 to-white border-violet-100',
    blue: 'from-sky-50 to-white border-sky-100',
    rose: 'from-rose-50 to-white border-rose-100',
  };
  const content = (
    <div
      className={cn(
        'card h-full bg-gradient-to-br p-4 transition hover:shadow-md',
        accent ? tone[accent] : 'from-white to-white border-ink-200/80',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-300">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'amber' | 'rose' | 'sky' }) {
  const colors = {
    accent: 'bg-accent-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div className={cn('h-full rounded-full transition-all', colors[tone])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    success: 'border-accent-200 bg-accent-50 text-accent-900',
  };
  return <div className={cn('rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed', tones[tone])}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 py-2 last:border-0">
      <dt className="text-xs font-medium text-ink-500">{label}</dt>
      <dd className="text-right text-xs font-medium text-ink-800">{children}</dd>
    </div>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="animate-in mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>;
}
