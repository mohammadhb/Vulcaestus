import nodemailer from 'nodemailer';
import { prisma, type NotificationChannel } from '@vulcaestus/db';
import { env } from '../env.js';
import { jsonValue } from './http.js';

export interface NotificationInput {
  subject: string;
  body: string;
  channels?: NotificationChannel[];
  metadata?: Record<string, unknown>;
}

async function sendTelegram(subject: string, body: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('Telegram is not configured');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: `${subject}\n\n${body}`.slice(0, 4000),
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
}

function emailConfigured(): boolean {
  return Boolean(env.EMAIL_HOST && env.EMAIL_USER && env.EMAIL_PASSWORD);
}

export async function sendEmailTo(to: string, subject: string, body: string): Promise<void> {
  if (!emailConfigured()) throw new Error('Email is not configured');
  const transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT ?? 587,
    secure: env.EMAIL_SECURE,
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASSWORD },
  });
  await transporter.sendMail({
    from: env.EMAIL_FROM ?? env.EMAIL_USER,
    to,
    subject,
    text: body,
  });
}

async function sendEmail(subject: string, body: string): Promise<void> {
  await sendEmailTo(env.EMAIL_FROM ?? env.EMAIL_USER ?? '', subject, body);
}

/**
 * Best-effort notification fan-out. The dashboard record is always created;
 * delivery failures are stored and never break the caller.
 */
export async function notify(input: NotificationInput): Promise<void> {
  const channels =
    input.channels ?? (env.TELEGRAM_BOT_TOKEN ? ['TELEGRAM'] : env.EMAIL_HOST ? ['EMAIL'] : ['DASHBOARD']);
  if (!env.NOTIFICATIONS_ENABLED) return;

  for (const channel of channels) {
    const record = await prisma.notification.create({
      data: {
        channel,
        subject: input.subject,
        body: input.body,
        metadata: jsonValue(input.metadata ?? {}),
      },
    });
    try {
      if (channel === 'TELEGRAM') {
        await sendTelegram(input.subject, input.body);
      } else if (channel === 'EMAIL') {
        await sendEmail(input.subject, input.body);
      }
      await prisma.notification.update({
        where: { id: record.id },
        data: { status: channel === 'DASHBOARD' ? 'SKIPPED' : 'SENT', sentAt: new Date() },
      });
    } catch (error) {
      await prisma.notification.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: (error as Error).message.slice(0, 2000) },
      });
    }
  }
}
