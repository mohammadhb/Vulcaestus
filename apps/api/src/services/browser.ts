import { prisma, type BrowserAction, type BrowserActionKind } from '@vulcaestus/db';
import { env } from '../env.js';
import { jsonValue } from '../lib/http.js';
import { notify } from '../lib/notify.js';
import { assertApprovalGate } from './gating.js';

export interface DispatchOptions {
  profileId: string;
  kind: BrowserActionKind;
  approvalId?: string | null;
  expectedApprovalType?: string;
  entityId?: string;
  jobId?: string | null;
  applicationId?: string | null;
  dryRun: boolean;
  request: Record<string, unknown>;
}

async function verifyApproval(options: DispatchOptions): Promise<void> {
  if (options.dryRun) return;
  if (!options.approvalId || !options.expectedApprovalType || !options.entityId) {
    throw new Error('Live browser actions require an approval request');
  }
  const approval = await prisma.approvalRequest.findUnique({ where: { id: options.approvalId } });
  assertApprovalGate({
    approval,
    expectedType: options.expectedApprovalType,
    entityId: options.entityId,
  });
}

export async function dispatchBrowserAction(options: DispatchOptions): Promise<BrowserAction> {
  const dryRun = options.dryRun || env.DRY_RUN;
  await verifyApproval({ ...options, dryRun });

  if (dryRun) {
    const action = await prisma.browserAction.create({
      data: {
        profileId: options.profileId,
        kind: options.kind,
        status: 'SIMULATED',
        jobId: options.jobId ?? null,
        applicationId: options.applicationId ?? null,
        approvalId: options.approvalId ?? null,
        dryRun: true,
        request: jsonValue(options.request),
        result: jsonValue({
          simulated: true,
          wouldExecute: options.kind,
          summary:
            options.kind === 'APPLICATION_SUBMIT'
              ? 'Dry run: the application form would be filled, a screenshot captured, and Submit clicked.'
              : options.kind === 'LINKEDIN_PREPARE'
                ? 'Dry run: the LinkedIn profile would be opened and the message prepared for manual sending.'
                : 'Dry run: no external action was performed.',
          request: options.request,
        }),
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    await notify({
      subject: 'Dry run: external action simulated',
      body: `${options.kind} was simulated. Nothing was sent or submitted.`,
      metadata: { browserActionId: action.id, profileId: options.profileId },
    });
    return action;
  }

  const action = await prisma.browserAction.create({
    data: {
      profileId: options.profileId,
      kind: options.kind,
      status: 'QUEUED',
      jobId: options.jobId ?? null,
      applicationId: options.applicationId ?? null,
      approvalId: options.approvalId ?? null,
      dryRun: false,
      request: jsonValue(options.request),
    },
  });

  try {
    const response = await fetch(`${env.BROWSER_WORKER_URL}/v1/actions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-worker-secret': env.BROWSER_WORKER_SECRET,
      },
      body: JSON.stringify({
        actionId: action.id,
        kind: options.kind,
        dryRun: false,
        profileId: options.profileId,
        request: options.request,
        callbackUrl: `${env.API_URL}/api/internal/browser-actions/${action.id}/callback`,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Browser worker returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    const payload = (await response.json()) as { id?: string };
    return prisma.browserAction.update({
      where: { id: action.id },
      data: { status: 'RUNNING', workerJobId: payload.id ?? null, startedAt: new Date() },
    });
  } catch (error) {
    const failed = await prisma.browserAction.update({
      where: { id: action.id },
      data: { status: 'FAILED', error: (error as Error).message.slice(0, 4000), finishedAt: new Date() },
    });
    await notify({
      subject: 'Browser worker failed to accept an action',
      body: (error as Error).message,
      metadata: { browserActionId: action.id },
    });
    return failed;
  }
}
