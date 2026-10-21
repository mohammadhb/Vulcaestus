import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;

  if (email && password) {
    if (password.length < 10) {
      throw new Error('ADMIN_PASSWORD must be at least 10 characters');
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Admin user already exists: ${email}`);
    } else {
      const user = await prisma.user.create({
        data: {
          email,
          name: process.env.ADMIN_NAME ?? 'Administrator',
          role: 'ADMIN',
          passwordHash: await bcrypt.hash(password, 12),
        },
      });
      await prisma.candidateProfile.create({
        data: {
          userId: user.id,
          fullName: process.env.ADMIN_FULL_NAME ?? user.name ?? 'Administrator',
          email,
          targetTitles: [],
          alternativeTitles: [],
          targetCountries: [],
          targetCities: [],
          industries: [],
          priorityCompanies: [],
          excludedCompanies: [],
          technologies: [],
          languages: [],
          employmentTypes: [],
          authorizedCountries: [],
        },
      });
      // eslint-disable-next-line no-console
      console.log(`Created admin user: ${email}`);
    }
  } else {
    // eslint-disable-next-line no-console
    console.log('ADMIN_EMAIL/ADMIN_PASSWORD not set; use the setup screen or set them to bootstrap an admin.');
  }

  const defaults = [
    { name: 'Remotive (remote jobs)', kind: 'REMOTIVE' as const, enabled: true, config: {} },
    { name: 'LinkedIn (manual import only)', kind: 'LINKEDIN_MANUAL' as const, enabled: false, config: {} },
  ];
  for (const source of defaults) {
    const existing = await prisma.jobSource.findUnique({ where: { name: source.name } });
    if (!existing) {
      await prisma.jobSource.create({ data: source });
      // eslint-disable-next-line no-console
      console.log(`Created job source: ${source.name}`);
    }
  }
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
