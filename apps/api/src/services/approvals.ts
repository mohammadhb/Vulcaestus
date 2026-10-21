import { prisma, type ApprovalRequest } from '@vulcaestus/db';
import { env } from '../env.js';
import { HttpError, audit, jsonValue } from '../lib/http.js';
import { incrementLimit } from '../lib/limits.js';
import { notify, sendEmailTo } from '../lib/notify.js';
import { writeStorageFile } from '../lib/storage.js';
import { dispatchBrowserAction } from './browser.js';
import { markdownToPdf } from './documents.js';
import { masterResumeMarkdown } from './resume-render.js';
import { getOrCreateApproval } from './approval-store.js';

export interface ApprovalDecisionResult {
  approval: ApprovalRequest;
  warning?: string;
}

async function touchApplicationStatus(applicationId: string, status: 'APPROVED' | 'APPLYING' | 'SUBMITTED' | 'READY_FOR_APPROVAL' | 'REJECTED' | 'ARCHIVED') {
  await prisma.application.update({
    where: { id: applicationId },
    data: { status, lastActivityAt: new Date() },
  });
}

async function dispatchApplication(approval: ApprovalRequest, userId: string): Promise<ApprovalDecisionResult> {
  const application = await prisma.application.findUnique({
    where: { id: approval.entityId },
    include: {
      job: true,
      profile: { include: { resumes: { where: { isMaster: true, deletedAt: null }, take: 1 } } },
      answers: true,
    },
  });
  if (!application) throw new HttpError(404, 'Application not found for this approval');

  const tailored = application.tailoredResumeId
    ? await prisma.tailoredResume.findUnique({ where: { id: application.tailoredResumeId } })
    : null;
  const coverLetter = application.coverLetterId
    ? await prisma.coverLetter.findUnique({ where: { id: application.coverLetterId } })
    : null;
  const masterResume = application.profile.resumes[0];

  if (!tailored && !masterResume) {
    throw new HttpError(400, 'No resume is available. Upload a master resume before submitting.');
  }

  const resumeMarkdown = tailored?.contentMarkdown ?? masterResumeMarkdown(application.profile, masterResume!);
  const resumePdf = await markdownToPdf(resumeMarkdown);
  const resumeFile = await writeStorageFile(['applications', application.id, 'resume.pdf'], resumePdf);
  const files: Array<{ name: string; path: string; inputHint: string }> = [
    { name: `${application.job.company}-${application.job.title}-resume.pdf`.replace(/[^a-zA-Z0-9._-]+/g, '-'), path: resumeFile.path, inputHint: 'resume' },
  ];
  if (coverLetter) {
    const coverPdf = await markdownToPdf(coverLetter.content);
    const coverFile = await writeStorageFile(['applications', application.id, 'cover-letter.pdf'], coverPdf);
    files.push({
      name: `${application.job.company}-cover-letter.pdf`.replace(/[^a-zA-Z0-9._-]+/g, '-'),
      path: coverFile.path,
      inputHint: 'cover letter',
    });
  }

  const url = application.applicationUrl ?? application.job.url;
  if (!url) {
    throw new HttpError(400, 'This job has no application URL. Add one before approving submission.');
  }

  const answered = application.answers
    .filter((answer) => answer.status === 'ANSWERED')
    .map((answer) => ({ label: answer.question, value: answer.answer, source: answer.source }));
  const humanReview = application.answers
    .filter((answer) => answer.status === 'HUMAN_REVIEW')
    .map((answer) => ({ label: answer.question, answer: answer.answer, sensitive: answer.sensitive, source: answer.source }));

  const action = await dispatchBrowserAction({
    profileId: application.profileId,
    kind: 'APPLICATION_SUBMIT',
    approvalId: approval.id,
    expectedApprovalType: 'APPLICATION_SUBMISSION',
    entityId: application.id,
    jobId: application.jobId,
    applicationId: application.id,
    dryRun: env.DRY_RUN,
    request: {
      url,
      company: application.job.company,
      title: application.job.title,
      fields: answered,
      humanReview,
      files,
      confirmSubmit: true,
      note: 'Submission is allowed only because the application approval is APPROVED.',
    },
  });

  if (!action.dryRun) {
    if (action.status === 'FAILED') {
      await touchApplicationStatus(application.id, 'APPROVED');
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          metadata: jsonValue({
            ...(approval.metadata as Record<string, unknown>),
            dispatchWarning: action.error,
            browserActionId: action.id,
          }),
        },
      });
      return {
        approval: (await prisma.approvalRequest.findUnique({ where: { id: approval.id } }))!,
        warning: `Browser worker could not start: ${action.error}`,
      };
    }
    await touchApplicationStatus(application.id, 'APPLYING');
    await incrementLimit(application.profileId, 'applicationsSubmitted');
    await notify({
      subject: `Application started: ${application.job.title} at ${application.job.company}`,
      body: 'The browser worker is filling the application. You will be notified if human input is required.',
      metadata: { applicationId: application.id, browserActionId: action.id },
    });
  } else {
    await touchApplicationStatus(application.id, 'APPROVED');
    await notify({
      subject: `Dry run: application approved — ${application.job.title} at ${application.job.company}`,
      body: 'Dry run is enabled. The application was prepared and simulated but not submitted.',
      metadata: { applicationId: application.id, browserActionId: action.id },
    });
  }

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      metadata: jsonValue({
        ...(approval.metadata as Record<string, unknown>),
        browserActionId: action.id,
        browserActionStatus: action.status,
        dryRun: action.dryRun,
      }),
    },
  });

  await audit({
    userId,
    action: 'approval.application_submission',
    entityType: 'application',
    entityId: application.id,
    metadata: { approvalId: approval.id, browserActionId: action.id, dryRun: action.dryRun },
  });

  return { approval: (await prisma.approvalRequest.findUnique({ where: { id: approval.id } }))! };
}

