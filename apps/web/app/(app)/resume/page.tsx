import Link from 'next/link';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import { safeApi } from '@/lib/api';
import type { Resume } from '@/lib/types';
import { formatDate, titleCase } from '@/lib/format';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Notice,
  PageHeader,
  PageShell,
  buttonClass,
} from '@/components/ui';
import { ResumeUpload } from '@/components/resume-upload';
import { ResumeActions } from '@/components/resume-actions';

export const metadata = { title: 'Resume' };

export default async function ResumePage() {
  const data = await safeApi<{ resumes: Resume[] }>('/api/resumes');
  const resumes = data?.resumes ?? [];
  const master = resumes.find((resume) => resume.isMaster);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Source of truth"
        title="Master resume"
        description="Tailoring may reorder, rewrite, and shorten — never invent. Everything generated is traceable to this resume."
        actions={
          <Link href="/profile" className={buttonClass('secondary')}>
            Edit candidate profile
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Upload" description="Text-based PDF, DOCX, Markdown, or plain text." />
          <CardBody>
            <ResumeUpload />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Guardrails" />
          <CardBody className="space-y-3 text-xs leading-relaxed text-ink-600">
            <p className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
              Generated resumes are filtered against your master: unknown companies, skills, and unsupported metrics are
              removed.
            </p>
            <p>
              Upload a resume you are comfortable storing on this server. Files are parsed locally; text is sent to your
              configured AI provider only when you run an AI action.
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 space-y-4">
        {master ? (
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-accent-700" /> {master.name}
                  <Badge tone="border-accent-200 bg-accent-50 text-accent-800">Master</Badge>
                </span>
              }
              description={`${master.originalFilename ?? 'uploaded file'} · ${master.sourceFormat?.toUpperCase() ?? 'TEXT'} · uploaded ${formatDate(master.createdAt)}`}
              action={
                <div className="flex gap-1.5">
                  {(['pdf', 'docx', 'md'] as const).map((format) => (
                    <a
                      key={format}
                      href={`/api/documents/resume/${master.id}?format=${format}`}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-[11px] font-medium text-ink-600 hover:bg-ink-50"
                    >
                      <Download className="h-3 w-3" /> {format.toUpperCase()}
                    </a>
                  ))}
                </div>
              }
            />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Extracted summary</p>
                <p className="text-xs leading-relaxed text-ink-600">
                  {master.structured.summary || 'No summary section was detected.'}
                </p>
                <p className="mt-3 text-[11px] text-ink-400">
                  {master.structured.experience?.length ?? 0} experience entries ·{' '}
                  {master.structured.skills?.length ?? 0} skills
                </p>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Recent roles</p>
                <ul className="space-y-1.5 text-xs text-ink-600">
                  {(master.structured.experience ?? []).slice(0, 3).map((experience) => (
                    <li key={`${experience.company}-${experience.role}`}>
                      <strong className="text-ink-800">{experience.role || 'Role'}</strong> · {experience.company || 'Company'}
                    </li>
                  ))}
                  {(master.structured.experience ?? []).length === 0 ? (
                    <li className="text-ink-400">No roles parsed yet. Use “Improve structure with AI”.</li>
                  ) : null}
                </ul>
              </div>
            </CardBody>
            <div className="border-t border-ink-100 px-5 py-3">
              <ResumeActions resumeId={master.id} isMaster />
            </div>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="No master resume yet"
              description="Upload one above. Scoring, tailoring, and application answers depend on it."
            />
          </Card>
        )}

        {resumes.filter((resume) => !resume.isMaster).length ? (
          <Card>
            <CardHeader title="Other resumes" description="Kept for reference. Only the master is used for generation." />
            <div className="divide-y divide-ink-100">
              {resumes
                .filter((resume) => !resume.isMaster)
                .map((resume) => (
                  <div key={resume.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-xs font-semibold text-ink-800">{resume.name}</p>
                      <p className="text-[11px] text-ink-400">
                        {titleCase(resume.sourceFormat ?? 'text')} · {formatDate(resume.createdAt)}
                      </p>
                    </div>
                    <ResumeActions resumeId={resume.id} isMaster={false} />
                  </div>
                ))}
            </div>
          </Card>
        ) : null}
      </div>

      {!master ? (
        <div className="mt-4">
          <Notice tone="warning">
            Without a master resume, application preparation and document generation are blocked.
          </Notice>
        </div>
      ) : null}
    </PageShell>
  );
}
