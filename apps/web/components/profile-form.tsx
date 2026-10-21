'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, ShieldAlert } from 'lucide-react';
import { clientApi } from '@/lib/client';
import type { Profile } from '@/lib/types';
import { Button, Card, CardBody, CardHeader, Field, Notice } from './ui';

const arrayFields = [
  'targetTitles',
  'alternativeTitles',
  'targetCountries',
  'targetCities',
  'employmentTypes',
  'industries',
  'priorityCompanies',
  'excludedCompanies',
  'technologies',
  'languages',
  'authorizedCountries',
] as const;

type FormState = Record<string, string | boolean>;

function initialState(profile: Profile | null, email: string, name: string): FormState {
  const state: FormState = {
    fullName: profile?.fullName ?? name,
    email: profile?.email ?? email,
    phone: profile?.phone ?? '',
    location: profile?.location ?? '',
    country: profile?.country ?? '',
    linkedinUrl: profile?.linkedinUrl ?? '',
    githubUrl: profile?.githubUrl ?? '',
    portfolioUrl: profile?.portfolioUrl ?? '',
    headline: profile?.headline ?? '',
    summary: profile?.summary ?? '',
    yearsExperience: profile?.yearsExperience?.toString() ?? '',
    remotePreference: profile?.remotePreference ?? 'REMOTE',
    minimumSalary: profile?.minimumSalary?.toString() ?? '',
    preferredSalary: profile?.preferredSalary?.toString() ?? '',
    currency: profile?.currency ?? 'EUR',
    seniority: profile?.seniority ?? 'UNKNOWN',
    workAuthorization: profile?.workAuthorization ?? '',
    sponsorshipRequired: profile?.sponsorshipRequired ?? false,
    sponsorshipAcceptable: profile?.sponsorshipAcceptable ?? true,
    relocationPreference: profile?.relocationPreference ?? '',
    minimumJobScore: String(profile?.minimumJobScore ?? 70),
    tailorThreshold: String(profile?.tailorThreshold ?? 80),
    autoApplyThreshold: String(profile?.autoApplyThreshold ?? 90),
    coverLettersRequired: profile?.coverLettersRequired ?? true,
    prioritizeReferrals: profile?.prioritizeReferrals ?? true,
    dailyApplicationLimit: String(profile?.dailyApplicationLimit ?? 10),
    dailyOutreachLimit: String(profile?.dailyOutreachLimit ?? 20),
    automationMode: profile?.automationMode ?? 'SAFE_MODE',
    timezone: profile?.timezone ?? 'Europe/Berlin',
  };
  for (const field of arrayFields) {
    state[field] = (profile?.[field] ?? []).join(', ');
  }
  return state;
}

