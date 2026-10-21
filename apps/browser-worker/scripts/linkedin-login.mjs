import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const profileId = process.argv[2] ?? process.env.DEFAULT_PROFILE_ID;
if (!profileId) {
  console.error('Usage: pnpm --filter @vulcaestus/browser-worker linkedin:login <profile-uuid>');
  console.error('The profile id is shown in the dashboard URL or returned by GET /api/auth/me.');
  process.exit(1);
}

const base = resolve(process.cwd(), process.env.PROFILES_DIR ?? '../../browser/profiles');
const directory = resolve(base, profileId.replace(/[^a-zA-Z0-9-]/g, ''));
await mkdir(directory, { recursive: true });

console.log(`Opening a headed browser with profile: ${directory}`);
console.log('Log in to LinkedIn manually. No credentials are read or stored by this script.');

const context = await chromium.launchPersistentContext(directory, {
  headless: false,
  viewport: { width: 1280, height: 900 },
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' }).catch((error) => {
  console.warn(`Could not open LinkedIn automatically: ${error.message}`);
});

const rl = createInterface({ input: stdin, output: stdout });
await rl.question('\nFinish logging in, then press Enter here to save the session and close the browser…');
await rl.close();
await context.close();
console.log('Profile saved. The Docker worker uses the same ./browser/profiles mount.');
