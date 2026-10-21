import { prisma, type Prisma } from '@vulcaestus/db';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function audit(entry: {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  result?: 'success' | 'failure' | 'denied';
  metadata?: unknown;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        result: entry.result ?? 'success',
        metadata: jsonValue(entry.metadata ?? {}),
        ip: entry.ip,
      },
    });
  } catch (error) {
    // Auditing must never break the request path.
    // eslint-disable-next-line no-console
    console.error('audit write failed', (error as Error).message);
  }
}

export function getPagination(query: Record<string, unknown>): { page: number; pageSize: number; skip: number; take: number } {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
