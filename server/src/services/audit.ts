import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AuditInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: 'USER' | 'ORDER' | 'PRODUCT' | 'PAYMENT';
  targetId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
};

export async function recordAudit(input: AuditInput, db: DbClient = prisma) {
  let actorEmail = input.actorEmail ?? null;
  if (!actorEmail && input.actorId) {
    const actor = await db.user.findUnique({ where: { id: input.actorId }, select: { email: true } });
    actorEmail = actor?.email ?? null;
  }
  return db.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorEmail,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadata: input.metadata,
    },
  });
}