async function dispatchOutreach(approval: ApprovalRequest, userId: string): Promise<ApprovalDecisionResult> {
  const outreach = await prisma.outreachMessage.findUnique({
    where: { id: approval.entityId },
    include: { contact: true, job: true },
  });
  if (!outreach) throw new HttpError(404, 'Outreach message not found for this approval');

  if (!outreach.contact.linkedinUrl) {
    const human = await getOrCreateApproval({
      profileId: outreach.profileId,
      type: 'HUMAN_ACTION',
      entityType: 'outreach',
      entityId: outreach.id,
      title: `Add a LinkedIn URL for ${outreach.contact.name}`,
      content: `The message to ${outreach.contact.name} was approved, but this contact has no LinkedIn URL. Add the URL, then run the browser handoff again.`,
      metadata: { outreachId: outreach.id, reason: 'missing_linkedin_url' },
      priority: 80,
    });
    await prisma.outreachMessage.update({
      where: { id: outreach.id },
      data: { status: 'SCHEDULED', approvedAt: new Date() },
    });
    return { approval: human, warning: 'Contact has no LinkedIn URL. A human action was created.' };
  }

  const action = await dispatchBrowserAction({
    profileId: outreach.profileId,
    kind: 'LINKEDIN_PREPARE',
    approvalId: approval.id,
    expectedApprovalType: approval.type,
    entityId: outreach.id,
    jobId: outreach.jobId,
    applicationId: outreach.applicationId,
    dryRun: env.DRY_RUN,
    request: {
      outreachId: outreach.id,
      url: outreach.contact.linkedinUrl,
      message: outreach.body,
      subject: outreach.subject,
      contact: {
        name: outreach.contact.name,
        title: outreach.contact.title,
        company: outreach.contact.company,
      },
      type: outreach.type,
    },
  });

  await prisma.outreachMessage.update({
    where: { id: outreach.id },
    data: {
      status: action.status === 'FAILED' ? 'FAILED' : action.dryRun ? 'APPROVED' : 'SCHEDULED',
      approvedAt: new Date(),
      dryRun: action.dryRun,
      error: action.error,
    },
  });

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      metadata: jsonValue({
        ...(approval.metadata as Record<string, unknown>),
        browserActionId: action.id,
        browserActionStatus: action.status,
        dryRun: action.dryRun,
      }),
    },
  });

  await audit({
    userId,
    action: 'approval.outreach',
    entityType: 'outreach',
    entityId: outreach.id,
    metadata: { approvalId: approval.id, browserActionId: action.id, dryRun: action.dryRun },
  });

  return {
    approval: (await prisma.approvalRequest.findUnique({ where: { id: approval.id } }))!,
    warning: action.error ?? undefined,
  };
}

