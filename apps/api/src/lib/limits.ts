import { prisma } from '@vulcaestus/db';

export type LimitKind =
  | 'applicationsSubmitted'
  | 'connectionsSent'
  | 'messagesSent'
  | 'followupsSent'
  | 'jobsDiscovered';

export interface LimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

export function utcDateOnly(date = new Date()): Date {
  return new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export async function checkLimit(
  profileId: string,
  kind: LimitKind,
  limit: number,
  date = new Date(),
): Promise<LimitStatus> {
  const counter = await prisma.dailyCounter.findUnique({
    where: { profileId_date: { profileId, date: utcDateOnly(date) } },
  });
  const used = counter?.[kind] ?? 0;
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

export async function incrementLimit(
  profileId: string,
  kind: LimitKind,
  amount = 1,
  date = new Date(),
): Promise<void> {
  const day = utcDateOnly(date);
  await prisma.dailyCounter.upsert({
    where: { profileId_date: { profileId, date: day } },
    update: { [kind]: { increment: amount } },
    create: { profileId, date: day, [kind]: amount },
  });
}

export async function assertWithinLimit(
  profileId: string,
  kind: LimitKind,
  limit: number,
): Promise<void> {
  const status = await checkLimit(profileId, kind, limit);
  if (!status.allowed) {
    throw new Error(`Daily ${kind} limit reached (${status.used}/${status.limit}). Automation paused.`);
  }
}

export async function dailySummary(profileId: string) {
  const counter = await prisma.dailyCounter.findUnique({
    where: { profileId_date: { profileId, date: utcDateOnly() } },
  });
  return {
    date: utcDateOnly().toISOString().slice(0, 10),
    jobsDiscovered: counter?.jobsDiscovered ?? 0,
    applicationsSubmitted: counter?.applicationsSubmitted ?? 0,
    connectionsSent: counter?.connectionsSent ?? 0,
    messagesSent: counter?.messagesSent ?? 0,
    followupsSent: counter?.followupsSent ?? 0,
  };
}
