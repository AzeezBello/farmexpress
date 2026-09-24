import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { auth, roles } from '../middleware/auth.js';

const router = Router();
router.use(auth, roles('ADMIN'));
const usersQuery = z.object({ role: z.enum(['FARMER', 'BUYER', 'INDUSTRY', 'ADMIN']).optional(), kycStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() });
const kycSchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']) });
const userSelect = { id: true, name: true, email: true, role: true, kycStatus: true, businessName: true, farmLocation: true, createdAt: true } as const;
const PAID_STATUSES = ['PAID', 'CONFIRMED', 'SHIPPED', 'DELIVERED'] as const;

router.get('/users', async (req, res) => {
  const { role, kycStatus } = usersQuery.parse(req.query);
  res.json(await prisma.user.findMany({ where: { role, kycStatus }, select: userSelect, orderBy: { createdAt: 'desc' }, take: 500 }));
});

router.put('/users/:id/kyc', async (req, res) => {
  const { status } = kycSchema.parse(req.body);
  res.json(await prisma.user.update({ where: { id: req.params.id }, data: { kycStatus: status }, select: userSelect }));
});

router.get('/analytics', async (_, res) => {
  const [users, farmers, pendingKyc, products, orders, pendingOrders, revenue, refundsDue] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'FARMER' } }),
    prisma.user.count({ where: { role: { in: ['FARMER', 'INDUSTRY'] }, kycStatus: 'PENDING' } }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.count({ where: { status: { not: 'CANCELLED' } } }),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.aggregate({ where: { status: { in: [...PAID_STATUSES] } }, _sum: { totalPrice: true } }),
    prisma.payment.count({ where: { status: 'SUCCESSFUL', order: { status: 'CANCELLED' } } }),
  ]);
  res.json({ users, farmers, pendingKyc, products, orders, pendingOrders, revenue: Number(revenue._sum.totalPrice ?? 0), refundsDue });
});

export default router;