async function dispatchFollowUp(approval: ApprovalRequest, userId: string): Promise<ApprovalDecisionResult> {
  const followUp = await prisma.followUp.findUnique({
    where: { id: approval.entityId },
    include: {
      outreach: { include: { contact: true } },
      application: { include: { job: true } },
    },
  });
  if (!followUp) throw new HttpError(404, 'Follow-up not found for this approval');

  if (env.DRY_RUN) {
    await dispatchBrowserAction({
      profileId: followUp.profileId,
      kind: 'PAGE_CAPTURE',
      approvalId: approval.id,
      expectedApprovalType: 'FOLLOWUP',
      entityId: followUp.id,
      jobId: followUp.jobId,
      applicationId: followUp.applicationId,
      dryRun: true,
      request: { message: approval.content, type: followUp.type },
    });
    await prisma.followUp.update({ where: { id: followUp.id }, data: { status: 'DUE' } });
    return { approval, warning: 'Dry run: follow-up was not sent.' };
  }

  const email = followUp.outreach?.contact.email;
  if (email) {
    await sendEmailTo(
      email,
      `Follow-up: ${followUp.application?.job.title ?? 'our conversation'}`,
      approval.content,
    );
    await prisma.followUp.update({
      where: { id: followUp.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await incrementLimit(followUp.profileId, 'followupsSent');
    await audit({
      userId,
      action: 'followup.sent',
      entityType: 'followup',
      entityId: followUp.id,
      metadata: { channel: 'email' },
    });
    return { approval };
  }

  const human = await getOrCreateApproval({
    profileId: followUp.profileId,
    type: 'HUMAN_ACTION',
    entityType: 'followup',
    entityId: followUp.id,
    title: `Send follow-up manually: ${followUp.outreach?.contact.name ?? followUp.application?.job.company ?? 'contact'}`,
    content: approval.content,
    metadata: { followUpId: followUp.id, action: 'send_followup' },
    priority: 70,
  });
  await prisma.followUp.update({ where: { id: followUp.id }, data: { status: 'AWAITING_APPROVAL' } });
  return { approval: human, warning: 'No email address is available. A manual send task was created.' };
}

async function dispatchHumanAction(approval: ApprovalRequest, userId: string): Promise<ApprovalDecisionResult> {
  const metadata = approval.metadata as Record<string, unknown>;
  const browserActionId = typeof metadata.browserActionId === 'string' ? metadata.browserActionId : undefined;
  if (browserActionId) {
    await prisma.browserAction.update({
      where: { id: browserActionId },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    });
  }
  if (typeof metadata.outreachId === 'string' && metadata.action === 'mark_sent') {
    await prisma.outreachMessage.update({
      where: { id: metadata.outreachId },
      data: { status: 'SENT', sentAt: new Date(), sentBy: `user:${userId}` },
    });
    await incrementLimit(approval.profileId, 'messagesSent');
  }
  if (typeof metadata.followUpId === 'string') {
    await prisma.followUp.update({
      where: { id: metadata.followUpId },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await incrementLimit(approval.profileId, 'followupsSent');
  }
  if (typeof metadata.applicationId === 'string' && metadata.confirmSubmission === true) {
    await touchApplicationStatus(metadata.applicationId, 'SUBMITTED');
    await prisma.application.update({
      where: { id: metadata.applicationId },
      data: { submittedAt: new Date() },
    });
    await incrementLimit(approval.profileId, 'applicationsSubmitted');
  }
  await audit({
    userId,
    action: 'approval.human_action_completed',
    entityType: approval.entityType,
    entityId: approval.entityId,
    metadata,
  });
  return { approval };
}

export async function approveApproval(input: {
  approvalId: string;
  profileId: string;
  userId: string;
  note?: string;
}): Promise<ApprovalDecisionResult> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, profileId: input.profileId },
  });
  if (!approval) throw new HttpError(404, 'Approval request not found');
  if (approval.status !== 'PENDING') {
    throw new HttpError(409, `Approval is already ${approval.status.toLowerCase()}`);
  }
  if (approval.expiresAt && approval.expiresAt.getTime() < Date.now()) {
    await prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: 'EXPIRED' } });
    throw new HttpError(409, 'Approval request has expired');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const count = await tx.approvalRequest.updateMany({
      where: { id: approval.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: input.userId,
        decisionNote: input.note,
      },
    });
    if (count.count === 0) throw new HttpError(409, 'Approval was already decided');
    return tx.approvalRequest.findUniqueOrThrow({ where: { id: approval.id } });
  });

  await audit({
    userId: input.userId,
    action: 'approval.approved',
    entityType: approval.entityType,
    entityId: approval.entityId,
    metadata: { approvalId: approval.id, type: approval.type },
  });

  try {
    switch (approval.type) {
      case 'APPLICATION_SUBMISSION':
        return await dispatchApplication(updated, input.userId);
      case 'LINKEDIN_MESSAGE':
      case 'REFERRAL_REQUEST':
        return await dispatchOutreach(updated, input.userId);
      case 'FOLLOWUP':
        return await dispatchFollowUp(updated, input.userId);
      case 'HUMAN_ACTION':
        return await dispatchHumanAction(updated, input.userId);
      case 'INTERVIEW_ACTION':
        return { approval: updated };
      default:
        return { approval: updated };
    }
  } catch (error) {
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        metadata: jsonValue({
          ...(approval.metadata as Record<string, unknown>),
          dispatchError: (error as Error).message,
        }),
      },
    });
    throw error;
  }
}

