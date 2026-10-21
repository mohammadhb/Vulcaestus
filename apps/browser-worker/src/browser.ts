import { mkdir, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { env } from './env.js';

export interface Screenshot {
  relativePath: string;
  absolutePath: string;
}

export function assertSafeFilePath(candidate: string): string {
  const storage = resolve(env.STORAGE_DIR);
  const target = resolve(candidate);
  const rel = relative(storage, target);
  if (!rel || rel.startsWith('..') || rel.includes('..')) {
    throw new Error(`File path is outside the shared storage directory: ${candidate}`);
  }
  return target;
}

export async function capture(page: Page, actionId: string, index: number): Promise<Screenshot> {
  const directory = resolve(env.STORAGE_DIR, 'browser-actions', actionId);
  await mkdir(directory, { recursive: true });
  const absolutePath = resolve(directory, `${index}.png`);
  await page.screenshot({ path: absolutePath, fullPage: true });
  const relativePath = relative(resolve(env.STORAGE_DIR), await realpath(absolutePath));
  return { relativePath, absolutePath };
}

const CHALLENGE_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  'iframe[src*="turnstile"]',
  '.g-recaptcha',
  '#challenge-form',
  '#cf-challenge-running',
  'text=/verify you are human/i',
  'text=/unusual traffic/i',
  'text=/complete the security check/i',
];

export async function detectHumanChallenge(page: Page): Promise<string | null> {
  const url = page.url();
  if (/\/login|authwall|checkpoint|challenge/i.test(url)) {
    return `Authentication or challenge page detected at ${url}`;
  }
  for (const selector of CHALLENGE_SELECTORS) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible({ timeout: 500 }).catch(() => false))) {
        return `Human verification challenge detected (${selector}). Automation stopped.`;
      }
    } catch {
      // selector may be unsupported for this page
    }
  }
  const body = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  if (/captcha|verify you are human|i'm not a robot|unusual traffic/i.test(body.slice(0, 3000))) {
    return 'Human verification text detected on the page. Automation stopped.';
  }
  return null;
}

export async function openContext(profileId: string): Promise<BrowserContext> {
  const { chromium } = await import('playwright');
  const directory = resolve(env.PROFILES_DIR, profileId.replace(/[^a-zA-Z0-9-]/g, ''));
  await mkdir(directory, { recursive: true });
  return chromium.launchPersistentContext(directory, {
    headless: env.HEADLESS,
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    acceptDownloads: false,
  });
}
