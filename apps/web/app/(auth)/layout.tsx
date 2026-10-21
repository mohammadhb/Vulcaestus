import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_10%,rgba(33,162,127,0.45),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(91,107,135,0.5),transparent_45%)]" />
        <div className="relative">
          <img
            src="/brand/vulcaestus-logo-light.png"
            alt="Vulcaestus"
            className="h-48 w-48 object-contain"
          />
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-400">
            Private job search infrastructure
          </p>
          <h1 className="mt-8 max-w-md text-4xl font-bold leading-tight tracking-tight text-balance">
            A private job search that prepares, but never acts without you.
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-ink-300">
            Discovery, scoring, tailored resumes, referrals, and outreach in one self-hosted workspace.
            Every message and application waits for your approval.
          </p>
        </div>
        <div className="relative grid max-w-md grid-cols-2 gap-3 text-xs text-ink-300">
          {[
            'Evidence-only AI tailoring',
            'Human approval inbox',
            'Dry-run by default',
            'No LinkedIn scraping',
          ].map((item) => (
            <div key={item} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur">
              {item}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <img src="/brand/vulcaestus-mark-dark.png" alt="" className="h-9 w-9 object-contain" />
            <span className="text-lg font-semibold tracking-tight">Vulcaestus</span>
          </div>
          {children}
          <p className="mt-8 text-center text-[11px] text-ink-400">
            Self-hosted. Your resumes and application history stay on your server.{' '}
            <Link href="https://github.com" className="hidden" aria-hidden>
              .
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
