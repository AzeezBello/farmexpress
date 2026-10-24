import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { param } from '../lib/http.js';
import { parsePagination, setPaginationHeaders } from '../lib/pagination.js';
import { auth, roles, type AuthRequest } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { notifyUser } from '../services/notifications.js';

const router = Router();
router.use(auth, roles('ADMIN'));
const usersQuery = z.object({
  role: z.enum(['FARMER', 'BUYER', 'INDUSTRY', 'ADMIN']).optional(),
  kycStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  search: z.string().trim().max(100).optional(),
});
const kycSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  note: z.string().trim().max(400).optional().transform((v) => v || null),
});
const auditQuery = z.object({
  action: z.string().trim().max(64).optional(),
  targetType: z.enum(['USER', 'ORDER', 'PRODUCT', 'PAYMENT']).optional(),
});
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  kycStatus: true,
  businessName: true,
  farmLocation: true,
  kycDocumentType: true,
  kycDocumentUrl: true,
  kycSubmittedAt: true,
  kycNote: true,
  createdAt: true,
} as const;
const PAID_STATUSES = ['PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED'] as const;

router.get('/users', async (req, res) => {
  const { role, kycStatus, search } = usersQuery.parse(req.query);
  const { page, limit, skip } = parsePagination(req.query, 200);
  const where: Prisma.UserWhereInput = {
    role,
    kycStatus,
    OR: search
      ? [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { businessName: { contains: search, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, skip, take: limit }),
  ]);
  setPaginationHeaders(res, { total, page, limit });
  res.json(items);
});

router.put('/users/:id/kyc', async (req: AuthRequest, res) => {
  const { status, note } = kycSchema.parse(req.body);
  const targetId = param(req);
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { kycStatus: status, kycNote: note ?? null },
    select: userSelect,
  });

  await recordAudit({
    actorId: req.user!.id,
    action: 'USER_KYC_UPDATED',
    targetType: 'USER',
    targetId: updated.id,
    summary: `${updated.name} (${updated.email}) KYC marked ${status.toLowerCase()}${note ? ` — "${note}"` : ''}`,
    metadata: { status, note: note ?? null },
  });

  await notifyUser({
    userId: updated.id,
    type: 'KYC_UPDATED',
    title: status === 'APPROVED' ? 'Account verification approved!' : status === 'REJECTED' ? 'Verification needs attention' : 'Verification status updated',
    body:
      status === 'APPROVED'
        ? 'Your account has been verified. You now have full access to list produce and trade on FarmExpress.'
        : status === 'REJECTED'
          ? `Your verification could not be approved${note ? `: ${note}` : '.'} Please upload an updated document in your profile.`
          : 'Your account verification is currently pending review.',
  });

  res.json(updated);
});

router.get('/audit-logs', async (req, res) => {
  const { action, targetType } = auditQuery.parse(req.query);
  const { page, limit, skip } = parsePagination(req.query, 25);
  const where: Prisma.AuditLogWhereInput = {
    action: action || undefined,
    targetType: targetType || undefined,
  };
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ]);
  const meta = setPaginationHeaders(res, { total, page, limit });
  res.json({ items, ...meta });
});

router.get('/analytics', async (_, res) => {
  const [users, farmers, pendingKyc, products, orders, pendingOrders, revenue, refundsDue, refundedCount, auditLogs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'FARMER' } }),
    prisma.user.count({ where: { role: { in: ['FARMER', 'INDUSTRY'] }, kycStatus: 'PENDING' } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { status: { not: 'CANCELLED' } } }),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.aggregate({ where: { status: { in: [...PAID_STATUSES] } }, _sum: { totalPrice: true } }),
    prisma.payment.count({ where: { status: 'SUCCESSFUL', order: { status: 'CANCELLED' } } }),
    prisma.payment.count({ where: { status: 'REFUNDED' } }),
    prisma.auditLog.count(),
  ]);
  res.json({
    users,
    farmers,
    pendingKyc,
    products,
    orders,
    pendingOrders,
    revenue: Number(revenue._sum.totalPrice ?? 0),
    refundsDue,
    refundedCount,
    auditLogs,
  });
});

export default router;
