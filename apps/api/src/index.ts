import { prisma } from '@vulcaestus/db';
import { buildApp } from './app.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(
    { port: env.PORT, dryRun: env.DRY_RUN, webUrl: env.WEB_URL },
    'Vulcaestus API started',
  );
}

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API', error);
  await prisma.$disconnect();
  process.exit(1);
});