export async function rejectApproval(input: {
  approvalId: string;
  profileId: string;
  userId: string;
  note?: string;
}): Promise<ApprovalRequest> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, profileId: input.profileId },
  });
  if (!approval) throw new HttpError(404, 'Approval request not found');
  if (approval.status !== 'PENDING') throw new HttpError(409, `Approval is already ${approval.status.toLowerCase()}`);
  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: 'REJECTED', rejectedAt: new Date(), decisionNote: input.note },
  });

  if (approval.type === 'APPLICATION_SUBMISSION') {
    await prisma.application.update({
      where: { id: approval.entityId },
      data: { status: 'REJECTED', lastActivityAt: new Date() },
    }).catch(() => undefined);
  } else if (approval.type === 'LINKEDIN_MESSAGE' || approval.type === 'REFERRAL_REQUEST') {
    await prisma.outreachMessage.update({
      where: { id: approval.entityId },
      data: { status: 'CANCELLED' },
    }).catch(() => undefined);
  } else if (approval.type === 'FOLLOWUP') {
    await prisma.followUp.update({
      where: { id: approval.entityId },
      data: { status: 'CANCELLED' },
    }).catch(() => undefined);
  }

  await audit({
    userId: input.userId,
    action: 'approval.rejected',
    entityType: approval.entityType,
    entityId: approval.entityId,
    metadata: { approvalId: approval.id, note: input.note },
  });
  return updated;
}

export async function editApproval(input: {
  approvalId: string;
  profileId: string;
  userId: string;
  content?: string;
  subject?: string;
  metadata?: Record<string, unknown>;
}): Promise<ApprovalRequest> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, profileId: input.profileId },
  });
  if (!approval) throw new HttpError(404, 'Approval request not found');
  if (approval.status !== 'PENDING') throw new HttpError(409, 'Only pending approvals can be edited');

  if (input.content !== undefined) {
    if (approval.type === 'LINKEDIN_MESSAGE' || approval.type === 'REFERRAL_REQUEST') {
      const outreach = await prisma.outreachMessage.findUnique({ where: { id: approval.entityId } });
      if (!outreach) throw new HttpError(404, 'Outreach message not found');
      await prisma.outreachMessage.update({
        where: { id: outreach.id },
        data: { body: input.content, subject: input.subject ?? outreach.subject },
      });
    }
  }

  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: {
      content: input.content ?? undefined,
      metadata: jsonValue({
        ...(approval.metadata as Record<string, unknown>),
        ...(input.metadata ?? {}),
        editedByHuman: true,
        editedAt: new Date().toISOString(),
      }),
    },
  });
  await audit({
    userId: input.userId,
    action: 'approval.edited',
    entityType: approval.entityType,
    entityId: approval.entityId,
    metadata: { approvalId: approval.id },
  });
  return updated;
}

export async function postponeApproval(input: {
  approvalId: string;
  profileId: string;
  userId: string;
  hours: number;
}): Promise<ApprovalRequest> {
  const approval = await prisma.approvalRequest.findFirst({
    where: { id: input.approvalId, profileId: input.profileId },
  });
  if (!approval) throw new HttpError(404, 'Approval request not found');
  if (approval.status !== 'PENDING') throw new HttpError(409, 'Only pending approvals can be postponed');
  const updated = await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { expiresAt: new Date(Date.now() + Math.max(1, input.hours) * 3600 * 1000) },
  });
  await audit({
    userId: input.userId,
    action: 'approval.postponed',
    entityType: approval.entityType,
    entityId: approval.entityId,
    metadata: { approvalId: approval.id, hours: input.hours },
  });
  return updated;
}

export async function bulkApprove(input: {
  approvalIds: string[];
  profileId: string;
  userId: string;
}): Promise<{ approved: string[]; failed: Array<{ id: string; error: string }>; skipped: string[] }> {
  const approved: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const skipped: string[] = [];
  const approvals = await prisma.approvalRequest.findMany({
    where: { id: { in: input.approvalIds }, profileId: input.profileId },
  });
  for (const approval of approvals) {
    if (!['LINKEDIN_MESSAGE', 'REFERRAL_REQUEST', 'FOLLOWUP'].includes(approval.type)) {
      skipped.push(approval.id);
      continue;
    }
    try {
      await approveApproval({
        approvalId: approval.id,
        profileId: input.profileId,
        userId: input.userId,
        note: 'Bulk approved (safe action)',
      });
      approved.push(approval.id);
    } catch (error) {
      failed.push({ id: approval.id, error: (error as Error).message });
    }
  }
  return { approved, failed, skipped };
}