export function ProfileForm({ profile, email, name }: { profile: Profile | null; email: string; name: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(profile, email, name));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isNew = !profile;

  const automationWarning = useMemo(() => {
    if (form.automationMode === 'AUTONOMOUS_MODE') {
      return 'Autonomous mode only affects explicitly configured categories. Applications still require approval unless you deliberately change that boundary in code/config.';
    }
    if (form.automationMode === 'ASSISTED_MODE') {
      return 'Assisted mode allows low-risk repetitive actions to run automatically. Messages and submissions still require approval.';
    }
    return 'Safe mode: every external action requires approval.';
  }, [form.automationMode]);

  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
          const payload: Record<string, unknown> = {
            fullName: form.fullName,
            email: form.email,
            phone: form.phone || null,
            location: form.location || null,
            country: form.country || null,
            linkedinUrl: form.linkedinUrl || null,
            githubUrl: form.githubUrl || null,
            portfolioUrl: form.portfolioUrl || null,
            headline: form.headline || null,
            summary: form.summary || null,
            yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
            remotePreference: form.remotePreference,
            minimumSalary: form.minimumSalary ? Number(form.minimumSalary) : null,
            preferredSalary: form.preferredSalary ? Number(form.preferredSalary) : null,
            currency: form.currency,
            seniority: form.seniority,
            workAuthorization: form.workAuthorization || null,
            sponsorshipRequired: form.sponsorshipRequired,
            sponsorshipAcceptable: form.sponsorshipAcceptable,
            relocationPreference: form.relocationPreference || null,
            minimumJobScore: Number(form.minimumJobScore),
            tailorThreshold: Number(form.tailorThreshold),
            autoApplyThreshold: Number(form.autoApplyThreshold),
            coverLettersRequired: form.coverLettersRequired,
            prioritizeReferrals: form.prioritizeReferrals,
            dailyApplicationLimit: Number(form.dailyApplicationLimit),
            dailyOutreachLimit: Number(form.dailyOutreachLimit),
            automationMode: form.automationMode,
            timezone: form.timezone,
          };
          for (const field of arrayFields) {
            payload[field] = String(form[field] ?? '')
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean);
          }
          await clientApi('/api/profile', { method: 'PUT', body: JSON.stringify(payload) });
          setMessage('Profile saved.');
          router.refresh();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {isNew ? (
        <Notice tone="info">This is your initial profile. Scoring is unavailable until you save it.</Notice>
      ) : null}

      <Card>
        <CardHeader title="Personal details" description="Used in documents and application forms." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input className="input" value={String(form.fullName)} onChange={(event) => set('fullName', event.target.value)} required />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={String(form.email)} onChange={(event) => set('email', event.target.value)} required />
          </Field>
          <Field label="Phone">
            <input className="input" value={String(form.phone)} onChange={(event) => set('phone', event.target.value)} />
          </Field>
          <Field label="Location">
            <input className="input" value={String(form.location)} onChange={(event) => set('location', event.target.value)} placeholder="Berlin, Germany" />
          </Field>
          <Field label="Country">
            <input className="input" value={String(form.country)} onChange={(event) => set('country', event.target.value)} />
          </Field>
          <Field label="Years of experience" hint="If empty, estimated from resume dates.">
            <input className="input" type="number" step="0.5" min="0" max="70" value={String(form.yearsExperience)} onChange={(event) => set('yearsExperience', event.target.value)} />
          </Field>
          <Field label="LinkedIn URL">
            <input className="input" type="url" value={String(form.linkedinUrl)} onChange={(event) => set('linkedinUrl', event.target.value)} />
          </Field>
          <Field label="GitHub URL">
            <input className="input" type="url" value={String(form.githubUrl)} onChange={(event) => set('githubUrl', event.target.value)} />
          </Field>
          <Field label="Portfolio URL">
            <input className="input" type="url" value={String(form.portfolioUrl)} onChange={(event) => set('portfolioUrl', event.target.value)} />
          </Field>
          <Field label="Headline">
            <input className="input" value={String(form.headline)} onChange={(event) => set('headline', event.target.value)} placeholder="Senior Backend Engineer" />
          </Field>
          <Field label="Professional summary" className="sm:col-span-2" hint="Only facts you can support in your resume. The AI will not add metrics.">
            <textarea className="input min-h-24" value={String(form.summary)} onChange={(event) => set('summary', event.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Job preferences"
          description="Comma-separated lists. Used deterministically for scoring; AI cannot invent matches."
        />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Target titles">
            <input className="input" value={String(form.targetTitles)} onChange={(event) => set('targetTitles', event.target.value)} placeholder="Backend Engineer, Platform Engineer" />
          </Field>
          <Field label="Alternative titles">
            <input className="input" value={String(form.alternativeTitles)} onChange={(event) => set('alternativeTitles', event.target.value)} />
          </Field>
          <Field label="Target countries">
            <input className="input" value={String(form.targetCountries)} onChange={(event) => set('targetCountries', event.target.value)} placeholder="Germany, Netherlands" />
          </Field>
          <Field label="Target cities">
            <input className="input" value={String(form.targetCities)} onChange={(event) => set('targetCities', event.target.value)} placeholder="Berlin, Amsterdam" />
          </Field>
          <Field label="Work mode">
            <select className="input" value={String(form.remotePreference)} onChange={(event) => set('remotePreference', event.target.value)}>
              {['REMOTE', 'HYBRID', 'ONSITE', 'UNKNOWN'].map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Seniority">
            <select className="input" value={String(form.seniority)} onChange={(event) => set('seniority', event.target.value)}>
              {['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'STAFF', 'PRINCIPAL', 'DIRECTOR', 'EXECUTIVE', 'UNKNOWN'].map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minimum salary">
            <input className="input" type="number" min="0" value={String(form.minimumSalary)} onChange={(event) => set('minimumSalary', event.target.value)} />
          </Field>
          <Field label="Preferred salary">
            <input className="input" type="number" min="0" value={String(form.preferredSalary)} onChange={(event) => set('preferredSalary', event.target.value)} />
          </Field>
          <Field label="Currency">
            <input className="input" maxLength={3} value={String(form.currency)} onChange={(event) => set('currency', event.target.value.toUpperCase())} />
          </Field>
          <Field label="Employment types">
            <input className="input" value={String(form.employmentTypes)} onChange={(event) => set('employmentTypes', event.target.value)} placeholder="FULL_TIME, CONTRACT" />
          </Field>
          <Field label="Industries">
            <input className="input" value={String(form.industries)} onChange={(event) => set('industries', event.target.value)} />
          </Field>
          <Field label="Priority companies">
            <input className="input" value={String(form.priorityCompanies)} onChange={(event) => set('priorityCompanies', event.target.value)} />
          </Field>
          <Field label="Excluded companies">
            <input className="input" value={String(form.excludedCompanies)} onChange={(event) => set('excludedCompanies', event.target.value)} />
          </Field>
          <Field label="Technologies / skills" hint="The strongest evidence used for matching. Keep it accurate.">
            <input className="input" value={String(form.technologies)} onChange={(event) => set('technologies', event.target.value)} placeholder="TypeScript, Node.js, PostgreSQL, AWS" />
          </Field>
          <Field label="Languages">
            <input className="input" value={String(form.languages)} onChange={(event) => set('languages', event.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Work authorization" description="Used to flag sponsorship and relocation risk. Unknown values stay neutral." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Current authorization">
            <input className="input" value={String(form.workAuthorization)} onChange={(event) => set('workAuthorization', event.target.value)} placeholder="EU citizen / Blue Card / requires sponsorship" />
          </Field>
          <Field label="Authorized countries">
            <input className="input" value={String(form.authorizedCountries)} onChange={(event) => set('authorizedCountries', event.target.value)} placeholder="Germany, Netherlands" />
          </Field>
          <Field label="Relocation preference">
            <input className="input" value={String(form.relocationPreference)} onChange={(event) => set('relocationPreference', event.target.value)} placeholder="Open within EU" />
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={Boolean(form.sponsorshipRequired)} onChange={(event) => set('sponsorshipRequired', event.target.checked)} />
              I require visa sponsorship
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={Boolean(form.sponsorshipAcceptable)} onChange={(event) => set('sponsorshipAcceptable', event.target.checked)} />
              Sponsorship is acceptable
            </label>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Application preferences" description="Thresholds and limits are enforced server-side." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum job score" hint="Below this, the role is low priority.">
            <input className="input" type="number" min="0" max="100" value={String(form.minimumJobScore)} onChange={(event) => set('minimumJobScore', event.target.value)} />
          </Field>
          <Field label="Tailoring threshold" hint="Generate a tailored resume at or above this score.">
            <input className="input" type="number" min="0" max="100" value={String(form.tailorThreshold)} onChange={(event) => set('tailorThreshold', event.target.value)} />
          </Field>
          <Field label="Strong-apply threshold">
            <input className="input" type="number" min="0" max="100" value={String(form.autoApplyThreshold)} onChange={(event) => set('autoApplyThreshold', event.target.value)} />
          </Field>
          <Field label="Daily application limit">
            <input className="input" type="number" min="0" max="100" value={String(form.dailyApplicationLimit)} onChange={(event) => set('dailyApplicationLimit', event.target.value)} />
          </Field>
          <Field label="Daily outreach limit">
            <input className="input" type="number" min="0" max="200" value={String(form.dailyOutreachLimit)} onChange={(event) => set('dailyOutreachLimit', event.target.value)} />
          </Field>
          <Field label="Timezone">
            <input className="input" value={String(form.timezone)} onChange={(event) => set('timezone', event.target.value)} />
          </Field>
          <Field label="Automation mode">
            <select className="input" value={String(form.automationMode)} onChange={(event) => set('automationMode', event.target.value)}>
              <option value="SAFE_MODE">Safe mode — approve everything</option>
              <option value="ASSISTED_MODE">Assisted mode — low-risk automation</option>
              <option value="AUTONOMOUS_MODE">Autonomous mode — configured categories only</option>
            </select>
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={Boolean(form.coverLettersRequired)} onChange={(event) => set('coverLettersRequired', event.target.checked)} />
              Generate cover letters by default
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input type="checkbox" checked={Boolean(form.prioritizeReferrals)} onChange={(event) => set('prioritizeReferrals', event.target.checked)} />
              Prioritize referral outreach
            </label>
          </div>
          <div className="sm:col-span-2">
            <Notice tone={form.automationMode === 'AUTONOMOUS_MODE' ? 'warning' : 'info'}>
              <span className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {automationWarning}
              </span>
            </Notice>
          </div>
        </CardBody>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" disabled={busy} className="shadow-lg">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {busy ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}
