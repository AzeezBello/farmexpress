import type { Prisma } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';

type DbClient = Prisma.TransactionClient | typeof prisma;

export type NotifyInput = {
  userId: string;
  type:
    | 'ORDER_PLACED'
    | 'ORDER_PAID'
    | 'ORDER_CONFIRMED'
    | 'ORDER_SHIPPED'
    | 'ORDER_DELIVERED'
    | 'ORDER_CANCELLED'
    | 'ORDER_REFUNDED'
    | 'KYC_SUBMITTED'
    | 'KYC_UPDATED';
  title: string;
  body: string;
  orderId?: string | null;
};

async function dispatchExternal(url: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function notifyUser(input: NotifyInput, db: DbClient = prisma) {
  const created = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      orderId: input.orderId ?? null,
      emailSent: !config.notifications.emailWebhookUrl,
      smsSent: !config.notifications.smsWebhookUrl,
    },
  });

  if (config.notifications.emailWebhookUrl || config.notifications.smsWebhookUrl) {
    void (async () => {
      try {
        const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, name: true } });
        if (!user) return;
        const [emailSent, smsSent] = await Promise.all([
          dispatchExternal(config.notifications.emailWebhookUrl, {
            to: user.email,
            name: user.name,
            subject: input.title,
            text: input.body,
            type: input.type,
            orderId: input.orderId ?? undefined,
          }),
          dispatchExternal(config.notifications.smsWebhookUrl, {
            recipient: user.name,
            email: user.email,
            message: `${input.title}: ${input.body}`,
            type: input.type,
            orderId: input.orderId ?? undefined,
          }),
        ]);
        await prisma.notification.update({
          where: { id: created.id },
          data: { emailSent, smsSent },
        });
      } catch {
        // Non-fatal: in-app notification is already stored.
      }
    })();
  }

  return created;
}
