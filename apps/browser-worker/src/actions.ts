import type { BrowserContext, Page } from 'playwright';
import { env } from './env.js';
import { assertSafeFilePath, capture, detectHumanChallenge, openContext } from './browser.js';

export type ActionKind = 'APPLICATION_SUBMIT' | 'LINKEDIN_PREPARE' | 'LINKEDIN_SEND' | 'PAGE_CAPTURE';

export interface WorkerAction {
  actionId: string;
  kind: ActionKind;
  dryRun: boolean;
  profileId: string;
  callbackUrl: string;
  request: {
    url?: string;
    company?: string;
    title?: string;
    fields?: Array<{ label: string; value: string }>;
    humanReview?: Array<{ label: string }>;
    files?: Array<{ name: string; path: string; inputHint: string }>;
    confirmSubmit?: boolean;
    message?: string;
    contact?: { name?: string; title?: string; company?: string };
  };
}

export interface ActionResult {
  status: 'SUCCEEDED' | 'FAILED' | 'AWAITING_HUMAN' | 'SIMULATED';
  result?: Record<string, unknown>;
  screenshots?: string[];
  error?: string;
  reason?: string;
  confirmationRef?: string;
  currentUrl?: string;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function fillField(page: Page, label: string, value: string): Promise<boolean> {
  if (!value.trim()) return true;
  const candidates = [
    page.getByLabel(label, { exact: false }).first(),
    page.getByPlaceholder(label, { exact: false }).first(),
    page.locator(`input[name="${label}"], textarea[name="${label}"], select[name="${label}"]`).first(),
  ];
  for (const locator of candidates) {
    try {
      if ((await locator.count()) === 0) continue;
      if (!(await locator.isVisible({ timeout: 1000 }).catch(() => false))) continue;
      const tag = await locator.evaluate((element) => element.tagName.toLowerCase());
      if (tag === 'select') {
        try {
          await locator.selectOption({ label: value }, { timeout: 3000 });
        } catch {
          await locator.selectOption(value, { timeout: 3000 });
        }
      } else {
        await locator.fill(value, { timeout: 5000 });
      }
      return true;
    } catch {
      // try the next strategy
    }
  }

  // Fall back to matching the visible question text near a form control.
  try {
    const all = page.locator('input:not([type=hidden]):not([type=file]), textarea, select');
    const count = Math.min(await all.count(), 80);
    const wanted = normalizeText(label);
    for (let index = 0; index < count; index += 1) {
      const locator = all.nth(index);
      const contextText = await locator
        .evaluate((element) => {
          const parts = [
            element.getAttribute('aria-label') ?? '',
            element.getAttribute('placeholder') ?? '',
            element.getAttribute('name') ?? '',
            element.closest('label')?.textContent ?? '',
            element.parentElement?.textContent ?? '',
          ];
          return parts.join(' ').slice(0, 500);
        })
        .catch(() => '');
      const normalizedContext = normalizeText(contextText);
      const wantedTokens = wanted.split(' ').filter((token) => token.length > 3);
      const matched = wantedTokens.filter((token) => normalizedContext.includes(token)).length;
      if (wantedTokens.length > 0 && matched / wantedTokens.length >= 0.6) {
        const tag = await locator.evaluate((element) => element.tagName.toLowerCase());
        if (tag === 'select') {
          await locator.selectOption({ label: value }, { timeout: 3000 });
        } else {
          await locator.fill(value, { timeout: 5000 });
        }
        return true;
      }
    }
  } catch {
    // no fallback match
  }
  return false;
}

async function requiredEmptyFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ),
    );
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const missing: string[] = [];
    const radioGroups = new Set<string>();
    for (const element of elements) {
      if (!element.required || !isVisible(element)) continue;
      if (element instanceof HTMLInputElement) {
        if (['hidden', 'submit', 'button', 'file'].includes(element.type)) continue;
        if (element.type === 'radio') {
          if (radioGroups.has(element.name)) continue;
          radioGroups.add(element.name);
          const group = document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(element.name)}"]`);
          if (!Array.from(group).some((item) => item.checked)) {
            missing.push(element.name || 'radio group');
          }
          continue;
        }
        if (element.type === 'checkbox') {
          if (!element.checked) missing.push(element.name || 'checkbox');
          continue;
        }
        if (!element.value.trim()) {
          missing.push(element.getAttribute('aria-label') ?? element.name ?? element.placeholder ?? 'field');
        }
      } else if (element.tagName.toLowerCase() === 'select') {
        if (!element.value) missing.push(element.name || 'select');
      } else if (!element.value.trim()) {
        missing.push(element.getAttribute('aria-label') ?? element.name ?? 'textarea');
      }
    }
    return missing.slice(0, 20);
  });
}

