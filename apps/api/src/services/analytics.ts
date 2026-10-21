import { prisma } from '@vulcaestus/db';

function startOfToday(): Date {
  const now = new Date();
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

const RESPONSE_STATUSES = [
  'RECRUITER_SCREEN',
  'INTERVIEW',
  'FINAL_ROUND',
  'OFFER',
  'REJECTED',
] as const;

export async function analyticsSummary(profileId: string) {
  const [applications, approvals, scores, outreach, interviews, counters] = await Promise.all([
    prisma.application.findMany({
      where: { profileId, deletedAt: null },
      include: { job: { select: { source: true, company: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.approvalRequest.findMany({
      where: { profileId, status: 'PENDING' },
      select: { type: true, createdAt: true },
    }),
    prisma.jobScore.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      select: { jobId: true, overallScore: true, recommendation: true, createdAt: true },
    }),
    prisma.outreachMessage.findMany({
      where: { profileId },
      select: { type: true, status: true, sentAt: true, createdAt: true },
    }),
    prisma.interview.findMany({
      where: { profileId },
      include: { job: { select: { company: true, title: true } }, application: { select: { status: true } } },
      orderBy: { scheduledAt: 'asc' },
    }),
    prisma.dailyCounter.findMany({
      where: { profileId, date: { gte: daysAgo(14) } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const latestScores = new Map<string, (typeof scores)[number]>();
  for (const score of scores) if (!latestScores.has(score.jobId)) latestScores.set(score.jobId, score);
  const latest = [...latestScores.values()];

  const submitted = applications.filter((application) => application.submittedAt !== null);
  const responded = applications.filter((application) =>
    (RESPONSE_STATUSES as readonly string[]).includes(application.status),
  );
  const interviewsReached = applications.filter((application) =>
    ['INTERVIEW', 'FINAL_ROUND', 'OFFER'].includes(application.status),
  );
  const offers = applications.filter((application) => application.status === 'OFFER');
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  const bySource = new Map<string, number>();
  const byCompany = new Map<string, number>();
  const byRole = new Map<string, number>();
  for (const application of applications) {
    bySource.set(application.job.source, (bySource.get(application.job.source) ?? 0) + 1);
    byCompany.set(application.job.company, (byCompany.get(application.job.company) ?? 0) + 1);
    byRole.set(application.job.title, (byRole.get(application.job.title) ?? 0) + 1);
  }
  const top = (map: Map<string, number>, limit = 8) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));

  const pipeline: Record<string, number> = {};
  for (const application of applications) {
    pipeline[application.status] = (pipeline[application.status] ?? 0) + 1;
  }

  const referralSent = outreach.filter(
    (message) => message.type === 'REFERRAL_REQUEST' && message.status === 'SENT',
  ).length;
  const referralReached = applications.filter((application) =>
    ['RECRUITER_SCREEN', 'INTERVIEW', 'FINAL_ROUND', 'OFFER'].includes(application.status),
  ).length;
  const referralConversion = referralSent > 0 ? Math.round((referralReached / referralSent) * 100) : 0;

  const responseTimes = responded
    .filter((application) => application.submittedAt)
    .map((application) => application.updatedAt.getTime() - application.submittedAt!.getTime());
  const averageResponseDays =
    responseTimes.length > 0
      ? Number(
          (
            responseTimes.reduce((sum, value) => sum + value, 0) /
            responseTimes.length /
            (24 * 3600 * 1000)
          ).toFixed(1),
        )
      : null;

  const pendingByType: Record<string, number> = {};
  for (const approval of approvals) {
    pendingByType[approval.type] = (pendingByType[approval.type] ?? 0) + 1;
  }

  const today = startOfToday();
  const jobsFoundToday = counters
    .filter((counter) => counter.date.getTime() === today.getTime())
    .reduce((sum, counter) => sum + counter.jobsDiscovered, 0);
  const daily = counters.map((counter) => ({
    date: counter.date.toISOString().slice(0, 10),
    jobsDiscovered: counter.jobsDiscovered,
    applicationsSubmitted: counter.applicationsSubmitted,
    messagesSent: counter.messagesSent,
    followupsSent: counter.followupsSent,
  }));

  return {
    cards: {
      jobsFoundToday,
      strongMatches: latest.filter((score) => score.overallScore >= 90).length,
      applicationsPending: applications.filter((application) =>
        ['READY_FOR_APPROVAL', 'APPROVED', 'APPLYING'].includes(application.status),
      ).length,
      messagesPending:
        (pendingByType.LINKEDIN_MESSAGE ?? 0) + (pendingByType.REFERRAL_REQUEST ?? 0),
      applicationsSubmitted: submitted.length,
      interviews: interviewsReached.length,
      offers: offers.length,
      humanActionsRequired: pendingByType.HUMAN_ACTION ?? 0,
    },
    rates: {
      responseRate: submitted.length > 0 ? Math.round((responded.length / submitted.length) * 100) : 0,
      interviewRate: submitted.length > 0 ? Math.round((interviewsReached.length / submitted.length) * 100) : 0,
      offerRate: submitted.length > 0 ? Math.round((offers.length / submitted.length) * 100) : 0,
      referralConversion,
      averageJobScore:
        latest.length > 0
          ? Math.round(latest.reduce((sum, score) => sum + score.overallScore, 0) / latest.length)
          : null,
      averageResponseDays,
    },
    periods: {
      applicationsThisWeek: applications.filter((application) => application.createdAt >= weekAgo).length,
      applicationsThisMonth: applications.filter((application) => application.createdAt >= monthAgo).length,
      submittedThisWeek: submitted.filter((application) => (application.submittedAt ?? application.createdAt) >= weekAgo).length,
      submittedThisMonth: submitted.filter((application) => (application.submittedAt ?? application.createdAt) >= monthAgo).length,
    },
    bySource: top(bySource),
    byCompany: top(byCompany),
    byRole: top(byRole),
    pipeline,
    pendingApprovals: pendingByType,
    scores: {
      total: latest.length,
      distribution: {
        strongApply: latest.filter((score) => score.recommendation === 'STRONG_APPLY').length,
        apply: latest.filter((score) => score.recommendation === 'APPLY').length,
        review: latest.filter((score) => score.recommendation === 'REVIEW').length,
        lowPriority: latest.filter((score) => score.recommendation === 'LOW_PRIORITY').length,
        reject: latest.filter((score) => score.recommendation === 'REJECT').length,
      },
    },
    upcomingInterviews: interviews
      .filter((interview) => interview.scheduledAt.getTime() >= Date.now())
      .slice(0, 5)
      .map((interview) => ({
        id: interview.id,
        stage: interview.stage,
        scheduledAt: interview.scheduledAt,
        company: interview.job.company,
        title: interview.job.title,
        hasBriefing: Object.keys((interview.briefing as Record<string, unknown>) ?? {}).length > 0,
      })),
    daily,
  };
}
