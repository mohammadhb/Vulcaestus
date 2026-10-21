import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __jobAgentPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__jobAgentPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__jobAgentPrisma = prisma;
}

export * from '@prisma/client';
export { Prisma } from '@prisma/client';
export default prisma;