async function uploadFiles(page: Page, files: NonNullable<WorkerAction['request']['files']>): Promise<string[]> {
  const problems: string[] = [];
  const inputs = page.locator('input[type=file]');
  const inputCount = await inputs.count();
  let nextIndex = 0;
  for (const file of files) {
    try {
      const safePath = assertSafeFilePath(file.path);
      let index = nextIndex;
      if (file.inputHint === 'cover letter' && inputCount > 1) index = Math.min(1, inputCount - 1);
      if (index >= inputCount) {
        problems.push(`No file input available for ${file.name}`);
        continue;
      }
      await inputs.nth(index).setInputFiles(safePath, { timeout: 10_000 });
      nextIndex += 1;
    } catch (error) {
      problems.push(`Could not upload ${file.name}: ${(error as Error).message}`);
    }
  }
  return problems;
}

async function detectSuccess(page: Page): Promise<{ success: boolean; reference?: string }> {
  const url = page.url();
  const body = await page.locator('body').innerText({ timeout: 8000 }).catch(() => '');
  const text = `${url} ${body}`.toLowerCase();
  const success =
    /thank you for applying|application (was )?(submitted|received)|we('| ha)ve received your application|successfully applied|your application has been sent|confirmation/i.test(
      text,
    );
  const reference =
    body.match(/(?:reference|confirmation|application)\s*(?:id|number|#)?\s*[:#]?\s*([A-Z0-9-]{5,30})/i)?.[1] ?? undefined;
  return { success, reference };
}

async function runApplicationSubmit(context: BrowserContext, action: WorkerAction): Promise<ActionResult> {
  const request = action.request;
  if (!request.url) return { status: 'FAILED', error: 'No application URL supplied' };
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const screenshots: string[] = [];
  try {
    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);

    const challenge = await detectHumanChallenge(page);
    if (challenge) {
      const shot = await capture(page, action.actionId, screenshots.length + 1);
      screenshots.push(shot.relativePath);
      return {
        status: 'AWAITING_HUMAN',
        reason: challenge,
        screenshots,
        currentUrl: page.url(),
      };
    }

    const unfilled: string[] = [];
    for (const field of request.fields ?? []) {
      if (!field.value) continue;
      const filled = await fillField(page, field.label, field.value);
      if (!filled) unfilled.push(field.label);
    }

    const uploadProblems = await uploadFiles(page, request.files ?? []);

    const beforeSubmit = await capture(page, action.actionId, screenshots.length + 1);
    screenshots.push(beforeSubmit.relativePath);

    const missingRequired = await requiredEmptyFields(page);
    if (unfilled.length > 0 || uploadProblems.length > 0 || missingRequired.length > 0) {
      return {
        status: 'AWAITING_HUMAN',
        reason: [
          unfilled.length > 0 ? `Could not map fields: ${unfilled.slice(0, 6).join(', ')}` : '',
          uploadProblems.length > 0 ? uploadProblems.join('; ') : '',
          missingRequired.length > 0 ? `Required fields still empty: ${missingRequired.slice(0, 6).join(', ')}` : '',
          (request.humanReview ?? []).length > 0
            ? `${(request.humanReview ?? []).length} answer(s) need human review`
            : '',
        ]
          .filter(Boolean)
          .join('. '),
        screenshots,
        currentUrl: page.url(),
        result: { unfilled, uploadProblems, missingRequired },
      };
    }

    if (!request.confirmSubmit) {
      return {
        status: 'AWAITING_HUMAN',
        reason: 'Form was filled but confirmation was disabled. Submit manually.',
        screenshots,
        currentUrl: page.url(),
      };
    }

    const submitButton = page
      .getByRole('button', { name: /submit|apply|send application|complete application/i })
      .first();
    const usesInput =
      (await submitButton.count()) === 0
        ? page.locator('input[type=submit], button[type=submit]').first()
        : submitButton;
    if ((await usesInput.count()) === 0) {
      return {
        status: 'AWAITING_HUMAN',
        reason: 'No submit button was detected. Submit manually and confirm.',
        screenshots,
        currentUrl: page.url(),
      };
    }

    await usesInput.click({ timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(2500);

    const afterSubmit = await capture(page, action.actionId, screenshots.length + 1);
    screenshots.push(afterSubmit.relativePath);
    const confirmation = await detectSuccess(page);
    if (confirmation.success) {
      return {
        status: 'SUCCEEDED',
        screenshots,
        confirmationRef: confirmation.reference ?? `browser:${action.actionId}`,
        currentUrl: page.url(),
        result: { confirmed: true, reference: confirmation.reference },
      };
    }
    return {
      status: 'AWAITING_HUMAN',
      reason: 'The form was submitted but success could not be confirmed. Check the screenshot.',
      screenshots,
      currentUrl: page.url(),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runLinkedinPrepare(context: BrowserContext, action: WorkerAction): Promise<ActionResult> {
  const request = action.request;
  if (!request.url) return { status: 'FAILED', error: 'No LinkedIn URL supplied' };
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  try {
    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);
    const challenge = await detectHumanChallenge(page);
    const shot = await capture(page, action.actionId, 1);
    if (challenge) {
      return {
        status: 'AWAITING_HUMAN',
        reason: challenge,
        screenshots: [shot.relativePath],
        currentUrl: page.url(),
      };
    }
    return {
      status: 'AWAITING_HUMAN',
      reason:
        'The contact profile is open in the persistent browser profile. The prepared message is in the approval queue; send it manually, then confirm.',
      screenshots: [shot.relativePath],
      currentUrl: page.url(),
      result: {
        prepared: true,
        message: request.message,
        contact: request.contact,
        note: 'This worker never clicks Send on LinkedIn.',
      },
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runPageCapture(context: BrowserContext, action: WorkerAction): Promise<ActionResult> {
  const request = action.request;
  if (!request.url) return { status: 'FAILED', error: 'No URL supplied' };
  const page = await context.newPage();
  try {
    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const shot = await capture(page, action.actionId, 1);
    const title = await page.title();
    const text = await page.locator('body').innerText().catch(() => '');
    return {
      status: 'SUCCEEDED',
      screenshots: [shot.relativePath],
      currentUrl: page.url(),
      result: { title, text: text.slice(0, 30_000) },
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function executeAction(action: WorkerAction): Promise<ActionResult> {
  if (action.dryRun || env.DRY_RUN) {
    return {
      status: 'SIMULATED',
      result: {
        simulated: true,
        kind: action.kind,
        note: 'DRY_RUN is enabled. No browser interaction was performed.',
      },
    };
  }

  let context: BrowserContext | null = null;
  try {
    context = await openContext(action.profileId);
    if (action.kind === 'APPLICATION_SUBMIT') return await runApplicationSubmit(context, action);
    if (action.kind === 'LINKEDIN_PREPARE' || action.kind === 'LINKEDIN_SEND') {
      return await runLinkedinPrepare(context, action);
    }
    if (action.kind === 'PAGE_CAPTURE') return await runPageCapture(context, action);
    return { status: 'FAILED', error: `Unsupported action kind: ${action.kind}` };
  } catch (error) {
    return { status: 'FAILED', error: (error as Error).message.slice(0, 4000) };
  } finally {
    if (context) await context.close().catch(() => undefined);
  }
}
